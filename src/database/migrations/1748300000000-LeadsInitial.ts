import { MigrationInterface, QueryRunner } from 'typeorm'

const NEW_PERMISSIONS = [
  {
    key: 'campaigns.manage',
    module: 'leads',
    description: 'Crear y editar campañas de captura',
  },
  {
    key: 'leads.read',
    module: 'leads',
    description: 'Ver capturas y leads del sistema',
  },
  {
    key: 'analytics.read',
    module: 'analytics',
    description: 'Ver dashboard analítico de leads',
  },
]

export class LeadsInitial1748300000000 implements MigrationInterface {
  name = 'LeadsInitial1748300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" character varying(120) NOT NULL,
        "name" character varying(200) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "param_definitions" jsonb NOT NULL DEFAULT '[]',
        "entry_rules" jsonb NOT NULL DEFAULT '[]',
        "flow_definition" jsonb NOT NULL DEFAULT '{}',
        "status_definitions" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaigns_slug" UNIQUE ("slug")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "lead_captures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "folio" character varying(12) NOT NULL,
        "campaign_id" uuid NOT NULL,
        "captured_params" jsonb NOT NULL DEFAULT '{}',
        "resolved_intent" character varying(120),
        "resolved_message" text NOT NULL,
        "entry_node_id" character varying(100),
        "initial_context" jsonb NOT NULL DEFAULT '{}',
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lead_captures" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lead_captures_folio" UNIQUE ("folio"),
        CONSTRAINT "FK_lead_captures_campaign" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(
      `CREATE INDEX "IDX_lead_captures_campaign_created" ON "lead_captures" ("campaign_id", "created_at")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_lead_captures_status" ON "lead_captures" ("status")`
    )

    for (const perm of NEW_PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "module", "description")
         VALUES ($1, $2, $3)
         ON CONFLICT ("key") DO NOTHING`,
        [perm.key, perm.module, perm.description]
      )
    }

    const superAdminRows = (await queryRunner.query(
      `SELECT id FROM "roles" WHERE slug = 'super-admin' LIMIT 1`
    )) as { id: string }[]

    const superAdminId = superAdminRows[0]?.id
    if (superAdminId) {
      const permissionRows = (await queryRunner.query(
        `SELECT id, key FROM "permissions" WHERE key = ANY($1)`,
        [NEW_PERMISSIONS.map((p) => p.key)]
      )) as { id: string; key: string }[]

      for (const row of permissionRows) {
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id")
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [superAdminId, row.id]
        )
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "lead_captures"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`)

    for (const perm of NEW_PERMISSIONS) {
      await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [perm.key])
    }
  }
}

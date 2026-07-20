import { MigrationInterface, QueryRunner } from 'typeorm'

const P4_PERMISSIONS = [
  {
    key: 'leads.reassign',
    module: 'leads',
    description: 'Reasignar leads y conversaciones a otros ejecutivos',
  },
]

export class LeadsExecutiveP41748600000000 implements MigrationInterface {
  name = 'LeadsExecutiveP41748600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_executives" (
        "campaign_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "priority" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_campaign_executives" PRIMARY KEY ("campaign_id", "user_id"),
        CONSTRAINT "FK_campaign_executives_campaign" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_executives_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_executives_user" ON "campaign_executives" ("user_id")
    `)

    for (const permission of P4_PERMISSIONS) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("key", "module", "description")
        VALUES ($1, $2, $3)
        ON CONFLICT ("key") DO NOTHING
      `,
        [permission.key, permission.module, permission.description]
      )
    }

    const superAdminRole = await queryRunner.query(
      `SELECT id FROM "roles" WHERE slug = 'super-admin' LIMIT 1`
    )
    const superAdminRoleId = superAdminRole[0]?.id as string | undefined

    if (superAdminRoleId) {
      for (const permission of P4_PERMISSIONS) {
        const rows = await queryRunner.query(
          `SELECT id FROM "permissions" WHERE key = $1 LIMIT 1`,
          [permission.key]
        )
        const permissionId = rows[0]?.id as string | undefined
        if (!permissionId) continue

        await queryRunner.query(
          `
          INSERT INTO "role_permissions" ("role_id", "permission_id")
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
          [superAdminRoleId, permissionId]
        )
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const permission of P4_PERMISSIONS) {
      await queryRunner.query(
        `
        DELETE FROM "role_permissions"
        WHERE permission_id IN (SELECT id FROM "permissions" WHERE key = $1)
      `,
        [permission.key]
      )
      await queryRunner.query(`DELETE FROM "permissions" WHERE key = $1`, [
        permission.key,
      ])
    }

    await queryRunner.query(`DROP TABLE "campaign_executives"`)
  }
}

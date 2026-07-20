import { MigrationInterface, QueryRunner } from 'typeorm'

const P2_PERMISSIONS = [
  {
    key: 'leads.assignable',
    module: 'leads',
    description: 'Puede recibir leads asignados automáticamente',
  },
  {
    key: 'leads.inbox.assigned',
    module: 'leads',
    description: 'Ver en inbox solo conversaciones asignadas',
  },
]

export class LeadsFlowInitial1748400000000 implements MigrationInterface {
  name = 'LeadsFlowInitial1748400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_leads" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contact_id" uuid NOT NULL,
        "campaign_id" uuid NOT NULL,
        "lead_capture_id" uuid,
        "status_key" character varying(80) NOT NULL DEFAULT 'nuevo',
        "resolved_intent" character varying(120),
        "context" jsonb NOT NULL DEFAULT '{}',
        "assignee_user_id" uuid,
        "is_successful" boolean NOT NULL DEFAULT false,
        "success_at" TIMESTAMP WITH TIME ZONE,
        "assigned_at" TIMESTAMP WITH TIME ZONE,
        "enrolled_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "closed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaign_leads" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_campaign_leads_contact_campaign" UNIQUE ("contact_id", "campaign_id"),
        CONSTRAINT "FK_campaign_leads_contact" FOREIGN KEY ("contact_id") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_leads_campaign" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_leads_capture" FOREIGN KEY ("lead_capture_id") REFERENCES "lead_captures"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_campaign_leads_assignee" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "lead_flow_states" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_lead_id" uuid NOT NULL,
        "current_node_id" character varying(100) NOT NULL,
        "context" jsonb NOT NULL DEFAULT '{}',
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "last_interaction_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lead_flow_states" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lead_flow_states_campaign_lead" UNIQUE ("campaign_lead_id"),
        CONSTRAINT "FK_lead_flow_states_campaign_lead" FOREIGN KEY ("campaign_lead_id") REFERENCES "campaign_leads"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "assignment_rule_sets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "key" character varying(80) NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "is_active" boolean NOT NULL DEFAULT true,
        "rules" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_assignment_rule_sets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_assignment_rule_sets_campaign" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_assignment_rule_sets_campaign_key_version"
      ON "assignment_rule_sets" ("campaign_id", "key", "version")
    `)

    await queryRunner.query(`
      CREATE TABLE "user_lead_profiles" (
        "user_id" uuid NOT NULL,
        "segments" jsonb NOT NULL DEFAULT '[]',
        "is_accepting_leads" boolean NOT NULL DEFAULT true,
        "max_active_leads" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_lead_profiles" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_user_lead_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      ALTER TABLE "whatsapp_conversations"
      ADD COLUMN "assignee_user_id" uuid,
      ADD CONSTRAINT "FK_whatsapp_conversations_assignee"
        FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `)

    await queryRunner.query(`
      ALTER TABLE "whatsapp_messages"
      ADD COLUMN "metadata" jsonb NOT NULL DEFAULT '{}'
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_leads_assignee" ON "campaign_leads" ("assignee_user_id")
    `)
    await queryRunner.query(`
      CREATE INDEX "IDX_campaign_leads_campaign_status" ON "campaign_leads" ("campaign_id", "status_key")
    `)
    await queryRunner.query(`
      CREATE INDEX "IDX_whatsapp_conversations_assignee" ON "whatsapp_conversations" ("assignee_user_id")
    `)

    await queryRunner.query(`
      ALTER TABLE "lead_captures"
      ADD COLUMN "campaign_lead_id" uuid,
      ADD CONSTRAINT "FK_lead_captures_campaign_lead"
        FOREIGN KEY ("campaign_lead_id") REFERENCES "campaign_leads"("id") ON DELETE SET NULL
    `)

    for (const perm of P2_PERMISSIONS) {
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
        `SELECT id FROM "permissions" WHERE key = ANY($1)`,
        [P2_PERMISSIONS.map((p) => p.key)]
      )) as { id: string }[]

      for (const row of permissionRows) {
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id")
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [superAdminId, row.id]
        )
      }
    }

    await queryRunner.query(
      `INSERT INTO "roles" ("name", "slug", "description", "is_system")
       VALUES ($1, $2, $3, true)
       ON CONFLICT ("slug") DO NOTHING`,
      [
        'Ejecutivo de Leads',
        'lead-executive',
        'Recibe leads asignados y atiende conversaciones propias',
      ]
    )

    const leadExecutiveRows = (await queryRunner.query(
      `SELECT id FROM "roles" WHERE slug = 'lead-executive' LIMIT 1`
    )) as { id: string }[]

    const leadExecutiveId = leadExecutiveRows[0]?.id
    if (leadExecutiveId) {
      const keys = [
        'whatsapp.conversations.read',
        'whatsapp.messages.send',
        'leads.assignable',
        'leads.inbox.assigned',
      ]
      const permissionRows = (await queryRunner.query(
        `SELECT id FROM "permissions" WHERE key = ANY($1)`,
        [keys]
      )) as { id: string }[]

      for (const row of permissionRows) {
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id")
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [leadExecutiveId, row.id]
        )
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lead_captures" DROP CONSTRAINT IF EXISTS "FK_lead_captures_campaign_lead"`
    )
    await queryRunner.query(
      `ALTER TABLE "lead_captures" DROP COLUMN IF EXISTS "campaign_lead_id"`
    )
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" DROP COLUMN IF EXISTS "metadata"`
    )
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP CONSTRAINT IF EXISTS "FK_whatsapp_conversations_assignee"`
    )
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP COLUMN IF EXISTS "assignee_user_id"`
    )
    await queryRunner.query(`DROP TABLE IF EXISTS "user_lead_profiles"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "assignment_rule_sets"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "lead_flow_states"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_leads"`)

    for (const perm of P2_PERMISSIONS) {
      await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [perm.key])
    }

    await queryRunner.query(`DELETE FROM "roles" WHERE slug = 'lead-executive'`)
  }
}

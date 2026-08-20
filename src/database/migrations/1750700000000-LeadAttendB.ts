import { MigrationInterface, QueryRunner } from 'typeorm'
import { PERMISSIONS, PERMISSION_CATALOG, SUPER_ADMIN_ROLE_SLUG } from '../../shared/rbac/permissions.catalog'

const SYSTEM_ROLE_SLUGS = [SUPER_ADMIN_ROLE_SLUG, 'general-admin']
const NEW_KEYS = [PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_REASSIGN, PERMISSIONS.LEADS_CHANGE_STATUS]

export class LeadAttendB1750700000000 implements MigrationInterface {
  name = 'LeadAttendB1750700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lead_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "lead_id" uuid NOT NULL,
        "type" varchar(40) NOT NULL,
        "from_value" varchar(60),
        "to_value" varchar(60),
        "reason" text,
        "milestone_kind" varchar(40),
        "actor_user_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_lead_events_lead" FOREIGN KEY ("lead_id") REFERENCES "campaign_leads"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`CREATE INDEX "idx_lead_events_lead_created" ON "lead_events" ("lead_id", "created_at" DESC)`)

    for (const key of NEW_KEYS) {
      const perm = PERMISSION_CATALOG.find((p) => p.key === key)
      if (!perm) continue
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3) ON CONFLICT ("key") DO NOTHING`,
        [perm.key, perm.module, perm.description]
      )
      const rows = (await queryRunner.query(`SELECT id FROM "permissions" WHERE key = $1`, [key])) as { id: string }[]
      const permId = rows[0]?.id
      if (!permId) continue
      for (const slug of SYSTEM_ROLE_SLUGS) {
        const roleRows = (await queryRunner.query(`SELECT id FROM "roles" WHERE slug = '${slug}'`)) as { id: string }[]
        const roleId = roleRows[0]?.id
        if (!roleId) continue
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ('${roleId}', '${permId}') ON CONFLICT DO NOTHING`
        )
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lead_events_lead_created"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "lead_events"`)
    for (const key of NEW_KEYS) {
      await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [key])
    }
  }
}
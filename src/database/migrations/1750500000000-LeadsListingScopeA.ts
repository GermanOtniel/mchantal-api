import { MigrationInterface, QueryRunner } from 'typeorm'
import { PERMISSION_CATALOG, SUPER_ADMIN_ROLE_SLUG } from '../../shared/rbac/permissions.catalog'
import { LEAD_STATUSES } from '../../modules/leads/types/leads.types'

const SYSTEM_ROLE_SLUGS = [SUPER_ADMIN_ROLE_SLUG, 'general-admin']

export class LeadsListingScopeA1750500000000 implements MigrationInterface {
  name = 'LeadsListingScopeA1750500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaign_leads"
      ADD COLUMN "status" character varying(20) NOT NULL DEFAULT 'new'
    `)
    await queryRunner.query(`
      ALTER TABLE "campaign_leads"
      ADD CONSTRAINT "CK_campaign_leads_status" CHECK ("status" IN (${LEAD_STATUSES.map((s) => `'${s}'`).join(', ')}))
    `)

    await queryRunner.query(`
      ALTER TABLE "whatsapp_conversations"
      ADD COLUMN "needs_reply_cleared_at" TIMESTAMP WITH TIME ZONE NULL
    `)

    // Permisos nuevos (idempotente: salta los ya existentes)
    for (const perm of PERMISSION_CATALOG) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3) ON CONFLICT ("key") DO NOTHING`,
        [perm.key, perm.module, perm.description]
      )
    }

    const permissionRows = (await queryRunner.query(
      `SELECT id, key FROM "permissions"`
    )) as { id: string; key: string }[]
    const permissionIdByKey = new Map(permissionRows.map((r) => [r.key, r.id]))

    for (const slug of SYSTEM_ROLE_SLUGS) {
      const roleRows = (await queryRunner.query(
        `SELECT id FROM "roles" WHERE slug = '${slug}'`
      )) as { id: string }[]
      const roleId = roleRows[0]?.id
      if (!roleId) continue
      for (const perm of PERMISSION_CATALOG) {
        const permissionId = permissionIdByKey.get(perm.key)
        if (!permissionId) continue
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ('${roleId}', '${permissionId}') ON CONFLICT DO NOTHING`
        )
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "whatsapp_conversations" DROP COLUMN IF EXISTS "needs_reply_cleared_at"`)
    await queryRunner.query(`ALTER TABLE "campaign_leads" DROP CONSTRAINT IF EXISTS "CK_campaign_leads_status"`)
    await queryRunner.query(`ALTER TABLE "campaign_leads" DROP COLUMN IF EXISTS "status"`)
    // Nota: no borramos filas de permissions/role_permissions sembradas (podrían estar asignadas a roles custom).
  }
}
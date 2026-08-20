import { MigrationInterface, QueryRunner } from 'typeorm'
import {
  PERMISSIONS,
  PERMISSION_CATALOG,
  SUPER_ADMIN_ROLE_SLUG,
} from '../../shared/rbac/permissions.catalog'

const SYSTEM_ROLE_SLUGS = [SUPER_ADMIN_ROLE_SLUG, 'general-admin']

/**
 * Añade el permiso dedicado `analytics.read` y lo concede a:
 *  - los roles de sistema (super-admin, general-admin), y
 *  - cualquier rol que ya tenga `leads.read.all` (preserva el acceso actual al
 *    dashboard, que antes se gateaba con leads.read.all).
 */
export class AnalyticsReadPermission1750900000000 implements MigrationInterface {
  name = 'AnalyticsReadPermission1750900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const perm = PERMISSION_CATALOG.find((p) => p.key === PERMISSIONS.ANALYTICS_READ)
    if (!perm) throw new Error('ANALYTICS_READ no definido en el catálogo')

    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3) ON CONFLICT ("key") DO NOTHING`,
      [perm.key, perm.module, perm.description]
    )

    const permRows = (await queryRunner.query(
      `SELECT id FROM "permissions" WHERE key = $1`,
      [perm.key]
    )) as { id: string }[]
    const permId = permRows[0]?.id
    if (!permId) return

    // 1) Roles de sistema.
    for (const slug of SYSTEM_ROLE_SLUGS) {
      const roleRows = (await queryRunner.query(
        `SELECT id FROM "roles" WHERE slug = $1`,
        [slug]
      )) as { id: string }[]
      const roleId = roleRows[0]?.id
      if (!roleId) continue
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, permId]
      )
    }

    // 2) Cualquier rol que ya tenga leads.read.all (preserva acceso al dashboard).
    const inheritorRoles = (await queryRunner.query(
      `SELECT DISTINCT r.id AS role_id
         FROM "roles" r
         JOIN "role_permissions" rp ON rp.role_id = r.id
         JOIN "permissions" p ON p.id = rp.permission_id
        WHERE p.key = $1`,
      [PERMISSIONS.LEADS_READ_ALL]
    )) as { role_id: string }[]
    for (const row of inheritorRoles) {
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [row.role_id, permId]
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [
      PERMISSIONS.ANALYTICS_READ,
    ])
  }
}
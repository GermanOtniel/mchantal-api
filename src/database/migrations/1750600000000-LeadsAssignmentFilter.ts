import { MigrationInterface, QueryRunner } from 'typeorm'
import { PERMISSION_CATALOG, SUPER_ADMIN_ROLE_SLUG } from '../../shared/rbac/permissions.catalog'

const SYSTEM_ROLE_SLUGS = [SUPER_ADMIN_ROLE_SLUG, 'general-admin']
const ASSIGNMENT_KEY = 'leads.filter.assignment'
const DEPRECATED_KEY = 'leads.filter.executive'

export class LeadsAssignmentFilter1750600000000 implements MigrationInterface {
  name = 'LeadsAssignmentFilter1750600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Siembra el permiso nuevo (idempotente)
    const perm = PERMISSION_CATALOG.find((p) => p.key === ASSIGNMENT_KEY)
    if (perm) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3) ON CONFLICT ("key") DO NOTHING`,
        [perm.key, perm.module, perm.description]
      )
    }

    // Asigna el permiso nuevo a los roles sistema (idempotente)
    const permRows = (await queryRunner.query(
      `SELECT id FROM "permissions" WHERE key = $1`,
      [ASSIGNMENT_KEY]
    )) as { id: string }[]
    const assignmentPermId = permRows[0]?.id
    if (assignmentPermId) {
      for (const slug of SYSTEM_ROLE_SLUGS) {
        const roleRows = (await queryRunner.query(
          `SELECT id FROM "roles" WHERE slug = '${slug}'`
        )) as { id: string }[]
        const roleId = roleRows[0]?.id
        if (!roleId) continue
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ('${roleId}', '${assignmentPermId}') ON CONFLICT DO NOTHING`
        )
      }
    }

    // Elimina el permiso deprecado (CASCADE limpia role_permissions)
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [DEPRECATED_KEY])
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-siembra el permiso deprecado
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3) ON CONFLICT ("key") DO NOTHING`,
      [DEPRECATED_KEY, 'leads', 'Filtrar listado de leads por ejecutivo']
    )
    // Elimina el permiso nuevo (CASCADE)
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [ASSIGNMENT_KEY])
  }
}
import { MigrationInterface, QueryRunner } from 'typeorm'

const NEW_PERMISSION = {
  key: 'matcher_dictionaries.read',
  module: 'leads',
  description: 'Ver diccionarios de matchers (necesario para definir cobertura de ejecutivos)',
}

export class MatcherDictionariesReadPermission1751500000000 implements MigrationInterface {
  name = 'MatcherDictionariesReadPermission1751500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Insertar el nuevo permiso (matcher_dictionaries.read).
    //    ON CONFLICT DO UPDATE ... RETURNING id: devuelve el id tanto si se insertó
    //    como si ya existía. Puede existir si RbacInitial ya lo sembró leyendo el
    //    catálogo actual (PERMISSION_CATALOG), lo que ocurre al aplicar todas las
    //    migraciones desde cero en una DB virgen. Así la migración es idempotente.
    const inserted = (await queryRunner.query(
      `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3)
       ON CONFLICT ("key") DO UPDATE SET
         "module" = EXCLUDED."module",
         "description" = EXCLUDED."description"
       RETURNING id`,
      [NEW_PERMISSION.key, NEW_PERMISSION.module, NEW_PERMISSION.description]
    )) as { id: string }[]

    const newPermissionId = inserted[0]?.id
    if (!newPermissionId) return

    // 2) Linkearlo a los roles del sistema (super-admin, general-admin)
    const systemRoles = (await queryRunner.query(
      `SELECT id FROM "roles" WHERE slug IN ('super-admin', 'general-admin')`
    )) as { id: string }[]

    for (const role of systemRoles) {
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [role.id, newPermissionId]
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ON DELETE CASCADE limpia role_permissions automáticamente
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" = $1`,
      [NEW_PERMISSION.key]
    )
  }
}
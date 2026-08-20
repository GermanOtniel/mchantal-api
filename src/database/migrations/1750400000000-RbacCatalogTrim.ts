import { MigrationInterface, QueryRunner } from 'typeorm'

const NEW_PERMISSION = {
  key: 'matcher_dictionaries.manage',
  module: 'leads',
  description: 'Crear y editar diccionarios de matchers',
}

// Permisos que se eliminan (no gatean nada en main hoy; se re-añadirán con su feature).
const REMOVED_KEYS = [
  'analytics.read',
  'whatsapp.conversations.read',
  'whatsapp.messages.send',
  'leads.assignable',
  'leads.inbox.assigned',
  'leads.reassign',
]

// Para el down: los permisos que se eliminan con su definición original.
const REMOVED_DEFINITIONS = [
  { key: 'analytics.read', module: 'analytics', description: 'Ver dashboard analítico de leads' },
  { key: 'whatsapp.conversations.read', module: 'whatsapp', description: 'Ver conversaciones y mensajes de WhatsApp' },
  { key: 'whatsapp.messages.send', module: 'whatsapp', description: 'Enviar mensajes de WhatsApp' },
  { key: 'leads.assignable', module: 'leads', description: 'Puede recibir leads asignados automáticamente' },
  { key: 'leads.inbox.assigned', module: 'leads', description: 'Ver en inbox solo conversaciones asignadas' },
  { key: 'leads.reassign', module: 'leads', description: 'Reasignar leads y conversaciones a otros ejecutivos' },
]

export class RbacCatalogTrim1750400000000 implements MigrationInterface {
  name = 'RbacCatalogTrim1750400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Insertar el nuevo permiso (matcher_dictionaries.manage).
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

    // 2) Linkearlo a los roles del sistema (super-admin, general-admin)
    if (newPermissionId) {
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

    // 3) Eliminar los permisos que no se usan (ON DELETE CASCADE limpia role_permissions)
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" = ANY($1::text[])`,
      [REMOVED_KEYS]
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-insertar los permisos eliminados
    for (const perm of REMOVED_DEFINITIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [perm.key, perm.module, perm.description]
      )
    }
    // Re-linkearlos a los roles del sistema
    const systemRoles = (await queryRunner.query(
      `SELECT id FROM "roles" WHERE slug IN ('super-admin', 'general-admin')`
    )) as { id: string }[]
    const restored = (await queryRunner.query(
      `SELECT id, key FROM "permissions" WHERE "key" = ANY($1::text[])`,
      [REMOVED_KEYS]
    )) as { id: string; key: string }[]
    for (const role of systemRoles) {
      for (const perm of restored) {
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [role.id, perm.id]
        )
      }
    }
    // Eliminar el permiso nuevo
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = $1`, [
      NEW_PERMISSION.key,
    ])
  }
}
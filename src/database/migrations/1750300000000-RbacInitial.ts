import { MigrationInterface, QueryRunner } from 'typeorm'
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
} from '../../shared/rbac/permissions.catalog'

export class RbacInitial1750300000000 implements MigrationInterface {
  name = 'RbacInitial1750300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "key" character varying(100) NOT NULL,
        "module" character varying(50) NOT NULL,
        "description" character varying(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_key" UNIQUE ("key")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "description" character varying(255),
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_slug" UNIQUE ("slug")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "FK_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("user_id", "role_id"),
        CONSTRAINT "FK_user_roles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_roles_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(
      `CREATE INDEX "IDX_user_roles_user_id" ON "user_roles" ("user_id")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_user_roles_role_id" ON "user_roles" ("role_id")`
    )

    for (const perm of PERMISSION_CATALOG) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3)`,
        [perm.key, perm.module, perm.description]
      )
    }

    const permissionRows = (await queryRunner.query(
      `SELECT id, key FROM "permissions"`
    )) as { id: string; key: string }[]

    const permissionIdByKey = new Map(
      permissionRows.map((row) => [row.key, row.id])
    )

    for (const roleDef of Object.values(SYSTEM_ROLES)) {
      const roleRows = (await queryRunner.query(
        `INSERT INTO "roles" ("name", "slug", "description", "is_system")
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [roleDef.name, roleDef.slug, roleDef.description]
      )) as { id: string }[]

      const roleId = roleRows[0]?.id
      if (!roleId) continue

      for (const key of roleDef.permissionKeys) {
        const permissionId = permissionIdByKey.get(key)
        if (!permissionId) continue
        await queryRunner.query(
          `INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES ($1, $2)`,
          [roleId, permissionId]
        )
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`)
  }
}

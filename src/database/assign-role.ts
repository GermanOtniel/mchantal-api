import 'reflect-metadata'
import * as dotenv from 'dotenv'

dotenv.config()

import { AppDataSource } from './data-source'
import { PermissionService } from '../modules/rbac/services/permission.service'
import { RoleService } from '../modules/rbac/services/role.service'

async function main() {
  const [, , roleSlug, email] = process.argv

  if (!roleSlug || !email) {
    console.error('Uso: npm run rbac:assign-role -- <role-slug> <email>')
    console.error('Ejemplo: npm run rbac:assign-role -- super-admin admin@tuempresa.com')
    process.exit(1)
  }

  await AppDataSource.initialize()

  const permissionService = new PermissionService()
  const roleService = new RoleService(permissionService)

  await roleService.assignRoleToUserBySlug(email, roleSlug)

  console.log(`Rol "${roleSlug}" asignado a ${email}`)
  await AppDataSource.destroy()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

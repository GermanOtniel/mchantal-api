import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requireAnyPermission,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { HttpError } from '../../auth/http-error'
import { RbacController } from '../controllers/rbac.controller'
import {
  CreateRoleBodySchema,
  ErrorResponseSchema,
  PermissionsListResponseSchema,
  RoleIdParamsSchema,
  RoleResponseSchema,
  RolesListResponseSchema,
  SetRolePermissionsBodySchema,
  SetUserRolesBodySchema,
  UpdateRoleBodySchema,
  UserIdParamsSchema,
  UserRolesResponseSchema,
  UsersListResponseSchema,
} from '../schemas/rbac.schemas'
import { PermissionService } from '../services/permission.service'
import { RoleService, UserRoleService } from '../services/role.service'

export const rbacPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const permissionService = new PermissionService()
  const roleService = new RoleService(permissionService)
  const userRoleService = new UserRoleService(permissionService)
  const controller = new RbacController(permissionService, roleService, userRoleService)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      })
    }
    throw error
  })

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/permissions',
    {
      preHandler: requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: {
        response: {
          200: PermissionsListResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listPermissions
  )

  app.get(
    '/roles',
    {
      preHandler: requireAnyPermission(PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE),
      schema: {
        response: {
          200: RolesListResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listRoles
  )

  app.get(
    '/roles/:id',
    {
      preHandler: requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: {
        params: RoleIdParamsSchema,
        response: {
          200: RoleResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.getRole
  )

  app.post(
    '/roles',
    {
      preHandler: requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: {
        body: CreateRoleBodySchema,
        response: {
          201: RoleResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    controller.createRole
  )

  app.patch(
    '/roles/:id',
    {
      preHandler: requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: {
        params: RoleIdParamsSchema,
        body: UpdateRoleBodySchema,
        response: {
          200: RoleResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.updateRole
  )

  app.delete(
    '/roles/:id',
    {
      preHandler: requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: {
        params: RoleIdParamsSchema,
        response: {
          204: { type: 'null' },
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.deleteRole
  )

  app.put(
    '/roles/:id/permissions',
    {
      preHandler: requirePermission(PERMISSIONS.ROLES_MANAGE),
      schema: {
        params: RoleIdParamsSchema,
        body: SetRolePermissionsBodySchema,
        response: {
          200: RoleResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.setRolePermissions
  )

  app.get(
    '/users',
    {
      preHandler: requirePermission(PERMISSIONS.USERS_MANAGE),
      schema: {
        response: {
          200: UsersListResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listUsers
  )

  app.get(
    '/users/:id/roles',
    {
      preHandler: requirePermission(PERMISSIONS.USERS_MANAGE),
      schema: {
        params: UserIdParamsSchema,
        response: {
          200: UserRolesResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.getUserRoles
  )

  app.put(
    '/users/:id/roles',
    {
      preHandler: requirePermission(PERMISSIONS.USERS_MANAGE),
      schema: {
        params: UserIdParamsSchema,
        body: SetUserRolesBodySchema,
        response: {
          200: UserRolesResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.setUserRoles
  )
}
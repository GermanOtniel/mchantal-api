import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from '@sinclair/typebox'
import { HttpError } from '../../auth/http-error'
import { SUPER_ADMIN_ROLE_SLUG } from '../../../shared/rbac/permissions.catalog'
import type { PermissionService } from '../services/permission.service'
import type { RoleService, UserRoleService } from '../services/role.service'
import {
  CreateRoleBodySchema,
  RoleIdParamsSchema,
  SetRolePermissionsBodySchema,
  SetUserRolesBodySchema,
  UpdateRoleBodySchema,
  UserIdParamsSchema,
} from '../schemas/rbac.schemas'

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.status(err.statusCode).send({
      error: err.message,
      code: err.code,
    })
  }
  throw err
}

export class RbacController {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly roleService: RoleService,
    private readonly userRoleService: UserRoleService
  ) {}

  listPermissions = async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const permissions = await this.permissionService.listAllPermissions()
      return reply.send({ permissions })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  listRoles = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      let roles = await this.roleService.listRoles()

      if (request.user?.sub) {
        const canAssignSuperAdmin = await this.permissionService.canAssignSuperAdminRole(
          request.user.sub
        )
        if (!canAssignSuperAdmin) {
          roles = roles.filter((role) => role.slug !== SUPER_ADMIN_ROLE_SLUG)
        }
      }

      return reply.send({ roles })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  getRole = async (
    request: FastifyRequest<{ Params: Static<typeof RoleIdParamsSchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const role = await this.roleService.getRoleById(request.params.id)
      return reply.send({ role })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  createRole = async (
    request: FastifyRequest<{ Body: Static<typeof CreateRoleBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const role = await this.roleService.createRole(request.body)
      return reply.status(201).send({ role })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  updateRole = async (
    request: FastifyRequest<{
      Params: Static<typeof RoleIdParamsSchema>
      Body: Static<typeof UpdateRoleBodySchema>
    }>,
    reply: FastifyReply
  ) => {
    try {
      const role = await this.roleService.updateRole(request.params.id, request.body)
      return reply.send({ role })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  deleteRole = async (
    request: FastifyRequest<{ Params: Static<typeof RoleIdParamsSchema> }>,
    reply: FastifyReply
  ) => {
    try {
      await this.roleService.deleteRole(request.params.id)
      return reply.status(204).send()
    } catch (e) {
      return handleError(reply, e)
    }
  }

  setRolePermissions = async (
    request: FastifyRequest<{
      Params: Static<typeof RoleIdParamsSchema>
      Body: Static<typeof SetRolePermissionsBodySchema>
    }>,
    reply: FastifyReply
  ) => {
    try {
      const role = await this.roleService.setRolePermissions(
        request.params.id,
        request.body.permissionKeys
      )
      return reply.send({ role })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  listUsers = async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const users = await this.userRoleService.listUsersWithRoles()
      return reply.send({ users })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  getUserRoles = async (
    request: FastifyRequest<{ Params: Static<typeof UserIdParamsSchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const roles = await this.userRoleService.getUserRoles(request.params.id)
      return reply.send({
        roles: roles.map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
      })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  setUserRoles = async (
    request: FastifyRequest<{
      Params: Static<typeof UserIdParamsSchema>
      Body: Static<typeof SetUserRolesBodySchema>
    }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user?.sub) {
        throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED')
      }

      const roles = await this.userRoleService.setUserRoles(
        request.params.id,
        request.body.roleIds,
        request.user.sub
      )
      return reply.send({ roles })
    } catch (e) {
      return handleError(reply, e)
    }
  }
}

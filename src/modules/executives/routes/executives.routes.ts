import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { ExecutivesController } from '../controllers/executives.controller'
import { ExecutiveRepository } from '../repositories/executive.repository'
import {
  ErrorResponseSchema,
  ExecutiveListResponseSchema,
  ExecutiveResponseSchema,
  IdParamsSchema,
  UpdateExecutiveBodySchema,
} from '../schemas/executives.schemas'

export const executivesPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const repo = new ExecutiveRepository()
  const controller = new ExecutivesController(repo)

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/',
    {
      preHandler: requirePermission(PERMISSIONS.USERS_MANAGE),
      schema: { response: { 200: ExecutiveListResponseSchema } },
    },
    controller.list
  )

  app.patch(
    '/:id',
    {
      preHandler: requirePermission(PERMISSIONS.USERS_MANAGE),
      schema: {
        params: IdParamsSchema,
        body: UpdateExecutiveBodySchema,
        response: { 200: ExecutiveResponseSchema, 400: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    controller.update
  )
}
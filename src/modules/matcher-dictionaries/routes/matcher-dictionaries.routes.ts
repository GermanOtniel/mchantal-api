import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { MatcherDictionariesController } from '../controllers/matcher-dictionaries.controller'
import { MatcherDictionaryRepository } from '../repositories/matcher-dictionary.repository'
import { MatcherDictionaryService } from '../services/matcher-dictionary.service'
import {
  ClassifyBodySchema,
  ClassifyResponseSchema,
  CreateDictionaryBodySchema,
  DictionaryListResponseSchema,
  DictionaryResponseSchema,
  ErrorResponseSchema,
  IdParamsSchema,
  UpdateDictionaryBodySchema,
} from '../schemas/matcher-dictionaries.schemas'

export const matcherDictionariesPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const repo = new MatcherDictionaryRepository()
  const service = new MatcherDictionaryService(repo)
  const controller = new MatcherDictionariesController(service)

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/',
    {
      preHandler: requirePermission(PERMISSIONS.MATCHER_DICTIONARIES_MANAGE),
      schema: { response: { 200: DictionaryListResponseSchema } },
    },
    controller.list
  )

  app.get(
    '/:id',
    {
      preHandler: requirePermission(PERMISSIONS.MATCHER_DICTIONARIES_MANAGE),
      schema: { params: IdParamsSchema, response: { 200: DictionaryResponseSchema, 404: ErrorResponseSchema } },
    },
    controller.getById
  )

  app.post(
    '/',
    {
      preHandler: requirePermission(PERMISSIONS.MATCHER_DICTIONARIES_MANAGE),
      schema: {
        body: CreateDictionaryBodySchema,
        response: { 201: DictionaryResponseSchema, 400: ErrorResponseSchema, 409: ErrorResponseSchema },
      },
    },
    controller.create
  )

  app.patch(
    '/:id',
    {
      preHandler: requirePermission(PERMISSIONS.MATCHER_DICTIONARIES_MANAGE),
      schema: {
        params: IdParamsSchema,
        body: UpdateDictionaryBodySchema,
        response: {
          200: DictionaryResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    controller.update
  )

  app.post(
    '/:id/clone',
    {
      preHandler: requirePermission(PERMISSIONS.MATCHER_DICTIONARIES_MANAGE),
      schema: { params: IdParamsSchema, response: { 201: DictionaryResponseSchema, 404: ErrorResponseSchema } },
    },
    controller.clone
  )

  app.delete(
    '/:id',
    {
      preHandler: requirePermission(PERMISSIONS.MATCHER_DICTIONARIES_MANAGE),
      schema: { params: IdParamsSchema, response: { 204: {}, 403: ErrorResponseSchema, 404: ErrorResponseSchema } },
    },
    controller.remove
  )

  app.post(
    '/:id/classify',
    {
      preHandler: requirePermission(PERMISSIONS.MATCHER_DICTIONARIES_MANAGE),
      schema: {
        params: IdParamsSchema,
        body: ClassifyBodySchema,
        response: { 200: ClassifyResponseSchema, 404: ErrorResponseSchema },
      },
    },
    controller.classify
  )
}
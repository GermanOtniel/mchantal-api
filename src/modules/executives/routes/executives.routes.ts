import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { ExecutivesController } from '../controllers/executives.controller'
import { ExecutiveRepository } from '../repositories/executive.repository'
import {
  ErrorResponseSchema,
  ExecutiveListResponseSchema,
  ExecutiveResponseSchema,
  IdParamsSchema,
  UpdateExecutiveBodySchema,
} from '../schemas/executives.schemas'

// NOTE: endpoints sin auth en esta iteración; protección JWT entra después.
export const executivesPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const repo = new ExecutiveRepository()
  const controller = new ExecutivesController(repo)

  app.get(
    '/',
    { schema: { response: { 200: ExecutiveListResponseSchema } } },
    controller.list
  )

  app.patch(
    '/:id',
    {
      schema: {
        params: IdParamsSchema,
        body: UpdateExecutiveBodySchema,
        response: { 200: ExecutiveResponseSchema, 400: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    controller.update
  )
}
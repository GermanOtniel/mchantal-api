import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from '@sinclair/typebox'
import { HttpError } from '../../auth/http-error'
import type { MatcherDictionaryService } from '../services/matcher-dictionary.service'
import type { MatcherDictionaryData } from '../types/dictionary.types'
import {
  ClassifyBodySchema,
  CreateDictionaryBodySchema,
  UpdateDictionaryBodySchema,
} from '../schemas/matcher-dictionaries.schemas'

function toResponse(d: MatcherDictionaryData) {
  return { id: d.id, slug: d.slug, name: d.name, categories: d.categories, isSystem: d.isSystem }
}

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ code: err.code, message: err.message, details: err.details })
  }
  throw err
}

export class MatcherDictionariesController {
  constructor(private readonly service: MatcherDictionaryService) {}

  list = async (_req: FastifyRequest, reply: FastifyReply) => {
    const dictionaries = await this.service.listAll()
    return reply.send({ dictionaries: dictionaries.map(toResponse) })
  }

  getById = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const d = await this.service.findById(req.params.id)
      if (!d) throw new HttpError('Diccionario no encontrado', 404, 'DICTIONARY_NOT_FOUND')
      return reply.send(toResponse(d))
    } catch (e) {
      return handleError(reply, e)
    }
  }

  create = async (
    req: FastifyRequest<{ Body: Static<typeof CreateDictionaryBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      return reply.code(201).send(toResponse(await this.service.create(req.body)))
    } catch (e) {
      return handleError(reply, e)
    }
  }

  update = async (
    req: FastifyRequest<{
      Params: { id: string }
      Body: Static<typeof UpdateDictionaryBodySchema>
    }>,
    reply: FastifyReply
  ) => {
    try {
      return reply.send(toResponse(await this.service.update(req.params.id, req.body)))
    } catch (e) {
      return handleError(reply, e)
    }
  }

  clone = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      return reply.code(201).send(toResponse(await this.service.clone(req.params.id)))
    } catch (e) {
      return handleError(reply, e)
    }
  }

  remove = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await this.service.delete(req.params.id)
      return reply.code(204).send()
    } catch (e) {
      return handleError(reply, e)
    }
  }

  classify = async (
    req: FastifyRequest<{ Params: { id: string }; Body: Static<typeof ClassifyBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const d = await this.service.findById(req.params.id)
      if (!d) throw new HttpError('Diccionario no encontrado', 404, 'DICTIONARY_NOT_FOUND')
      const { classify } = await import('../services/classifier')
      return reply.send({ result: classify(req.body.text, d.categories) })
    } catch (e) {
      return handleError(reply, e)
    }
  }
}
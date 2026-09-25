import type { FastifyReply, FastifyRequest } from 'fastify'
import { HttpError } from '../../auth/http-error'
import type { CampaignDocumentService } from '../services/campaign-document.service'
import type { CampaignDocumentData } from '../types/campaign-document.types'

function toResponse(d: CampaignDocumentData) {
  return {
    id: d.id,
    campaignId: d.campaignId,
    displayName: d.displayName,
    fileName: d.fileName,
    mimeType: d.mimeType,
    fileSize: d.fileSize,
    cloudinaryUrl: d.cloudinaryUrl,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

export class CampaignDocumentsController {
  constructor(private readonly docService: CampaignDocumentService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { campaignId } = request.params as { campaignId: string }
    const docs = await this.docService.listDocuments(campaignId)
    return reply.send({ documents: docs.map(toResponse) })
  }

  upload = async (request: FastifyRequest, reply: FastifyReply) => {
    const { campaignId } = request.params as { campaignId: string }

    // Usar request.parts() para iterar todos los parts del multipart,
    // recolectando el file y los campos de texto en el orden que vengan.
    let fileBuffer: Buffer | null = null
    let fileName = ''
    let mimeType = ''
    let displayName = ''

    const parts = (request as unknown as { parts: () => AsyncIterable<{ type: string; fieldname: string; value?: string; filename?: string; mimetype?: string; toBuffer?: () => Promise<Buffer> }> }).parts()
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer!()
        fileName = part.filename ?? ''
        mimeType = part.mimetype ?? ''
      } else if (part.type === 'field' && part.fieldname === 'displayName') {
        displayName = part.value ?? ''
      }
    }

    if (!fileBuffer) {
      return reply.code(400).send({
        code: 'NO_FILE',
        message: 'No se recibió ningún archivo',
      })
    }

    if (!displayName || displayName.trim().length < 2) {
      return reply.code(400).send({
        code: 'DISPLAY_NAME_REQUIRED',
        message: 'El nombre descriptivo es obligatorio (mínimo 2 caracteres)',
      })
    }

    try {
      const doc = await this.docService.uploadDocument({
        campaignId,
        displayName: displayName.trim(),
        fileName,
        mimeType,
        buffer: fileBuffer,
        fileSize: fileBuffer.length,
        uploadedBy: request.user?.sub ?? null,
      })
      return reply.code(201).send(toResponse(doc))
    } catch (e) {
      if (e instanceof HttpError) {
        return reply.code(e.statusCode).send({
          code: e.code,
          message: e.message,
        })
      }
      throw e
    }
  }

  delete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    try {
      await this.docService.softDelete(id)
      return reply.code(204).send()
    } catch (e) {
      if (e instanceof HttpError) {
        return reply.code(e.statusCode).send({
          code: e.code,
          message: e.message,
        })
      }
      throw e
    }
  }
}
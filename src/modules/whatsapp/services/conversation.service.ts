import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import type { WhatsAppSender } from '../../../shared/whatsapp/whatsapp-sender.interface'
import type {
  NormalizedInboundEvent,
  NormalizedMessage,
  NormalizedMessageStatus,
} from '../../../shared/whatsapp/types/inbound.types'
import type { InboundFlowContext } from '../../leads/types/leads.types'
import type {
  CampaignLeadRepositoryPort,
  LeadEventsRepositoryPort,
  LeadFlowStateRepositoryPort,
  MessageData,
  WhatsAppContactRepositoryPort,
  WhatsAppConversationRepositoryWidePort,
  WhatsAppMessageRepositoryWidePort,
} from '../../leads/types/leads.types'
import type { CampaignDocumentRepositoryPort } from '../../campaigns/types/campaign-document.types'
import { uploadBuffer } from '../../../shared/storage/cloudinary-client'
import { HttpError } from '../../auth/http-error'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import type { RealtimeBus } from '../realtime/realtime-bus'
import type { MessageRealtimePayload } from '../realtime/types'

function toMessagePayload(message: MessageData, leadId: string | null, contactName: string | null): MessageRealtimePayload {
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    providerMessageId: message.providerMessageId,
    type: message.type,
    bodyText: message.bodyText,
    status: message.status as MessageRealtimePayload['status'],
    sentAt: message.sentAt.toISOString(),
    mediaUrl: message.mediaUrl,
    mediaType: message.mediaType,
    mediaCaption: message.mediaCaption,
    mediaFileName: message.mediaFileName,
    leadId,
    contactName,
  }
}

export type ConversationServiceDeps = {
  contacts: WhatsAppContactRepositoryPort
  conversations: WhatsAppConversationRepositoryWidePort
  messages: WhatsAppMessageRepositoryWidePort
  campaignLeads: CampaignLeadRepositoryPort
  campaignDocuments: CampaignDocumentRepositoryPort
  flowStates: LeadFlowStateRepositoryPort
  leadEvents: LeadEventsRepositoryPort
  flowEngine?: {
    handleInbound(sender: WhatsAppSender, ctx: InboundFlowContext): Promise<void>
  }
  realtimeBus?: RealtimeBus
}

export class ConversationService {
  constructor(private readonly deps: ConversationServiceDeps) {}

  async processInboundEvents(
    events: NormalizedInboundEvent[],
    provider?: WhatsAppSender
  ): Promise<void> {
    // Cast: processInboundEvents recibe WhatsAppSender, pero handleInboundMessage
    // necesita WhatsAppProvider (con downloadMedia) para media inbound. El webhook
    // siempre pasa el MetaWhatsAppProvider completo que implementa ambas interfaces.
    const fullProvider = provider as WhatsAppProvider | undefined
    for (const event of events) {
      if (event.kind === 'message') {
        const ctx = await this.handleInboundMessage(event.message, fullProvider)
        if (ctx && provider && this.deps.flowEngine) {
          await this.deps.flowEngine.handleInbound(provider, ctx)
        }
      } else {
        await this.handleStatus(event.status)
      }
    }
  }

  private publishConversationUpdated(
    conversationId: string,
    leadId: string | null,
    contactName: string | null,
    contactWaId: string,
    lastMessageAt: Date,
    lastMessageDirection: 'inbound' | 'outbound'
  ): void {
    this.deps.realtimeBus?.publish({
      type: 'conversation.updated',
      payload: {
        conversationId,
        leadId,
        contactName,
        contactWaId,
        lastMessageAt: lastMessageAt.toISOString(),
        lastMessageDirection,
        needsReply: lastMessageDirection === 'inbound',
      },
    })
  }

  private async handleInboundMessage(
    message: NormalizedMessage,
    provider?: WhatsAppProvider
  ): Promise<InboundFlowContext | null> {
    const existing = await this.deps.messages.findByProviderMessageId(
      message.providerMessageId
    )
    if (existing) return null

    const contact = await this.deps.contacts.upsert(message.waId, message.contactName)

    let conversation = await this.deps.conversations.findOpenByContactId(contact.id)
    if (!conversation) {
      conversation = await this.deps.conversations.createOpen(contact.id)
    }

    const type = message.type === 'interactive' ? 'interactive' : message.type

    // Compute priorInbound BEFORE messages.create so the just-inserted message
    // doesn't get counted (otherwise priorInbound >= 1 and first_inbound never
    // fires). Best-effort: a count error defaults to 1 (not-first) so a count
    // hiccup doesn't falsely fire first_inbound.
    let priorInbound = 1
    try {
      priorInbound = await this.deps.messages.countInboundByConversation(conversation.id)
    } catch {
      // best-effort: assume not-first
    }
    const isFirstInbound = priorInbound === 0

    const savedMessage = await this.deps.messages.create({
      conversationId: conversation.id,
      direction: 'inbound',
      providerMessageId: message.providerMessageId,
      type,
      bodyText: message.text ?? null,
      status: 'delivered',
      sentAt: message.timestamp,
      metadata: {
        interactiveReplyId: message.interactiveReplyId,
        interactiveReplyTitle: message.interactiveReplyTitle,
        interactiveType: message.interactiveType,
      },
    })

    // best-effort inbound media: descargar de Meta, subir a Cloudinary, actualizar el mensaje.
    // Si falla, el mensaje queda persistido sin mediaUrl (no se pierde).
    if (
      (message.type === 'image' || message.type === 'document') &&
      message.mediaId &&
      provider
    ) {
      try {
        const downloaded = await provider.downloadMedia(message.mediaId)
        const leadId = conversation.leadId ?? 'unassigned'
        const ext = message.mediaMimeType?.split('/')[1] ?? 'bin'
        const folder = `leads/${leadId}`
        const uploaded = await uploadBuffer(
          downloaded.buffer,
          message.mediaFileName ?? `media.${ext}`,
          downloaded.mimeType,
          {
            folder,
            resourceType: message.type === 'image' ? 'image' : 'raw',
          }
        )
        await this.deps.messages.updateMedia(savedMessage.id, {
          mediaUrl: uploaded.secureUrl,
          mediaType: message.type,
          mediaFileName: message.mediaFileName ?? downloaded.fileName ?? undefined,
        })
        // Actualizar el objeto en memoria para que el realtime incluya mediaUrl
        savedMessage.mediaUrl = uploaded.secureUrl
        savedMessage.mediaType = message.type
        savedMessage.mediaFileName = message.mediaFileName ?? downloaded.fileName ?? null
      } catch (err) {
        console.error('[conversation] best-effort inbound media download/upload failed', err)
      }
    }

    await this.deps.conversations.touchLastMessage(conversation.id, message.timestamp, 'inbound')

    // best-effort side-effects: milestones + realtime. A DB hiccup on
    // leadEvents.record must NOT break inbound processing (the inbound dedup
    // already protects against duplicates).
    try {
      const isReEngagement =
        conversation.needsReplyClearedAt != null &&
        conversation.lastMessageAt != null &&
        conversation.lastMessageAt <= conversation.needsReplyClearedAt

      this.deps.realtimeBus?.publish({
        type: 'message.created',
        payload: {
          conversationId: conversation.id,
          message: toMessagePayload(savedMessage, conversation.leadId, contact.profileName),
        },
      })
      this.publishConversationUpdated(conversation.id, conversation.leadId, contact.profileName, contact.waId, message.timestamp, 'inbound')

      if (conversation.leadId) {
        if (isFirstInbound) {
          await this.deps.leadEvents.record({
            leadId: conversation.leadId,
            type: 'message_milestone',
            fromValue: null,
            toValue: null,
            reason: null,
            milestoneKind: 'first_inbound',
            actorUserId: null,
          })
        }
        if (isReEngagement) {
          await this.deps.leadEvents.record({
            leadId: conversation.leadId,
            type: 'message_milestone',
            fromValue: null,
            toValue: null,
            reason: null,
            milestoneKind: 're_engagement',
            actorUserId: null,
          })
        }
      }
    } catch (err) {
      // best-effort: side-effects must not fail inbound processing
      console.error('[conversation] best-effort inbound side-effects failed', err)
    }

    return {
      conversationId: conversation.id,
      contactId: contact.id,
      waId: contact.waId,
      message,
    }
  }

  private async handleStatus(status: NormalizedMessageStatus): Promise<void> {
    const existing = await this.deps.messages.findByProviderMessageId(
      status.providerMessageId
    )
    if (!existing) return

    if (status.status === 'failed' && status.errorMessage) {
      await this.deps.messages.updateStatusAndMetadata(
        status.providerMessageId,
        status.status,
        { ...existing.metadata, error: status.errorMessage }
      )
    } else {
      await this.deps.messages.updateStatus(status.providerMessageId, status.status)
    }

    // best-effort: publica el status por SSE para que las palomitas
    // (sent/delivered/read) aparezcan en tiempo real, sin esperar al poll.
    // Un fallo en el publish NO debe romper el update de status en BD.
    try {
      this.deps.realtimeBus?.publish({
        type: 'message.status_updated',
        payload: {
          conversationId: existing.conversationId,
          providerMessageId: status.providerMessageId,
          status: status.status,
        },
      })
    } catch {
      // best-effort: el status ya quedó en BD
    }
  }

  async sendTextMessage(
    provider: WhatsAppProvider,
    input: { conversationId?: string; toWaId?: string; text: string; actorUserId?: string }
  ): Promise<{ providerMessageId: string; conversationId: string }> {
    let conversation =
      input.conversationId != null
        ? await this.deps.conversations.findById(input.conversationId)
        : null

    if (input.conversationId && !conversation) {
      throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }

    const toWaId = conversation?.contactWaId ?? input.toWaId?.replace(/\D/g, '')

    if (!toWaId) {
      throw new HttpError('Provide conversationId or toWaId', 400, 'INVALID_RECIPIENT')
    }

    if (!conversation) {
      const contact = await this.deps.contacts.upsert(toWaId)
      conversation =
        (await this.deps.conversations.findOpenByContactId(contact.id)) ??
        (await this.deps.conversations.createOpen(contact.id))
      const refetched = await this.deps.conversations.findById(conversation.id)
      if (!refetched) {
        throw new HttpError('Conversation no longer available', 500, 'CONVERSATION_GONE')
      }
      conversation = refetched
    }

    const result = await provider.sendTextMessage({
      toWaId: conversation.contactWaId,
      text: input.text,
    })

    const sentAt = new Date()
    const savedMessage = await this.deps.messages.create({
      conversationId: conversation.id,
      direction: 'outbound',
      providerMessageId: result.providerMessageId,
      type: 'text',
      bodyText: input.text,
      status: 'pending',
      sentAt,
      metadata: {},
    })

    await this.deps.conversations.touchLastMessage(conversation.id, sentAt, 'outbound')

    // best-effort post-send side-effects: realtime + last_outbound milestone +
    // flow-pause. These must NOT fail the send response; otherwise the controller
    // returns 500, the client retries, and a DUPLICATE outbound WhatsApp message
    // is sent (outbound has no dedup). The provider send + message persist above
    // are the source of truth and determine the response.
    try {
      this.deps.realtimeBus?.publish({
        type: 'message.created',
        payload: {
          conversationId: conversation.id,
          message: toMessagePayload(savedMessage, conversation.leadId, null),
        },
      })
      this.publishConversationUpdated(conversation.id, conversation.leadId, null, conversation.contactWaId, sentAt, 'outbound')

      const leadId = conversation.leadId
      if (leadId) {
        await this.deps.leadEvents.record({
          leadId,
          type: 'message_milestone',
          fromValue: null,
          toValue: null,
          reason: null,
          milestoneKind: 'last_outbound',
          actorUserId: input.actorUserId ?? null,
        })
        const flowState = await this.deps.flowStates.findByCampaignLeadId(leadId)
        if (flowState && flowState.status === 'active') {
          await this.deps.flowStates.save({ ...flowState, status: 'paused' })
        }
      }
    } catch (err) {
      // best-effort: side-effects must not fail the send (avoid duplicate outbound)
      console.error('[conversation] best-effort post-send side-effects failed', err)
    }

    return { providerMessageId: result.providerMessageId, conversationId: conversation.id }
  }

  async sendMediaMessage(
    provider: WhatsAppProvider,
    input: {
      conversationId: string
      campaignDocumentId: string
      caption?: string
      actorUserId?: string
    }
  ): Promise<{ providerMessageId: string; conversationId: string }> {
    const doc = await this.deps.campaignDocuments.findById(input.campaignDocumentId)
    if (!doc || doc.deletedAt) {
      throw new HttpError('Documento no encontrado', 404, 'DOCUMENT_NOT_FOUND')
    }

    const conversation = await this.deps.conversations.findById(input.conversationId)
    if (!conversation) {
      throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }

    const mediaType = doc.mimeType.startsWith('image/') ? 'image' : 'document'

    // Lazy cache: obtener o crear meta_media_id
    let mediaId = doc.metaMediaId
    if (!mediaId) {
      const cloudinaryRes = await fetch(doc.cloudinaryUrl)
      const buffer = Buffer.from(await cloudinaryRes.arrayBuffer())
      const uploaded = await provider.uploadMedia({
        mimeType: doc.mimeType,
        buffer,
        fileName: doc.fileName,
      })
      mediaId = uploaded.mediaId
      await this.deps.campaignDocuments.updateMetaMediaId(doc.id, mediaId)
    }

    // Enviar — auto-recovery si Meta rechaza el media_id
    let result: { providerMessageId: string }
    try {
      result = await provider.sendMediaMessage({
        toWaId: conversation.contactWaId,
        mediaType: mediaType as 'image' | 'document',
        mediaId,
        caption: input.caption,
        fileName: mediaType === 'document' ? doc.fileName : undefined,
      })
    } catch (sendErr) {
      // Re-subir a Meta y reintentar
      console.error('[conversation] media send failed, re-uploading', sendErr)
      const cloudinaryRes = await fetch(doc.cloudinaryUrl)
      const buffer = Buffer.from(await cloudinaryRes.arrayBuffer())
      const reuploaded = await provider.uploadMedia({
        mimeType: doc.mimeType,
        buffer,
        fileName: doc.fileName,
      })
      mediaId = reuploaded.mediaId
      await this.deps.campaignDocuments.updateMetaMediaId(doc.id, mediaId)
      result = await provider.sendMediaMessage({
        toWaId: conversation.contactWaId,
        mediaType: mediaType as 'image' | 'document',
        mediaId,
        caption: input.caption,
        fileName: mediaType === 'document' ? doc.fileName : undefined,
      })
    }

    const sentAt = new Date()
    const savedMessage = await this.deps.messages.create({
      conversationId: conversation.id,
      direction: 'outbound',
      providerMessageId: result.providerMessageId,
      type: mediaType,
      bodyText: input.caption ?? null,
      status: 'pending',
      sentAt,
      metadata: {},
      mediaUrl: doc.cloudinaryUrl,
      mediaType,
      mediaCaption: input.caption ?? null,
      mediaFileName: doc.fileName,
      campaignDocumentId: doc.id,
    })

    await this.deps.conversations.touchLastMessage(conversation.id, sentAt, 'outbound')

    // best-effort side-effects (igual que sendTextMessage)
    try {
      this.deps.realtimeBus?.publish({
        type: 'message.created',
        payload: {
          conversationId: conversation.id,
          message: toMessagePayload(savedMessage, conversation.leadId, null),
        },
      })
      this.publishConversationUpdated(conversation.id, conversation.leadId, null, conversation.contactWaId, sentAt, 'outbound')

      const leadId = conversation.leadId
      if (leadId) {
        await this.deps.leadEvents.record({
          leadId,
          type: 'message_milestone',
          fromValue: null,
          toValue: null,
          reason: null,
          milestoneKind: 'last_outbound',
          actorUserId: input.actorUserId ?? null,
        })
        const flowState = await this.deps.flowStates.findByCampaignLeadId(leadId)
        if (flowState && flowState.status === 'active') {
          await this.deps.flowStates.save({ ...flowState, status: 'paused' })
        }
      }
    } catch (err) {
      console.error('[conversation] best-effort post-media-send side-effects failed', err)
    }

    return { providerMessageId: result.providerMessageId, conversationId: conversation.id }
  }

  async listMessages(
    conversationId: string,
    limit: number,
    cursor?: string
  ): Promise<
    {
      id: string
      conversationId: string
      direction: 'inbound' | 'outbound'
      providerMessageId: string
      type: string
      bodyText: string | null
      status: string
      sentAt: string
    }[]
  > {
    const conversation = await this.deps.conversations.findById(conversationId)
    if (!conversation) {
      throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }

    const rows = await this.deps.messages.listByConversation(conversationId, limit, cursor)

    return rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      providerMessageId: m.providerMessageId,
      type: m.type,
      bodyText: m.bodyText,
      status: m.status,
      sentAt: m.sentAt.toISOString(),
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      mediaCaption: m.mediaCaption,
      mediaFileName: m.mediaFileName,
    }))
  }

  /**
   * Verifica que el usuario pueda acceder a la conversación. Un usuario con
   * `leads.read.all` accede a todo. Sin ese permiso, puede acceder si tiene
   * CUALQUIER lead del contacto de la conversación asignado a él — no basta
   * con `conversation.leadId` (que apunta al último lead del contacto, que
   * podría estar asignado a otro ejecutivo cuando el contacto tiene varios
   * leads). Lanza 404 (no 403) para no leakar la existencia de conversaciones
   * ajenas.
   */
  async assertConversationInScope(
    conversationId: string,
    permissions: Set<string>,
    userId: string
  ): Promise<void> {
    const conversation = await this.deps.conversations.findById(conversationId)
    if (!conversation) {
      throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }
    if (permissions.has(PERMISSIONS.LEADS_READ_ALL)) return
    const allowed = await this.deps.campaignLeads.existsByContactIdAndAssignee(
      conversation.contactId,
      userId
    )
    if (!allowed) {
      throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }
  }
}
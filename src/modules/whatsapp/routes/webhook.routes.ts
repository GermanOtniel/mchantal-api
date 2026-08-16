import type { FastifyPluginAsync } from 'fastify'
import { getEnv } from '../../../config/env'
import { MetaWhatsAppProvider } from '../../../shared/whatsapp/meta/meta-whatsapp.provider'
import { FlowEngine } from '../../leads/services/flow-engine'
import { CampaignLeadRepository } from '../../leads/repositories/campaign-lead.repository'
import { LeadCaptureRepository } from '../../leads/repositories/lead-capture.repository'
import { LeadFlowStateRepository } from '../../leads/repositories/lead-flow-state.repository'
import { MatcherDictionaryRepository } from '../../matcher-dictionaries/repositories/matcher-dictionary.repository'
import { AssignmentService } from '../../executives/services/assignment.service'
import { ExecutiveRepository } from '../../executives/repositories/executive.repository'
import { WebhookController } from '../controllers/webhook.controller'
import { WhatsAppContactRepository } from '../repositories/whatsapp-contact.repository'
import { WhatsAppConversationRepository } from '../repositories/whatsapp-conversation.repository'
import { WhatsAppMessageRepository } from '../repositories/whatsapp-message.repository'
import { ConversationService } from '../services/conversation.service'
import { InboundWebhookService } from '../services/inbound-webhook.service'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

export const webhookPlugin: FastifyPluginAsync = async (app) => {
  const env = getEnv()
  const provider = new MetaWhatsAppProvider(env.whatsapp)

  const captures = new LeadCaptureRepository()
  const campaignLeads = new CampaignLeadRepository()
  const flowStates = new LeadFlowStateRepository()
  const conversations = new WhatsAppConversationRepository()
  const messages = new WhatsAppMessageRepository()
  const contacts = new WhatsAppContactRepository()
  const dictionaries = new MatcherDictionaryRepository()
  const assignment = new AssignmentService(new ExecutiveRepository())

  const engine = new FlowEngine({ captures, campaignLeads, flowStates, conversations, messages, dictionaries, assignment })
  const conversationService = new ConversationService({
    contacts,
    conversations,
    messages,
    flowEngine: engine,
  })
  const inbound = new InboundWebhookService(provider, conversationService)
  const controller = new WebhookController(inbound)

  // Captura el raw body para validar la firma X-Hub-Signature-256 de Meta.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body, done) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
      request.rawBody = buf
      try {
        done(null, JSON.parse(buf.toString('utf8')) as unknown)
      } catch (err) {
        done(err as Error, undefined)
      }
    }
  )

  app.get('/v1/webhooks/whatsapp', controller.verify)
  app.post('/v1/webhooks/whatsapp', controller.receive)
}
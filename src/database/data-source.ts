import 'reflect-metadata'
import { DataSource } from 'typeorm'
import * as dotenv from 'dotenv'
import { User } from '../entities/auth/user.entity'
import { RefreshToken } from '../entities/auth/refresh-token.entity'
import { PasswordResetToken } from '../entities/auth/password-reset-token.entity'
import { Campaign } from '../entities/campaigns/campaign.entity'
import { WhatsAppContact } from '../entities/whatsapp/whatsapp-contact.entity'
import { WhatsAppConversation } from '../entities/whatsapp/whatsapp-conversation.entity'
import { WhatsAppMessage } from '../entities/whatsapp/whatsapp-message.entity'
import { LeadCapture } from '../entities/leads/lead-capture.entity'
import { CampaignLead } from '../entities/leads/campaign-lead.entity'
import { LeadFlowState } from '../entities/leads/lead-flow-state.entity'
import { AuthInitial1747129600000 } from './migrations/1747129600000-AuthInitial'
import { CampaignsInitial1749000000000 } from './migrations/1749000000000-CampaignsInitial'
import { LeadsWhatsappInitial1749100000000 } from './migrations/1749100000000-LeadsWhatsappInitial'

dotenv.config()

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  entities: [User, RefreshToken, PasswordResetToken, Campaign, WhatsAppContact, WhatsAppConversation, WhatsAppMessage, LeadCapture, CampaignLead, LeadFlowState],
  migrations: [AuthInitial1747129600000, CampaignsInitial1749000000000, LeadsWhatsappInitial1749100000000],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
})

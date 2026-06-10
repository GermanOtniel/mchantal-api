import 'reflect-metadata'
import { DataSource } from 'typeorm'
import * as dotenv from 'dotenv'
import { User } from '../entities/auth/user.entity'
import { RefreshToken } from '../entities/auth/refresh-token.entity'
import { PasswordResetToken } from '../entities/auth/password-reset-token.entity'
import { Permission } from '../entities/rbac/permission.entity'
import { Role } from '../entities/rbac/role.entity'
import { RolePermission } from '../entities/rbac/role-permission.entity'
import { UserRole } from '../entities/rbac/user-role.entity'
import { WhatsAppContact } from '../entities/whatsapp/whatsapp-contact.entity'
import { WhatsAppConversation } from '../entities/whatsapp/whatsapp-conversation.entity'
import { WhatsAppMessage } from '../entities/whatsapp/whatsapp-message.entity'
import { WhatsAppConversationReadState } from '../entities/whatsapp/whatsapp-conversation-read-state.entity'
import { WhatsAppMediaAsset } from '../entities/whatsapp/whatsapp-media-asset.entity'
import { AuthInitial1747129600000 } from './migrations/1747129600000-AuthInitial'
import { WhatsAppInitial1748000000000 } from './migrations/1748000000000-WhatsAppInitial'
import { WhatsAppConversationPending1748100000000 } from './migrations/1748100000000-WhatsAppConversationPending'
import { RbacInitial1748200000000 } from './migrations/1748200000000-RbacInitial'

dotenv.config()

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  entities: [
    User,
    RefreshToken,
    PasswordResetToken,
    WhatsAppContact,
    WhatsAppConversation,
    WhatsAppMessage,
    WhatsAppMediaAsset,
    WhatsAppConversationReadState,
    Permission,
    Role,
    RolePermission,
    UserRole,
  ],
  migrations: [
    AuthInitial1747129600000,
    WhatsAppInitial1748000000000,
    WhatsAppConversationPending1748100000000,
    RbacInitial1748200000000,
  ],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
})

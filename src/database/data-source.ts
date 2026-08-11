import 'reflect-metadata'
import { DataSource } from 'typeorm'
import * as dotenv from 'dotenv'
import { User } from '../entities/auth/user.entity'
import { RefreshToken } from '../entities/auth/refresh-token.entity'
import { PasswordResetToken } from '../entities/auth/password-reset-token.entity'
import { Campaign } from '../entities/campaigns/campaign.entity'
import { AuthInitial1747129600000 } from './migrations/1747129600000-AuthInitial'
import { CampaignsInitial1749000000000 } from './migrations/1749000000000-CampaignsInitial'

dotenv.config()

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  entities: [User, RefreshToken, PasswordResetToken, Campaign],
  migrations: [AuthInitial1747129600000, CampaignsInitial1749000000000],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
})

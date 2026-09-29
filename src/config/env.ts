function required(name: string): string {
  const v = process.env[name]
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return v
}

function optional(name: string, fallback: string): string {
  const v = process.env[name]
  return v === undefined || v === '' ? fallback : v
}

function optionalInt(name: string, fallback: number): number {
  const v = process.env[name]
  if (v === undefined || v === '') return fallback
  const n = Number.parseInt(v, 10)
  if (Number.isNaN(n)) return fallback
  return n
}

export type AppEnv = {
  nodeEnv: string
  isDev: boolean
  jwtSecret: string
  jwtAccessExpiresIn: string
  refreshTokenDays: number
  passwordResetTokenMinutes: number
  frontendPasswordResetUrl: string
  resend: {
    apiKey: string
    from: string
  }
  whatsapp: {
    meta: { accessToken: string; phoneNumberId: string; appSecret: string }
    verifyToken: string
    businessPhoneNumberE164: string
  }
}

let cached: AppEnv | null = null

/** Lee y valida env; cachea el resultado. Llamar tras dotenv.config() */
export function getEnv(): AppEnv {
  if (cached) return cached
  cached = {
    nodeEnv: optional('NODE_ENV', 'development'),
    isDev: optional('NODE_ENV', 'development') === 'development',
    jwtSecret: required('JWT_SECRET'),
    jwtAccessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '7d'),
    refreshTokenDays: optionalInt('REFRESH_TOKEN_DAYS', 30),
    passwordResetTokenMinutes: optionalInt('PASSWORD_RESET_TOKEN_MINUTES', 60),
    frontendPasswordResetUrl: required('FRONTEND_PASSWORD_RESET_URL'),
    resend: {
      apiKey: required('RESEND_EMAIL_API_KEY'),
      from: required('MAIL_FROM'),
    },
    whatsapp: {
      meta: {
        accessToken: optional('WHATSAPP_ACCESS_TOKEN', ''),
        phoneNumberId: optional('WHATSAPP_PHONE_NUMBER_ID', ''),
        appSecret: optional('WHATSAPP_APP_SECRET', ''),
      },
      verifyToken: optional('WHATSAPP_VERIFY_TOKEN', ''),
      businessPhoneNumberE164: optional('WHATSAPP_BUSINESS_PHONE_E164', ''),
    },
  }
  return cached
}

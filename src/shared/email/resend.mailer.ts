import { Resend } from 'resend'
import type { AppEnv } from '../../config/env'
import type { Mailer } from './mailer.interface'

export function createResendMailer(env: AppEnv): Mailer {
  const client = new Resend(env.resend.apiKey)

  return {
    async sendPasswordResetEmail(
      to: string,
      subject: string,
      text: string,
      html: string
    ): Promise<void> {
      const result = await client.emails.send({
        from: env.resend.from,
        to,
        subject,
        html,
        text,
      })

      if (result.error) {
        throw new Error(result.error.message)
      }
    },
  }
}
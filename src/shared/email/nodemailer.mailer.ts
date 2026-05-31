import nodemailer from 'nodemailer'
import type { AppEnv } from '../../config/env'
import type { Mailer } from './mailer.interface'

export function createNodemailerMailer(env: AppEnv): Mailer {
  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  })

  return {
    async sendPasswordResetEmail(
      to: string,
      subject: string,
      text: string,
      html: string
    ): Promise<void> {
      await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject,
        text,
        html,
      })
    },
  }
}

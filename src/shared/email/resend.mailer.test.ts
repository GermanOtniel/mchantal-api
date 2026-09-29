import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn(function (apiKey: string) {
    return { emails: { send: sendMock } }
  }),
}))

import { createResendMailer } from './resend.mailer'
import type { AppEnv } from '../../config/env'

const env = {
  resend: { apiKey: 're_test_key', from: 'noreply@test.com' },
} as unknown as AppEnv

describe('ResendMailer', () => {
  beforeEach(() => {
    sendMock.mockReset()
    sendMock.mockResolvedValue({ id: 'msg_123' })
  })

  it('sendPasswordResetEmail envía con from, to, subject, html y text', async () => {
    const mailer = createResendMailer(env)
    await mailer.sendPasswordResetEmail(
      'user@example.com',
      'Restablecer contraseña',
      'Texto plano',
      '<p>HTML</p>'
    )

    expect(sendMock).toHaveBeenCalledOnce()
    expect(sendMock).toHaveBeenCalledWith({
      from: 'noreply@test.com',
      to: 'user@example.com',
      subject: 'Restablecer contraseña',
      html: '<p>HTML</p>',
      text: 'Texto plano',
    })
  })

  it('lanza si Resend devuelve error', async () => {
    sendMock.mockResolvedValue({ error: { message: 'Invalid API key', name: 'invalid_api_key' } })

    const mailer = createResendMailer(env)
    await expect(
      mailer.sendPasswordResetEmail('user@example.com', 'Subject', 'text', '<p>html</p>')
    ).rejects.toThrow('Invalid API key')
  })
})
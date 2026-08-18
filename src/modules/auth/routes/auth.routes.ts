import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { getEnv } from '../../../config/env'
import { createNodemailerMailer } from '../../../shared/email/nodemailer.mailer'
import { AuthController } from '../controllers/auth.controller'
import {
  ErrorResponseSchema,
  ForgotPasswordBodySchema,
  ForgotPasswordResponseSchema,
  LoginBodySchema,
  LoginResponseSchema,
  LogoutBodySchema,
  MeResponseSchema,
  RefreshBodySchema,
  RefreshResponseSchema,
  RegisterBodySchema,
  RegisterResponseSchema,
  ResetPasswordBodySchema,
} from '../schemas/auth.schemas'
import { AuthService } from '../services/auth.service'
import { PasswordResetService } from '../services/password-reset.service'
import { TokenService } from '../services/token.service'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'

export const authPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const env = getEnv()
  const tokens = new TokenService(env)
  const mailer = createNodemailerMailer(env)
  const authService = new AuthService(env, tokens)
  const passwordResetService = new PasswordResetService(env, tokens, mailer)
  const controller = new AuthController(authService, passwordResetService)

  app.post(
    '/register',
    {
      schema: {
        body: RegisterBodySchema,
        response: {
          201: RegisterResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    controller.register
  )

  app.post(
    '/login',
    {
      schema: {
        body: LoginBodySchema,
        response: {
          200: LoginResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    controller.login
  )

  app.post(
    '/refresh',
    {
      schema: {
        body: RefreshBodySchema,
        response: {
          200: RefreshResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    controller.refresh
  )

  app.get(
    '/me',
    {
      preHandler: jwtAuthHook,
      schema: {
        response: {
          200: MeResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    controller.me
  )

  app.post(
    '/logout',
    {
      schema: {
        body: LogoutBodySchema,
      },
    },
    controller.logout
  )

  app.post(
    '/forgot-password',
    {
      schema: {
        body: ForgotPasswordBodySchema,
        response: {
          200: ForgotPasswordResponseSchema,
        },
      },
    },
    controller.forgotPassword
  )

  app.post(
    '/reset-password',
    {
      schema: {
        body: ResetPasswordBodySchema,
      },
    },
    controller.resetPassword
  )
}

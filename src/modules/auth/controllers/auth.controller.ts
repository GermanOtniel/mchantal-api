import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from '@sinclair/typebox'
import { HttpError } from '../http-error'
import type { AuthService } from '../services/auth.service'
import type { PasswordResetService } from '../services/password-reset.service'
import {
  ForgotPasswordBodySchema,
  LoginBodySchema,
  LogoutBodySchema,
  RefreshBodySchema,
  RegisterBodySchema,
  ResetPasswordBodySchema,
} from '../schemas/auth.schemas'

const FORGOT_GENERIC_MESSAGE =
  'Si existe una cuenta con ese email, recibirás instrucciones para restablecer la contraseña.'

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({
      code: err.code,
      message: err.message,
    })
  }
  throw err
}

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService
  ) {}

  register = async (
    request: FastifyRequest<{ Body: Static<typeof RegisterBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await this.authService.register(request.body)
      return reply.code(201).send(result)
    } catch (e) {
      return handleError(reply, e)
    }
  }

  login = async (
    request: FastifyRequest<{ Body: Static<typeof LoginBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await this.authService.login(request.body)
      return reply.send(result)
    } catch (e) {
      return handleError(reply, e)
    }
  }

  refresh = async (
    request: FastifyRequest<{ Body: Static<typeof RefreshBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await this.authService.refresh(request.body)
      return reply.send(result)
    } catch (e) {
      return handleError(reply, e)
    }
  }

  logout = async (
    request: FastifyRequest<{ Body: Static<typeof LogoutBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      await this.authService.logout(request.body)
      return reply.code(204).send()
    } catch (e) {
      return handleError(reply, e)
    }
  }

  forgotPassword = async (
    request: FastifyRequest<{ Body: Static<typeof ForgotPasswordBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      await this.passwordResetService.requestReset(request.body)
      return reply.send({ message: FORGOT_GENERIC_MESSAGE })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  resetPassword = async (
    request: FastifyRequest<{ Body: Static<typeof ResetPasswordBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      await this.passwordResetService.resetPassword(request.body)
      return reply.code(204).send()
    } catch (e) {
      return handleError(reply, e)
    }
  }
}

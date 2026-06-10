import { Type } from '@sinclair/typebox'

const RoleSummarySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  slug: Type.String(),
})

const AuthUserSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  firstName: Type.String(),
  middleName: Type.Union([Type.String(), Type.Null()]),
  lastName: Type.String(),
  secondLastName: Type.Union([Type.String(), Type.Null()]),
  fullName: Type.String(),
  roles: Type.Array(RoleSummarySchema),
  permissions: Type.Array(Type.String()),
})

const nameField = (max = 100) => Type.String({ minLength: 1, maxLength: max })

export const RegisterBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 3, maxLength: 255 }),
    password: Type.String({ minLength: 8, maxLength: 128 }),
    firstName: nameField(),
    middleName: Type.Optional(nameField()),
    lastName: nameField(),
    secondLastName: Type.Optional(nameField()),
  },
  { additionalProperties: false }
)

export const LoginBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 3, maxLength: 255 }),
    password: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false }
)

export const RefreshBodySchema = Type.Object(
  {
    refreshToken: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false }
)

export const LogoutBodySchema = RefreshBodySchema

export const ForgotPasswordBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 3, maxLength: 255 }),
  },
  { additionalProperties: false }
)

export const ResetPasswordBodySchema = Type.Object(
  {
    token: Type.String({ minLength: 1, maxLength: 512 }),
    newPassword: Type.String({ minLength: 8, maxLength: 128 }),
  },
  { additionalProperties: false }
)

export const RegisterResponseSchema = Type.Object({
  user: AuthUserSchema,
  accessToken: Type.String(),
  refreshToken: Type.String(),
})

export const LoginResponseSchema = RegisterResponseSchema

export const MeResponseSchema = Type.Object({
  user: AuthUserSchema,
})

export const RefreshResponseSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
})

export const ForgotPasswordResponseSchema = Type.Object({
  message: Type.String(),
})

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
})

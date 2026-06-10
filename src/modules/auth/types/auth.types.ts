import type { User } from '../../../entities/auth/user.entity'

export type AuthTokensResponse = {
  accessToken: string
  refreshToken: string
}

export type RoleSummary = {
  id: string
  name: string
  slug: string
}

export type UserPublic = {
  id: string
  email: string
  firstName: string
  middleName: string | null
  lastName: string
  secondLastName: string | null
  fullName: string
}

export type AuthUser = UserPublic & {
  roles: RoleSummary[]
  permissions: string[]
}

export type RegisterResult = {
  user: AuthUser
} & AuthTokensResponse

export type LoginResult = {
  user: AuthUser
} & AuthTokensResponse

export type MeResult = {
  user: AuthUser
}

export type RefreshResult = AuthTokensResponse

export type RegisterInput = {
  email: string
  password: string
  firstName: string
  middleName?: string
  lastName: string
  secondLastName?: string
}

export type LoginInput = {
  email: string
  password: string
}

export type RefreshInput = {
  refreshToken: string
}

export type LogoutInput = {
  refreshToken: string
}

export type ForgotPasswordInput = {
  email: string
}

export type ResetPasswordInput = {
  token: string
  newPassword: string
}

export function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    secondLastName: user.secondLastName,
    fullName: user.fullName,
  }
}

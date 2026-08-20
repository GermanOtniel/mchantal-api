import { Type } from '@sinclair/typebox'

export const CreateLeadCaptureBodySchema = Type.Object(
  {
    slug: Type.String({ minLength: 1, maxLength: 120 }),
    origin: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
  },
  { additionalProperties: false }
)

export const LeadCaptureResponseSchema = Type.Object({
  folio: Type.String(),
  redirectUrl: Type.String(),
})

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Any()),
})
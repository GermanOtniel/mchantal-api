import { Type } from '@sinclair/typebox'

export const ExecutiveResponseSchema = Type.Object({
  id: Type.String(),
  fullName: Type.String(),
  email: Type.String(),
  isActive: Type.Boolean(),
  coverage: Type.Record(Type.String(), Type.Array(Type.String())),
  lastAssignedAt: Type.Union([Type.String(), Type.Null()]),
})

export const ExecutiveListResponseSchema = Type.Object({
  executives: Type.Array(ExecutiveResponseSchema),
})

export const UpdateExecutiveBodySchema = Type.Object(
  {
    isActive: Type.Optional(Type.Boolean()),
    coverage: Type.Optional(Type.Record(Type.String(), Type.Array(Type.String()))),
  },
  { additionalProperties: false }
)

export const IdParamsSchema = Type.Object({ id: Type.String() })
export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Any()),
})
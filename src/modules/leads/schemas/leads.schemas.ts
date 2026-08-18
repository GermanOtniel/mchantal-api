import { Type } from '@sinclair/typebox'

export const LeadItemSchema = Type.Object({
  id: Type.String(),
  folio: Type.Union([Type.String(), Type.Null()]),
  campaignId: Type.String(),
  campaignName: Type.String(),
  contactWaId: Type.String(),
  contactName: Type.Union([Type.String(), Type.Null()]),
  answers: Type.Record(Type.String(), Type.String()),
  assignmentMode: Type.Union([Type.String(), Type.Null()]),
  assignedExecutiveId: Type.Union([Type.String(), Type.Null()]),
  assignedExecutiveName: Type.Union([Type.String(), Type.Null()]),
  assignedAt: Type.Union([Type.String(), Type.Null()]),
  enrolledAt: Type.String(),
  status: Type.String(),
  needsReply: Type.Boolean(),
})

export const LeadsPageResponseSchema = Type.Object({
  items: Type.Array(LeadItemSchema),
  page: Type.Integer(),
  pageSize: Type.Integer(),
  total: Type.Integer(),
  totalPages: Type.Integer(),
})

export const ListLeadsQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  campaignId: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  executiveId: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
})

export const FilterOptionsResponseSchema = Type.Object({
  campaigns: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })),
  executives: Type.Array(Type.Object({ id: Type.String(), fullName: Type.String() })),
})

export const LeadIdParamsSchema = Type.Object({ id: Type.String() })
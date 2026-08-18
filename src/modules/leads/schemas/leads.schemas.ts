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
})

export const LeadListResponseSchema = Type.Object({
  leads: Type.Array(LeadItemSchema),
})
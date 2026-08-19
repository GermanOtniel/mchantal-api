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
  assignment: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
})

export const FilterOptionsResponseSchema = Type.Object({
  campaigns: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })),
  executives: Type.Array(Type.Object({ id: Type.String(), fullName: Type.String() })),
})

export const LeadIdParamsSchema = Type.Object({ id: Type.String() })

export const LeadQAItemSchema = Type.Object({
  storeAs: Type.String(),
  prompt: Type.String(),
  value: Type.String(),
})

export const LeadDetailResponseSchema = Type.Object({
  id: Type.String(),
  folio: Type.Union([Type.String(), Type.Null()]),
  campaignId: Type.String(),
  campaignName: Type.String(),
  contact: Type.Object({
    name: Type.Union([Type.String(), Type.Null()]),
    waId: Type.String(),
  }),
  status: Type.String(),
  assignedExecutive: Type.Union([
    Type.Object({ id: Type.String(), fullName: Type.String() }),
    Type.Null(),
  ]),
  needsReply: Type.Boolean(),
  enrolledAt: Type.String(),
  flowState: Type.Union([
    Type.Literal('active'),
    Type.Literal('paused'),
    Type.Literal('completed'),
    Type.Null(),
  ]),
  conversationId: Type.Union([Type.String(), Type.Null()]),
  answers: Type.Array(LeadQAItemSchema),
})

export const LeadEventSchema = Type.Object({
  id: Type.String(),
  leadId: Type.String(),
  type: Type.Union([
    Type.Literal('status_change'),
    Type.Literal('reassignment'),
    Type.Literal('needs_reply_cleared'),
    Type.Literal('enrolled'),
    Type.Literal('message_milestone'),
  ]),
  fromValue: Type.Union([Type.String(), Type.Null()]),
  toValue: Type.Union([Type.String(), Type.Null()]),
  reason: Type.Union([Type.String(), Type.Null()]),
  milestoneKind: Type.Union([Type.String(), Type.Null()]),
  actorUserId: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
})
export const LeadTimelineResponseSchema = Type.Object({ items: Type.Array(LeadEventSchema) })

export const ReassignBodySchema = Type.Object({
  assigneeUserId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  reason: Type.String({ minLength: 1 }),
}, { additionalProperties: false })

export const ChangeStatusBodySchema = Type.Object({
  status: Type.Union([
    Type.Literal('new'),
    Type.Literal('in_progress'),
    Type.Literal('on_hold'),
    Type.Literal('qualified'),
    Type.Literal('disqualified'),
  ]),
  reason: Type.String({ minLength: 1 }),
}, { additionalProperties: false })

export const AvailableExecutiveSchema = Type.Object({
  userId: Type.String(),
  fullName: Type.String(),
  activeLeads: Type.Integer(),
})
export const ExecutivesResponseSchema = Type.Object({ items: Type.Array(AvailableExecutiveSchema) })
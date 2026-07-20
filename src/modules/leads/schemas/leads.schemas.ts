import { Type } from '@sinclair/typebox'

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  code: Type.Optional(Type.String()),
})

export const CampaignParamDefinitionSchema = Type.Object({
  key: Type.String(),
  label: Type.String(),
  kind: Type.Union([
    Type.Literal('tracking'),
    Type.Literal('intent'),
    Type.Literal('action'),
  ]),
  required: Type.Optional(Type.Boolean()),
  allowedValues: Type.Optional(Type.Array(Type.String())),
})

export const CampaignEntryEffectSchema = Type.Union([
  Type.Object({
    type: Type.Literal('set_message_template'),
    template: Type.String(),
  }),
  Type.Object({
    type: Type.Literal('set_intent'),
    value: Type.String(),
  }),
  Type.Object({
    type: Type.Literal('set_initial_status'),
    statusKey: Type.String(),
  }),
  Type.Object({
    type: Type.Literal('set_entry_node'),
    nodeId: Type.String(),
  }),
  Type.Object({
    type: Type.Literal('set_context'),
    values: Type.Record(Type.String(), Type.String()),
  }),
  Type.Object({
    type: Type.Literal('append_message'),
    text: Type.String(),
  }),
  Type.Object({
    type: Type.Literal('set_tags'),
    tags: Type.Array(Type.String()),
  }),
])

export const CampaignEntryRuleSchema = Type.Object({
  when: Type.Union([
    Type.Record(Type.String(), Type.String()),
    Type.Object({ _default: Type.Literal(true) }),
  ]),
  effects: Type.Array(CampaignEntryEffectSchema),
})

export const CampaignResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  slug: Type.String(),
  name: Type.String(),
  status: Type.Union([
    Type.Literal('draft'),
    Type.Literal('active'),
    Type.Literal('paused'),
    Type.Literal('archived'),
  ]),
  paramDefinitions: Type.Array(CampaignParamDefinitionSchema),
  entryRules: Type.Array(CampaignEntryRuleSchema),
  flowDefinition: Type.Record(Type.String(), Type.Unknown()),
  statusDefinitions: Type.Array(Type.Record(Type.String(), Type.Unknown())),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

export const CampaignsListResponseSchema = Type.Object({
  campaigns: Type.Array(CampaignResponseSchema),
})

export const CreateCampaignBodySchema = Type.Object({
  name: Type.String({ minLength: 2, maxLength: 200 }),
  slug: Type.Optional(Type.String({ minLength: 2, maxLength: 120 })),
  status: Type.Optional(
    Type.Union([
      Type.Literal('draft'),
      Type.Literal('active'),
      Type.Literal('paused'),
      Type.Literal('archived'),
    ])
  ),
  paramDefinitions: Type.Optional(Type.Array(CampaignParamDefinitionSchema)),
  entryRules: Type.Optional(Type.Array(CampaignEntryRuleSchema)),
})

export const UpdateCampaignBodySchema = Type.Partial(
  Type.Object({
    name: Type.String({ minLength: 2, maxLength: 200 }),
    slug: Type.String({ minLength: 2, maxLength: 120 }),
    status: Type.Union([
      Type.Literal('draft'),
      Type.Literal('active'),
      Type.Literal('paused'),
      Type.Literal('archived'),
    ]),
    paramDefinitions: Type.Array(CampaignParamDefinitionSchema),
    entryRules: Type.Array(CampaignEntryRuleSchema),
    flowDefinition: Type.Record(Type.String(), Type.Unknown()),
    statusDefinitions: Type.Array(Type.Record(Type.String(), Type.Unknown())),
  })
)

export const CampaignIdParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const PublicLeadCaptureBodySchema = Type.Object({
  campaignSlug: Type.String({ minLength: 2, maxLength: 120 }),
  params: Type.Record(Type.String(), Type.String()),
})

export const PublicLeadCaptureResponseSchema = Type.Object({
  folio: Type.String(),
  redirectUrl: Type.String(),
  campaignId: Type.String({ format: 'uuid' }),
  campaignSlug: Type.String(),
})

export const LeadCaptureResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  folio: Type.String(),
  campaignId: Type.String({ format: 'uuid' }),
  campaignSlug: Type.Optional(Type.String()),
  campaignName: Type.Optional(Type.String()),
  capturedParams: Type.Record(Type.String(), Type.String()),
  resolvedIntent: Type.Union([Type.String(), Type.Null()]),
  resolvedMessage: Type.String(),
  entryNodeId: Type.Union([Type.String(), Type.Null()]),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('matched'),
    Type.Literal('expired'),
  ]),
  createdAt: Type.String({ format: 'date-time' }),
})

export const LeadCapturesListResponseSchema = Type.Object({
  captures: Type.Array(LeadCaptureResponseSchema),
})

export const LeadCapturesQuerySchema = Type.Object({
  campaignId: Type.Optional(Type.String({ format: 'uuid' })),
  status: Type.Optional(
    Type.Union([
      Type.Literal('pending'),
      Type.Literal('matched'),
      Type.Literal('expired'),
    ])
  ),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
})

export const CampaignLeadsQuerySchema = Type.Object({
  campaignId: Type.Optional(Type.String({ format: 'uuid' })),
  statusKey: Type.Optional(Type.String()),
  assigneeUserId: Type.Optional(Type.String({ format: 'uuid' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
})

export const CampaignLeadResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  contactId: Type.String({ format: 'uuid' }),
  campaignId: Type.String({ format: 'uuid' }),
  campaignName: Type.Optional(Type.String()),
  campaignSlug: Type.Optional(Type.String()),
  leadCaptureId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  folio: Type.Union([Type.String(), Type.Null()]),
  statusKey: Type.String(),
  resolvedIntent: Type.Union([Type.String(), Type.Null()]),
  context: Type.Record(Type.String(), Type.Unknown()),
  assigneeUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  assigneeName: Type.Union([Type.String(), Type.Null()]),
  isSuccessful: Type.Boolean(),
  successAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  assignedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  enrolledAt: Type.String({ format: 'date-time' }),
  contactWaId: Type.Union([Type.String(), Type.Null()]),
  contactName: Type.Union([Type.String(), Type.Null()]),
})

export const CampaignLeadsListResponseSchema = Type.Object({
  leads: Type.Array(CampaignLeadResponseSchema),
})

export const PublishAssignmentRulesBodySchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 80 }),
  rules: Type.Array(Type.Record(Type.String(), Type.Unknown())),
})

export const AssignmentRuleSetResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  campaignId: Type.String({ format: 'uuid' }),
  key: Type.String(),
  version: Type.Integer(),
  effectiveFrom: Type.String({ format: 'date-time' }),
  isActive: Type.Boolean(),
  rules: Type.Array(Type.Record(Type.String(), Type.Unknown())),
  createdAt: Type.String({ format: 'date-time' }),
})

export const AssignmentRuleSetsResponseSchema = Type.Object({
  ruleSets: Type.Array(AssignmentRuleSetResponseSchema),
})

export const CampaignLeadIdParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const ReassignCampaignLeadBodySchema = Type.Object(
  {
    assigneeUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  },
  { additionalProperties: false }
)

export const AvailableExecutivesQuerySchema = Type.Object({
  campaignId: Type.Optional(Type.String({ format: 'uuid' })),
  segments: Type.Optional(Type.String()),
})

export const AvailableExecutiveSchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  fullName: Type.String(),
  email: Type.String(),
  segments: Type.Array(Type.String()),
  activeLeads: Type.Integer({ minimum: 0 }),
  isAcceptingLeads: Type.Boolean(),
})

export const AvailableExecutivesResponseSchema = Type.Object({
  executives: Type.Array(AvailableExecutiveSchema),
})

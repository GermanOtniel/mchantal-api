import { Type } from '@sinclair/typebox'

/** flowDefinition es jsonb suelto; la validacion estructural la hace el servicio. */
export const FlowDefinitionSchema = Type.Record(Type.String(), Type.Unknown())

export const CampaignResponseSchema = Type.Object({
  id: Type.String(),
  slug: Type.String(),
  name: Type.String(),
  entryMessage: Type.String(),
  flowDefinition: FlowDefinitionSchema,
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const CampaignListResponseSchema = Type.Object({
  campaigns: Type.Array(CampaignResponseSchema),
})

export const CreateCampaignBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 2, maxLength: 200 }),
    entryMessage: Type.String({ minLength: 1, maxLength: 2000 }),
    flowDefinition: Type.Optional(FlowDefinitionSchema),
  },
  { additionalProperties: false }
)

export const UpdateCampaignBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 2, maxLength: 200 })),
    entryMessage: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    flowDefinition: Type.Optional(FlowDefinitionSchema),
  },
  { additionalProperties: false }
)

export const IdParamsSchema = Type.Object({
  id: Type.String(),
})

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Any()),
})
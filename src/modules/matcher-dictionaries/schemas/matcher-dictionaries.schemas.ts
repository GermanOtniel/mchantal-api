import { Type } from '@sinclair/typebox'

const AliasSchema = Type.String({ minLength: 1 })
const CategorySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  label: Type.String({ minLength: 1 }),
  aliases: Type.Array(AliasSchema, { minItems: 1 }),
})

export const DictionaryResponseSchema = Type.Object({
  id: Type.String(),
  slug: Type.String(),
  name: Type.String(),
  categories: Type.Array(CategorySchema),
  isSystem: Type.Boolean(),
})

export const DictionaryListResponseSchema = Type.Object({
  dictionaries: Type.Array(DictionaryResponseSchema),
})

export const CreateDictionaryBodySchema = Type.Object(
  {
    slug: Type.String({ minLength: 1, maxLength: 120 }),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    categories: Type.Array(CategorySchema, { minItems: 1 }),
  },
  { additionalProperties: false }
)

export const UpdateDictionaryBodySchema = Type.Object(
  {
    slug: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    categories: Type.Optional(Type.Array(CategorySchema, { minItems: 1 })),
  },
  { additionalProperties: false }
)

export const IdParamsSchema = Type.Object({ id: Type.String() })

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Any()),
})

export const ClassifyBodySchema = Type.Object({ text: Type.String() })
export const ClassifyResponseSchema = Type.Object({
  result: Type.Union([
    Type.Object({ categoryId: Type.String(), matchedAlias: Type.String() }),
    Type.Null(),
  ]),
})
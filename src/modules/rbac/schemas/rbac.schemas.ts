import { Type } from '@sinclair/typebox'

export const PermissionSchema = Type.Object({
  id: Type.String(),
  key: Type.String(),
  module: Type.String(),
  description: Type.String(),
})

export const RoleSummarySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  slug: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  isSystem: Type.Boolean(),
})

export const RoleWithPermissionsSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  slug: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  isSystem: Type.Boolean(),
  permissions: Type.Array(PermissionSchema),
})

export const CreateRoleBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 100 }),
    slug: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    description: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
    permissionKeys: Type.Array(Type.String(), { minItems: 0 }),
  },
  { additionalProperties: false }
)

export const UpdateRoleBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    description: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
  },
  { additionalProperties: false }
)

export const SetRolePermissionsBodySchema = Type.Object(
  {
    permissionKeys: Type.Array(Type.String(), { minItems: 0 }),
  },
  { additionalProperties: false }
)

export const RoleIdParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const UserIdParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const SetUserRolesBodySchema = Type.Object(
  {
    roleIds: Type.Array(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false }
)

export const PermissionsListResponseSchema = Type.Object({
  permissions: Type.Array(PermissionSchema),
})

export const RolesListResponseSchema = Type.Object({
  roles: Type.Array(RoleWithPermissionsSchema),
})

export const RoleResponseSchema = Type.Object({
  role: RoleWithPermissionsSchema,
})

export const UserWithRolesSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  fullName: Type.String(),
  roles: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      slug: Type.String(),
    })
  ),
})

export const UsersListResponseSchema = Type.Object({
  users: Type.Array(UserWithRolesSchema),
})

export const UserRolesResponseSchema = Type.Object({
  roles: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      slug: Type.String(),
    })
  ),
})

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  code: Type.String(),
})

export const UserLeadProfileResponseSchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  segments: Type.Array(Type.String()),
  isAcceptingLeads: Type.Boolean(),
  maxActiveLeads: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  enabledCampaignIds: Type.Array(Type.String({ format: 'uuid' })),
})

export const UpdateUserLeadProfileBodySchema = Type.Object(
  {
    segments: Type.Optional(Type.Array(Type.String())),
    isAcceptingLeads: Type.Optional(Type.Boolean()),
    maxActiveLeads: Type.Optional(
      Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])
    ),
    enabledCampaignIds: Type.Optional(Type.Array(Type.String({ format: 'uuid' }))),
  },
  { additionalProperties: false }
)

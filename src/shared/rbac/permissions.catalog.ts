export const PERMISSIONS = {
  WHATSAPP_CONVERSATIONS_READ: 'whatsapp.conversations.read',
  WHATSAPP_MESSAGES_SEND: 'whatsapp.messages.send',
  ROLES_MANAGE: 'roles.manage',
  USERS_MANAGE: 'users.manage',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const SUPER_ADMIN_ROLE_SLUG = 'super-admin'

export type PermissionDefinition = {
  key: PermissionKey
  module: string
  description: string
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    key: PERMISSIONS.WHATSAPP_CONVERSATIONS_READ,
    module: 'whatsapp',
    description: 'Ver conversaciones y mensajes de WhatsApp',
  },
  {
    key: PERMISSIONS.WHATSAPP_MESSAGES_SEND,
    module: 'whatsapp',
    description: 'Enviar mensajes de WhatsApp',
  },
  {
    key: PERMISSIONS.ROLES_MANAGE,
    module: 'rbac',
    description: 'Crear y editar roles y permisos',
  },
  {
    key: PERMISSIONS.USERS_MANAGE,
    module: 'rbac',
    description: 'Asignar roles a usuarios',
  },
]

export const SYSTEM_ROLES = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    slug: SUPER_ADMIN_ROLE_SLUG,
    description: 'Acceso total al sistema',
    permissionKeys: PERMISSION_CATALOG.map((p) => p.key),
  },
  WHATSAPP_AGENT: {
    name: 'Agente WhatsApp',
    slug: 'whatsapp-agent',
    description: 'Ver y enviar mensajes de WhatsApp',
    permissionKeys: [
      PERMISSIONS.WHATSAPP_CONVERSATIONS_READ,
      PERMISSIONS.WHATSAPP_MESSAGES_SEND,
    ],
  },
  WHATSAPP_VIEWER: {
    name: 'Visor WhatsApp',
    slug: 'whatsapp-viewer',
    description: 'Solo ver conversaciones de WhatsApp',
    permissionKeys: [PERMISSIONS.WHATSAPP_CONVERSATIONS_READ],
  },
} as const

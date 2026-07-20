export const PERMISSIONS = {
  WHATSAPP_CONVERSATIONS_READ: 'whatsapp.conversations.read',
  WHATSAPP_MESSAGES_SEND: 'whatsapp.messages.send',
  ROLES_MANAGE: 'roles.manage',
  USERS_MANAGE: 'users.manage',
  CAMPAIGNS_MANAGE: 'campaigns.manage',
  LEADS_READ: 'leads.read',
  LEADS_ASSIGNABLE: 'leads.assignable',
  LEADS_INBOX_ASSIGNED: 'leads.inbox.assigned',
  LEADS_REASSIGN: 'leads.reassign',
  ANALYTICS_READ: 'analytics.read',
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
  {
    key: PERMISSIONS.CAMPAIGNS_MANAGE,
    module: 'leads',
    description: 'Crear y editar campañas de captura',
  },
  {
    key: PERMISSIONS.LEADS_READ,
    module: 'leads',
    description: 'Ver capturas y leads del sistema',
  },
  {
    key: PERMISSIONS.LEADS_ASSIGNABLE,
    module: 'leads',
    description: 'Puede recibir leads asignados automáticamente',
  },
  {
    key: PERMISSIONS.LEADS_INBOX_ASSIGNED,
    module: 'leads',
    description: 'Ver en inbox solo conversaciones asignadas',
  },
  {
    key: PERMISSIONS.LEADS_REASSIGN,
    module: 'leads',
    description: 'Reasignar leads y conversaciones a otros ejecutivos',
  },
  {
    key: PERMISSIONS.ANALYTICS_READ,
    module: 'analytics',
    description: 'Ver dashboard analítico de leads',
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
  LEAD_EXECUTIVE: {
    name: 'Ejecutivo de Leads',
    slug: 'lead-executive',
    description: 'Recibe leads asignados y atiende conversaciones propias',
    permissionKeys: [
      PERMISSIONS.WHATSAPP_CONVERSATIONS_READ,
      PERMISSIONS.WHATSAPP_MESSAGES_SEND,
      PERMISSIONS.LEADS_ASSIGNABLE,
      PERMISSIONS.LEADS_INBOX_ASSIGNED,
    ],
  },
} as const

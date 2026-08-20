export const PERMISSIONS = {
  ROLES_MANAGE: 'roles.manage',
  USERS_MANAGE: 'users.manage',
  CAMPAIGNS_MANAGE: 'campaigns.manage',
  MATCHER_DICTIONARIES_MANAGE: 'matcher_dictionaries.manage',
  LEADS_READ: 'leads.read',
  LEADS_READ_ALL: 'leads.read.all',
  LEADS_FILTER_CAMPAIGN: 'leads.filter.campaign',
  LEADS_FILTER_STATUS: 'leads.filter.status',
  LEADS_FILTER_ASSIGNMENT: 'leads.filter.assignment',
  LEADS_CLEAR_NEEDS_REPLY: 'leads.clear_needs_reply',
  LEADS_ATTEND: 'leads.attend',
  LEADS_REASSIGN: 'leads.reassign',
  LEADS_CHANGE_STATUS: 'leads.change_status',
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
    key: PERMISSIONS.ROLES_MANAGE,
    module: 'rbac',
    description: 'Crear y editar roles y permisos',
  },
  {
    key: PERMISSIONS.USERS_MANAGE,
    module: 'rbac',
    description: 'Asignar roles a usuarios y gestionar ejecutivos',
  },
  {
    key: PERMISSIONS.CAMPAIGNS_MANAGE,
    module: 'leads',
    description: 'Crear y editar campañas de captura',
  },
  {
    key: PERMISSIONS.MATCHER_DICTIONARIES_MANAGE,
    module: 'leads',
    description: 'Crear y editar diccionarios de matchers',
  },
  {
    key: PERMISSIONS.LEADS_READ,
    module: 'leads',
    description: 'Ver leads del sistema',
  },
  {
    key: PERMISSIONS.LEADS_READ_ALL,
    module: 'leads',
    description: 'Ver todos los leads (sin esto, sólo los asignados a mí)',
  },
  {
    key: PERMISSIONS.LEADS_FILTER_CAMPAIGN,
    module: 'leads',
    description: 'Filtrar listado de leads por campaña',
  },
  {
    key: PERMISSIONS.LEADS_FILTER_ASSIGNMENT,
    module: 'leads',
    description: 'Filtrar listado de leads por asignación (sin asignar o por ejecutivo)',
  },
  {
    key: PERMISSIONS.LEADS_FILTER_STATUS,
    module: 'leads',
    description: 'Filtrar listado de leads por estatus de atención',
  },
  {
    key: PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY,
    module: 'leads',
    description: 'Marcar como atendido (descartar aviso de necesita respuesta)',
  },
  {
    key: PERMISSIONS.LEADS_ATTEND,
    module: 'leads',
    description: 'Atender un lead (vista de atención, chat, acciones)',
  },
  {
    key: PERMISSIONS.LEADS_REASSIGN,
    module: 'leads',
    description: 'Reasignar leads a otro ejecutivo (con razón)',
  },
  {
    key: PERMISSIONS.LEADS_CHANGE_STATUS,
    module: 'leads',
    description: 'Cambiar el estatus de atención de un lead (con razón)',
  },
  {
    key: PERMISSIONS.ANALYTICS_READ,
    module: 'analytics',
    description: 'Ver el dashboard de analytics (métricas globales de leads por campaña y origen)',
  },
]

export const SYSTEM_ROLES = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    slug: SUPER_ADMIN_ROLE_SLUG,
    description: 'Acceso total al sistema (oculto para no super-admin)',
    permissionKeys: PERMISSION_CATALOG.map((p) => p.key),
  },
  GENERAL_ADMIN: {
    name: 'General Admin',
    slug: 'general-admin',
    description: 'Administrador con acceso total',
    permissionKeys: PERMISSION_CATALOG.map((p) => p.key),
  },
} as const
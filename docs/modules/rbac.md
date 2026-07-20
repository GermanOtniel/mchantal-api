# RBAC (roles y permisos)

> Estado: documento vivo. Editar cuando el código cambie.

## Propósito

Control de acceso basado en roles y permisos, con **catálogo de permisos definido en código** (no en BD) y roles/permisos asignables por la UI del CRM.

## Alcance

- Define el catálogo de permisos (`permissions.catalog.ts`).
- Persiste `roles`, `permissions` y sus relaciones (`role_permissions`, `user_roles`).
- Protege rutas Fastify con hooks `requirePermission` / `requireAnyPermission`.
- Expone endpoints de administración (CRUD de roles, asignación a usuarios, lead profile).
- Carga los permisos del usuario en cada request autenticada (`loadPermissionsHook`).

## Cómo funciona

1. **Catálogo en código** (`shared/rbac/permissions.catalog.ts`): `PERMISSIONS` (claves string) + `PERMISSION_CATALOG` (con `module` y `description` por permiso) + `SYSTEM_ROLES` (Super Admin, Agente WhatsApp, Visor WhatsApp, Ejecutivo de Leads).
2. **Seed en migración** (`1748200000000-RbacInitial.ts`): inserta los permisos del catálogo y los roles de sistema con sus permisos.
3. **Cache en proceso:** `shared/rbac/permission-cache.ts` cachea permisos efectivos por usuario (invalidado al cambiar roles/permisos).
4. **Hooks** (`shared/rbac/rbac.hooks.ts`):
   - `loadPermissionsHook` (preHandler) — resuelve `permissions[]` y `roles[]` del usuario y los adjunta al request.
   - `requirePermission(key)` / `requireAnyPermission(...keys)` — 403 si falta.
5. **Asignación de roles** vía CLI idempotente: `npm run rbac:assign-role -- <slug> <email>` (`database/assign-role.ts`).

## Catálogo de permisos

| Clave | Slug | Módulo | Descripción |
|------|------|--------|-------------|
| `WHATSAPP_CONVERSATIONS_READ` | `whatsapp.conversations.read` | whatsapp | Ver conversaciones y mensajes |
| `WHATSAPP_MESSAGES_SEND` | `whatsapp.messages.send` | whatsapp | Enviar mensajes |
| `ROLES_MANAGE` | `roles.manage` | rbac | Crear y editar roles y permisos |
| `USERS_MANAGE` | `users.manage` | rbac | Asignar roles a usuarios |
| `CAMPAIGNS_MANAGE` | `campaigns.manage` | leads | Crear y editar campañas de captura |
| `LEADS_READ` | `leads.read` | leads | Ver capturas y leads del sistema |
| `LEADS_ASSIGNABLE` | `leads.assignable` | leads | Puede recibir leads asignados automáticamente |
| `LEADS_INBOX_ASSIGNED` | `leads.inbox.assigned` | leads | Ver en inbox solo conversaciones asignadas |
| `LEADS_REASSIGN` | `leads.reassign` | leads | Reasignar leads/conversaciones a otros ejecutivos |
| `ANALYTICS_READ` | `analytics.read` | analytics | Ver dashboard analítico de leads |

## Roles de sistema (seed)

| Slug | Permisos |
|------|----------|
| `super-admin` | todos |
| `whatsapp-agent` | `whatsapp.conversations.read`, `whatsapp.messages.send` |
| `whatsapp-viewer` | `whatsapp.conversations.read` |
| `lead-executive` | `whatsapp.conversations.read`, `whatsapp.messages.send`, `leads.assignable`, `leads.inbox.assigned` |

Los roles custom (no sistema) se crean desde el CRM y pueden tener cualquier subconjunto de permisos.

## Endpoints

Prefijo `/v1/rbac`. Todas requieren JWT.

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/permissions` | `roles.manage` |
| `GET` | `/roles` | `roles.manage` **o** `users.manage` |
| `GET` | `/roles/:id` | `roles.manage` |
| `POST` | `/roles` | `roles.manage` |
| `PATCH` | `/roles/:id` | `roles.manage` |
| `DELETE` | `/roles/:id` | `roles.manage` (no se pueden borrar los de sistema) |
| `PUT` | `/roles/:id/permissions` | `roles.manage` |
| `GET` | `/users` | `users.manage` |
| `GET` | `/users/:id/roles` | `users.manage` |
| `PUT` | `/users/:id/roles` | `users.manage` |
| `GET` | `/users/:id/lead-profile` | `users.manage` |
| `PUT` | `/users/:id/lead-profile` | `users.manage` |

## Modelo de datos

- `permissions` — `id`, `key unique`, `module`, `description`. (Seed desde catálogo.)
- `roles` — `id`, `name`, `slug unique`, `description?`, `is_system bool`.
- `role_permissions` — PK compuesta `(role_id, permission_id)`. Cascadea con role/permission.
- `user_roles` — PK compuesta `(user_id, role_id)`. Cascadea con user/role.
- `user_lead_profiles` — ver [leads-campaigns.md](leads-campaigns.md). Aquí se gestiona desde `users.manage`.

## Componentes

- `shared/rbac/permissions.catalog.ts` — fuente de verdad del catálogo.
- `shared/rbac/permission-cache.ts` — cache de permisos efectivos.
- `shared/rbac/rbac.hooks.ts` — `loadPermissionsHook`, `requirePermission`, `requireAnyPermission`.
- `modules/rbac/services/permission.service.ts`, `role.service.ts`.
- `modules/rbac/repositories/rbac.repository.ts`.
- `modules/rbac/controllers/rbac.controller.ts` + `routes/rbac.routes.ts`.
- `modules/rbac/schemas/rbac.schemas.ts`.
- `database/assign-role.ts` — CLI de bootstrap del primer Super Admin.

## Agregar permisos a features nuevas

1. Registrar en `PERMISSION_CATALOG` (`permissions.catalog.ts`).
2. Añadir INSERT en una migración/seed.
3. Proteger rutas con `requirePermission(...)` en Fastify.
4. Proteger vistas con `RequirePermission` / `usePermission` en el CRM.
5. Actualizar `PERMISSIONS` del CRM (espejo en `src/lib/rbac/permissions.ts`).

## Decisiones relevantes

- RBAC custom vs. librería — [ADR-001](../decisions/ADR-001-rbac-custom-en-lugar-de-libreria.md).

## Pendientes / Notas

- El catálogo se duplica (string literals) entre backend y CRM. Si se desincronizan, los permisos del CRM fallarían silenciosamente. Considerar generar desde una sola fuente.
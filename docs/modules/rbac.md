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
3. **Cache en proceso (TTL 60s):** `shared/rbac/permission-cache.ts` cachea permisos efectivos por usuario en memoria del proceso. Se invalida **dentro del mismo proceso** al cambiar roles/permisos por la API (`setUserRoles`, `setRolePermissions`, etc.). **No se invalida entre procesos**: cambios out-of-band (script CLI, SQL directo) dejan el cache stale hasta que expira el TTL (ver *Nota operativa* abajo).
4. **Hooks** (`shared/rbac/rbac.hooks.ts`):
   - `loadPermissionsHook` (preHandler) — resuelve `permissions[]` y `roles[]` del usuario y los adjunta al request.
   - `requirePermission(key)` / `requireAnyPermission(...keys)` — 403 si falta.
5. **Asignación de roles** vía CLI idempotente: `npm run rbac:assign-role -- <slug> <email>` (`database/assign-role.ts`). Corre en su propio proceso: actualiza la DB e invalida el cache **solo de ese proceso efímero**, no del API server en ejecución.

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

### Nota operativa: stale de permisos tras cambios out-of-band (TTL 60s)

El cache de permisos (`permission-cache.ts`) vive en memoria del proceso del API y expira a los **60s**. La invalidación funciona **solo dentro del proceso** que muta:

- Cambios hechos **por la API** (UI del CRM → endpoints `/v1/rbac/...`): el API invalida su propio cache → efecto inmediato. ✅
- Cambios **out-of-band**: `npm run rbac:assign-role` (CLI), SQL directo, restores de DB. El CLI invalida el cache de **su propio proceso efímero**, no del API server en ejecución. El API sigue sirviendo permisos stale hasta que el TTL expira. ⚠️

**Síntoma típico (setup de ambiente nuevo):** te logueas antes de asignar el rol → el API cachea `permissions: []` para tu usuario. Corres `rbac:assign-role super-admin ...`. Recargas el CRM dentro de los 60s → `/me` devuelve permisos vacíos → el CRM muestra "Sin acceso asignado" y el sidebar no pinta secciones.

**Resolución aceptada (decisión consciente):** no tocar código. El CLI se corre muy rara vez y 60s es una espera aceptable. Opciones si se necesita efecto inmediato: (a) **reiniciar el API server** después del CLI (cache arranca limpio), o (b) **esperar >60s y recargar sesión** en el CRM (logout + login). Si en el futuro se escala a múltiples réplicas del API, reemplazar el cache in-memory por Redis con invalidación pub/sub (mismo patrón que los eventos SSE).

- El catálogo se duplica (string literals) entre backend y CRM. Si se desincronizan, los permisos del CRM fallarían silenciosamente. Considerar generar desde una sola fuente.
# Madame Chantal — API

Backend Fastify + TypeORM (PostgreSQL) para el CRM: campañas, flujo conversacional por WhatsApp, diccionarios de matchers, asignación de leads por clasificación, ejecutivos con cobertura y **RBAC** (roles y permisos).

## Stack

| Herramienta | Uso |
|---|---|
| Fastify 5 + TypeScript | HTTP + TypeBox (schemas) |
| TypeORM 0.3 + PostgreSQL | ORM / BD |
| jsonwebtoken | Access tokens |
| bcryptjs | Hash de contraseñas |
| Vitest | Tests unitarios |

## Setup

```bash
npm install
cp .env.example .env          # ajusta DB y JWT_SECRET
npm run migration:run         # aplica migraciones (incluida RbacInitial)
npm run dev
```

Variables clave (ver `.env.example`):

- `DB_*` — conexión a PostgreSQL.
- `JWT_SECRET` — secreto para firmar access tokens.
- `JWT_ACCESS_EXPIRES_IN` — duración del access token (default `7d`).
- `WHATSAPP_*` — credenciales de Meta para el webhook.

## Rutas

- `/v1/auth` — login, register, refresh, logout, `me` (JWT).
- `/v1/campaigns`, `/v1/matcher-dictionaries`, `/v1/executives` — CRUD (protegidos).
- `/v1/leads` — listado de leads (protegido).
- `/v1/rbac` — roles, permisos, usuarios y sus roles (protegido).
- `/v1/public/lead-captures` — público (genera folio → redirect a WhatsApp).
- `/v1/webhooks/whatsapp` — webhook público de Meta.

## RBAC — roles y permisos

Modelo: `users` ↔ `user_roles` ↔ `roles` ↔ `role_permissions` ↔ `permissions`. La migración `RbacInitial` siembra **10 permisos** y **2 roles del sistema**:

| Rol | Slug | Permisos | Visibilidad |
|---|---|---|---|
| Super Admin | `super-admin` | los 10 | Oculto para quien no es super-admin |
| General Admin | `general-admin` | los 10 | Visible |

- `super-admin` sólo lo puede ver/asignar otro super-admin; si un `general-admin` edita los roles de un usuario que ya tiene `super-admin`, el backend lo **preserva** (no se lo quita).
- Todos los endpoints (salvo `/v1/auth/me`, públicos y webhook) requieren JWT + el permiso correspondiente (`requirePermission`/`requireAnyPermission`).
- Los permisos del usuario se cachean en memoria 60s (`permission-cache`).

### Bootstrap del primer administrador

Tras aplicar la migración, **nadie tiene rol**. Para no quedarte sin acceso:

```bash
# 1. Registrar un usuario desde el CRM (o vía /v1/auth/register).
# 2. Asignarle super-admin desde la terminal:
npm run rbac:assign-role -- super-admin admin@tuempresa.com
```

El script (`src/database/assign-role.ts`) usa el slug del rol y el email del usuario. Repite para otorgar `general-admin` u otros roles personalizados (creados desde `/settings/roles`).

## Tests

```bash
npm test            # vitest run
```

Los tests son unitarios (servicios/validadores con repositorios mockeados); no requieren BD. Las migraciones se verifican manual con `npm run migration:run`.
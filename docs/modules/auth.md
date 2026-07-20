# Auth

> Estado: documento vivo. Editar cuando el código cambie.

## Propósito

Autenticación de usuarios del CRM: registro, login, emisión y rotación de tokens JWT (access + refresh), y recuperación de contraseña por email.

## Alcance

Cubre identidad de usuarios internos (agentes, ejecutivos, admins). **No** cubre la sesión del contacto final de WhatsApp (ese flujo es anónimo y se enrola vía folio — ver [leads-campaigns.md](leads-campaigns.md)).

## Cómo funciona

- **Hash de password:** `bcryptjs`.
- **Tokens:**
  - **Access token** JWT firmado con `JWT_SECRET`, TTL configurable (`JWT_ACCESS_EXPIRES_IN`, default `15m`).
  - **Refresh token** opaco, persistido hasheado en `refresh_tokens` (columna `token_hash` única), TTL `REFRESH_TOKEN_DAYS` (default 30). Se revoca con `revoked_at`.
- **Reset de password:** token opaco en `password_reset_tokens` (hasheado, único, `expires_at`, `used_at`). El email incluye un link a `FRONTEND_PASSWORD_RESET_URL` con el token; el CRM llama a `/reset-password`.
- **Email:** `nodemailer` tras la abstracción `Mailer` (`shared/email/`). SMTP por env vars.
- **JWT hook:** `shared/auth/jwt-auth.hook.ts` valida el Bearer y carga el usuario en `request.user`.

## Endpoints

Todas bajo prefijo `/v1/auth`.

| Método | Ruta | Auth | Propósito |
|--------|------|------|-----------|
| `POST` | `/register` | No | Crea usuario (email, password, nombres). Calcula `fullName` |
| `POST` | `/login` | No | Devuelve `{ accessToken, refreshToken, user }` |
| `POST` | `/refresh` | Refresh body | Rota refresh token → nuevo par |
| `POST` | `/logout` | JWT | Revoca el refresh token |
| `POST` | `/forgot-password` | No | Genera token y envía email |
| `POST` | `/reset-password` | No | Body `{ token, password }` → cambia password |
| `GET` | `/me` | JWT | Devuelve usuario + `roles[]` + `permissions[]` |

> Nota: el login/refresh devuelven también `permissions` (resueltas desde RBAC) para que el CRM arme la sesión y la UI por permisos.

## Modelo de datos

- `users` — `id uuid`, `email unique`, `password_hash`, `first_name`, `middle_name?`, `last_name`, `second_last_name?`, `full_name`, `email_verified_at?`, timestamps.
- `refresh_tokens` — `id`, `user_id`, `token_hash unique`, `expires_at`, `revoked_at?`.
- `password_reset_tokens` — `id`, `user_id`, `token_hash unique`, `expires_at`, `used_at?`.

`fullName` se calcula en el servicio desde los nombres (`utils/full-name.ts`).

## Componentes

- `modules/auth/services/auth.service.ts` — registro, login, refresh, logout.
- `modules/auth/services/token.service.ts` — firma/verifica JWT, genera/hashea/valida refresh y reset tokens.
- `modules/auth/services/password-reset.service.ts` — orquesta reset por email.
- `modules/auth/repositories/*` — `user`, `refresh-token`, `password-reset-token`.
- `modules/auth/controllers/auth.controller.ts` + `routes/auth.routes.ts`.
- `modules/auth/schemas/auth.schemas.ts` — TypeBox.
- `modules/auth/http-error.ts` — errores tipados (`statusCode`, `code`).
- `shared/auth/jwt-auth.hook.ts` — hook preHandler.
- `shared/email/` — `Mailer` + `NodemailerMailer`.

## Variables de entorno

`JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `REFRESH_TOKEN_DAYS`, `PASSWORD_RESET_TOKEN_MINUTES`, `FRONTEND_PASSWORD_RESET_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

## Decisiones relevantes

- El RBAC no es una librería externa (ver [ADR-001](../decisions/ADR-001-rbac-custom-en-lugar-de-libreria.md)).

## Pendientes / Notas

- `email_verified_at` existe en la entidad pero no se usa en el flujo de registro (no hay verificación de email todavía).
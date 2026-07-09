# mchantal-api

API backend del CRM (Fastify + TypeORM + PostgreSQL).

## WhatsApp (Meta Cloud API)

Activar con `WHATSAPP_ENABLED=true` y credenciales en `.env` (ver `.env.example`).

### Variables

| Variable | Descripción |
|----------|-------------|
| `WHATSAPP_ENABLED` | `true` registra rutas de webhook y mensajería |
| `WHATSAPP_PROVIDER` | `meta` (único implementado; `dialog360` reservado) |
| `WHATSAPP_VERIFY_TOKEN` | Token que configuras en Meta para verificar el webhook |
| `META_APP_SECRET` | App Secret de Meta (firma `X-Hub-Signature-256`) |
| `META_WHATSAPP_ACCESS_TOKEN` | Token permanente del número de prueba/producción |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Phone number ID en Meta Developer |
| `REDIS_URL` | Opcional — pub/sub para SSE con varias réplicas del API (ej. `redis://localhost:6379`) |

### Rutas

| Método | Ruta | Auth |
|--------|------|------|
| `GET` | `/v1/webhooks/whatsapp` | No — verificación Meta (`hub.challenge`) |
| `POST` | `/v1/webhooks/whatsapp` | No — mensajes y estados entrantes |
| `GET` | `/v1/whatsapp/conversations` | JWT |
| `GET` | `/v1/whatsapp/conversations/:id/messages` | JWT |
| `GET` | `/v1/whatsapp/events` | JWT — stream SSE de mensajes/conversaciones en tiempo real |
| `POST` | `/v1/whatsapp/messages` | JWT — body: `{ conversationId?, toWaId?, text }` |

### Desarrollo local

1. `WHATSAPP_ENABLED=true` en `.env`
2. Ejecutar migraciones: `npm run migration:run`
3. Exponer la API con un túnel (ngrok, cloudflared) hacia el puerto configurado
4. En Meta Developer → WhatsApp → Configuration, URL del webhook: `https://<túnel>/v1/webhooks/whatsapp` y el mismo `WHATSAPP_VERIFY_TOKEN`

### Arquitectura

La lógica de negocio usa `WhatsAppProvider` (tipos normalizados). Solo el adapter `MetaWhatsAppProvider` está implementado. **Dialog360** se añadirá después sin cambiar servicios ni rutas.

### Migraciones

```bash
npm run migration:run
```

## RBAC (roles y permisos)

Sistema de roles custom con catálogo de permisos en código. Los permisos se validan en backend por ruta; el CRM oculta vistas y acciones según la sesión.

### Permisos iniciales

| Clave | Descripción |
|-------|-------------|
| `whatsapp.conversations.read` | Ver conversaciones y mensajes |
| `whatsapp.messages.send` | Enviar mensajes |
| `roles.manage` | CRUD de roles |
| `users.manage` | Asignar roles a usuarios |

### Roles de sistema (seed)

- **Super Admin** (`super-admin`) — todos los permisos
- **Agente WhatsApp** (`whatsapp-agent`) — leer y enviar
- **Visor WhatsApp** (`whatsapp-viewer`) — solo leer

### Bootstrap del primer Super Admin

1. Correr migraciones: `npm run migration:run`
2. Registrar tu usuario en `/v1/auth/register` o desde el CRM
3. Asignar el rol:

```bash
npm run rbac:assign-role -- super-admin tu@email.com
```

El script es idempotente (se puede ejecutar varias veces).

### Rutas RBAC

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/v1/rbac/permissions` | `roles.manage` |
| `GET` | `/v1/rbac/roles` | `roles.manage` o `users.manage` |
| `PUT` | `/v1/rbac/roles/:id/permissions` | `roles.manage` |
| `GET/PUT` | `/v1/rbac/users/:id/roles` | `users.manage` |

### Agregar permisos a features nuevas

1. Registrar en `src/shared/rbac/permissions.catalog.ts`
2. Añadir INSERT en una migración o seed
3. Proteger rutas con `requirePermission(...)` en Fastify
4. Proteger vistas con `RequirePermission` / `usePermission` en el CRM


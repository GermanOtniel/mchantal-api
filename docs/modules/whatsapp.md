# WhatsApp

> Estado: documento vivo. Editar cuando el código cambie.

## Propósito

Integración con WhatsApp Business (Meta Cloud API) para recibir mensajes, conversar con contactos y notificar al CRM en tiempo real. Habilitado solo si `WHATSAPP_ENABLED=true`.

## Alcance

- Webhook de Meta (verificación + mensajes/estados entrantes).
- Conversaciones, mensajes, contactos, estados de lectura.
- Envío de mensajes salientes (agente o flow).
- **Tiempo real** al CRM vía **SSE** (con bus in-memory o Redis pub/sub).
- **Media assets** (metadata de medios; `download_status` `pending|ready|failed`).

**No** cubre: el contenido del flow conversacional (eso es [leads-campaigns.md](leads-campaigns.md)) — pero el `ConversationService` delega al `LeadFlowEngine` los mensajes entrantes.

## Cómo funciona

### Provider abstraído
`shared/whatsapp/whatsapp-provider.interface.ts` define el contrato; `shared/whatsapp/meta/meta-whatsapp.provider.ts` es la única implementación. El parser `meta-webhook.parser.ts` normaliza payloads de Meta a `NormalizedInboundEvent` (`message` | `status`). `Dialog360` está reservado pero sin implementar (ver [ADR-003](../decisions/ADR-003-whatsapp-provider-abstraido.md)).

### Webhook entrante
1. `GET /v1/webhooks/whatsapp` — verificación Meta (`hub.challenge`), valida `WHATSAPP_VERIFY_TOKEN`.
2. `POST /v1/webhooks/whatsapp` — valida firma `X-Hub-Signature-256` con `META_APP_SECRET`; parsea eventos; `InboundWebhookService` → `ConversationService.processInboundEvents`.
3. `processInboundEvents` por cada evento:
   - `message` → upsert `whatsapp_contacts` + `whatsapp_conversations`, inserta `whatsapp_messages`, publica `message.created` + `conversation.updated` en el realtime bus, y **delega** al `LeadFlowEngine.handleInbound`.
   - `status` → actualiza `whatsapp_messages.status` y publica `message.status_updated`.

### Envío saliente
`POST /v1/whatsapp/messages` (JWT) → `ConversationService` envía por el provider, persiste el mensaje `outbound` y publica `message.created`.

### Tiempo real (SSE)
- **Realtime Bus** (`realtime/realtime-bus.ts`): interfaz `RealtimeBus` con `publish`/`subscribe`. `InMemoryRealtimeBus` (EventEmitter) por defecto; `RedisRealtimeBus` si `REDIS_URL` está seteado (pub/sub en canal `whatsapp:events`, bridge a bus local). Ver [ADR-002](../decisions/ADR-002-sse-en-lugar-de-websockets.md).
- **SSE Connection Manager** (`sse-connection-manager.ts`): mantiene clientes SSE por `userId`, heartbeat cada 30s, envía `event: <type>\ndata: <json>\n\n`.
- **Endpoint** `GET /v1/whatsapp/events` (JWT) → stream SSE.

### Eventos del bus

| `type` | Payload |
|-------|---------|
| `message.created` | `{ conversationId, message }` |
| `message.status_updated` | `{ conversationId, providerMessageId, status }` |
| `conversation.updated` | `{ conversationId, lastMessageAt, lastMessageDirection, needsReply }` |
| `conversation.read` | `{ conversationId, userId }` |

## Endpoints

### Webhook (sin auth)

| Método | Ruta | Propósito |
|--------|------|-----------|
| `GET` | `/v1/webhooks/whatsapp` | Verificación Meta |
| `POST` | `/v1/webhooks/whatsapp` | Mensajes y estados entrantes |

### API (JWT + permisos)

Prefijo `/v1/whatsapp`.

| Método | Ruta | Permiso | Propósito |
|--------|------|---------|-----------|
| `GET` | `/conversations` | `whatsapp.conversations.read` | Lista paginada (cursor); filtra por `userId` (asignadas) |
| `POST` | `/conversations/:id/read` | `whatsapp.conversations.read` | Marca conversación leída para el usuario |
| `GET` | `/conversations/:id/messages` | `whatsapp.conversations.read` | Mensajes paginados (cursor) |
| `POST` | `/messages` | `whatsapp.messages.send` | Body `{ conversationId?, toWaId?, text }` |
| `GET` | `/events` | `whatsapp.conversations.read` | Stream SSE |

## Modelo de datos

- `whatsapp_contacts` — `id`, `wa_id unique` (20), `profile_name?`.
- `whatsapp_conversations` — `id`, `contact_id`, `status` (`open|closed`), `lead_id?` (link a `campaign_leads`), `assignee_user_id?`, `last_message_at?`, `last_message_direction?`.
- `whatsapp_messages` — `id`, `conversation_id`, `direction` (`inbound|outbound`), `provider_message_id unique`, `type` (varchar 30), `body_text?`, `media_asset_id?`, `status` (`pending|sent|delivered|read|failed`), `metadata jsonb`, `sent_at`. Índice en `(conversation_id, sent_at)`.
- `whatsapp_conversation_read_states` — `id`, `conversation_id`, `user_id`, `last_read_at`. Unique `(conversation_id, user_id)`.
- `whatsapp_media_assets` — `id`, `provider_media_id`, `mime_type?`, `sha256?`, `size_bytes?`, `original_filename?`, `storage_key?`, `download_status` (default `pending`).

La conversación enlaza al lead (`lead_id`) cuando el `LeadFlowEngine` enrola o cuando llega un mensaje de un contacto con lead activo.

## Componentes

- `modules/whatsapp/controllers/webhook.controller.ts` — verify + receive.
- `modules/whatsapp/controllers/whatsapp.controller.ts` — rutas autenticadas.
- `modules/whatsapp/controllers/realtime.controller.ts` — endpoint SSE.
- `modules/whatsapp/services/inbound-webhook.service.ts` — firma + parseo.
- `modules/whatsapp/services/conversation.service.ts` — lógica principal; publica eventos; delega al flow engine.
- `modules/whatsapp/create-conversation-service.ts` — singleton que cablea bus + `LeadFlowEngine`.
- `modules/whatsapp/realtime/` — `realtime-bus`, `realtime-bus.redis`, `sse-connection-manager`, `index`, `types`.
- `modules/whatsapp/repositories/*` — contact, conversation, read-state, message.
- `modules/whatsapp/routes/{webhook,whatsapp}.routes.ts` + `index.ts`.
- `shared/whatsapp/` — interfaz, adapter Meta, parser, tipos inbound/outbound, `create-whatsapp-provider.ts`.

## Variables de entorno

`WHATSAPP_ENABLED`, `WHATSAPP_PROVIDER` (`meta`), `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_PHONE?`, `REDIS_URL?`.

## Decisiones relevantes

- SSE vs. WebSockets — [ADR-002](../decisions/ADR-002-sse-en-lugar-de-websockets.md).
- Provider abstraído — [ADR-003](../decisions/ADR-003-whatsapp-provider-abstraido.md).

## Pendientes / Notas

- **Dialog360** reservado, sin implementar. Añadir otro `*WhatsAppProvider` no cambia servicios ni rutas.
- `whatsapp_media_assets` solo guarda metadata; la descarga/almacenamiento real del binario está pendiente (`storage_key` y `download_status` existen pero el flujo de descarga no está completo).
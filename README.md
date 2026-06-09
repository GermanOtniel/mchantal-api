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

### Rutas

| Método | Ruta | Auth |
|--------|------|------|
| `GET` | `/v1/webhooks/whatsapp` | No — verificación Meta (`hub.challenge`) |
| `POST` | `/v1/webhooks/whatsapp` | No — mensajes y estados entrantes |
| `GET` | `/v1/whatsapp/conversations` | JWT |
| `GET` | `/v1/whatsapp/conversations/:id/messages` | JWT |
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

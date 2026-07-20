# ADR-002: SSE en lugar de WebSockets para tiempo real

- **Estado:** Aceptado
- **Fecha:** 2026-07-20
- **Módulos:** [WhatsApp](../modules/whatsapp.md)

## Contexto

El CRM necesita recibir en tiempo real los mensajes y cambios de estado de WhatsApp (entrada de mensajes, actualización de conversaciones, estados de entrega). El tráfico es **unidireccional**: servidor → cliente. El cliente solo necesita escuchar.

## Decisión

Exponer un endpoint **SSE** (`GET /v1/whatsapp/events`, `text/event-stream`) con eventos tipados (`message.created`, `message.status_updated`, `conversation.updated`, `conversation.read`). Soporta `Last-Event-ID` para reanudar. Heartbeat cada 30s. Un bus interno (`RealtimeBus`) publica; un `SseConnectionManager` reparte a los clientes por `userId`. Para múltiples réplicas del API se usa Redis pub/sub (`REDIS_URL`) como bridge del bus.

## Alternativas consideradas

- **WebSockets:** bidireccional, pero el caso de uso es solo server→client. Agregaría complejidad (manejo de ping/pong, reconexión, estado de conexión en servidor, librería extra) sin beneficio.
- **Long polling:** simple pero ineficiente y con latencia; ya descartado.
- **Polling corto:** ya existe como **fallback** (los hooks `useConversations`/`useMessages` tienen `refetchInterval` de 60s) — SSE lo complementa, no lo reemplaza.

## Consecuencias

- ✅ Usa HTTP estándar (mismo stack, CORS, JWT en header). Sin protocolo extra.
- ✅ Reconexión nativa del navegador (`EventSource`) + `@microsoft/fetch-event-source` en el CRM para enviar headers.
- ✅ Redis pub/sub solo se activa si hay `REDIS_URL`; en dev funciona con bus in-memory.
- ⚠️ SSE es unidireccional: si en el futuro se necesita cliente→servidor en tiempo real (ej. "escribiendo…"), se evaluará agregar canales o migrar a WS.
- ⚠️ Detrás de proxies hay que asegurarse de no bufferizar (header `X-Accel-Buffering: no` ya está puesto).
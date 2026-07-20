# ADR-004: Rate limit en la captura pública de leads

- **Estado:** Aceptado
- **Fecha:** 2026-07-20
- **Módulos:** [Leads & Campañas](../modules/leads-campaigns.md)

## Contexto

`POST /v1/public/lead-captures` es un endpoint **sin autenticación** que cualquier persona puede llamar desde el link público `/go/:slug`. Genera un folio y un `LeadCapture`. Sin protección es vulnerable a abuso: spam de capturas, agotamiento de folios, ruido en la base y en analytics.

## Decisión

Aplicar un **rate limit por IP** en el hook `createRateLimitHook(env.publicCaptureRateLimit)` (configurable vía `PUBLIC_CAPTURE_RATE_LIMIT`, default 30 por ventana). El hook se inyecta como `preHandler` solo en la ruta pública.

## Alternativas consideradas

- **Sin rate limit:** inaceptable por abuso.
- **Captcha / prueba de trabajo:** agrega fricción al usuario real; prematuro mientras no haya indicios de bots dirigidos.
- **Rate limit por campaña:** útil a futuro, pero la unidad de abuso es la IP. El por-IP cubre el caso común.

## Consecuencias

- ✅ Límite simple, configurable y por-ruta (no afecta otras rutas).
- ✅ Respuesta `429` con `code: RATE_LIMITED` ya mapeada en el error handler del plugin público.
- ⚠️ El rate limit es **en proceso** (no compartido entre réplicas). Si se escala a múltiples réplicas del API, conviene moverlo a Redis (mismo patrón que el realtime bus).
- ⚠️ Tras NAT, varias personas pueden compartir IP — ajustar el límite si se ven falsos positivos.
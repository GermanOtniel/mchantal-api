# ADR-003: `WhatsAppProvider` abstraído (Meta implementado, Dialog360 reservado)

- **Estado:** Aceptado
- **Fecha:** 2026-07-20
- **Módulos:** [WhatsApp](../modules/whatsapp.md)

## Contexto

La integración inicial es con **Meta Cloud API**, pero el negocio contempla usar **Dialog360** (u otro BSP) en el futuro para algunos números o mercados. Los payloads y la autenticación difieren entre proveedores.

## Decisión

Definir una interfaz `WhatsAppProvider` (`shared/whatsapp/whatsapp-provider.interface.ts`) que normaliza:
- `verifySubscription`, `validateWebhookSignature`
- `parseInboundPayload` → `NormalizedInboundEvent[]` (`message` | `status`)
- envío de mensajes salientes (`NormalizedMessage` / `outbound.types`)

La lógica de negocio (`ConversationService`, `LeadFlowEngine`, rutas) **depende solo de la interfaz**, no del adapter Meta. `create-whatsapp-provider.ts` construye el provider según `WHATSAPP_PROVIDER` (env). Solo `MetaWhatsAppProvider` (+ `meta-webhook.parser.ts`) está implementado.

## Alternativas consideradas

- **Acoplar directo a Meta:** más rápido hoy, pero migrar a Dialog360 implicaría tocar `ConversationService`, el webhook parser y los servicios — alto riesgo.
- **Multi-provider simultáneo por número:** prematuro (YAGNI). La abstracción lo permite después sin rediseño.

## Consecuencias

- ✅ Añadir Dialog360 = nuevo archivo `dialog360-whatsapp.provider.ts` + parser; sin tocar servicios ni rutas.
- ✅ Tipos normalizados (`inbound.types`, `outbound.types`) son el contrato estable del módulo.
- ⚠️ `WHATSAPP_PROVIDER` hoy solo acepta `meta`; `dialog360` está reservado y lanzará si se selecciona.
- ⚠️ Firmas/webhooks específicos por proveedor viven en el adapter — hay que mantener el de Meta si Meta cambia su API.
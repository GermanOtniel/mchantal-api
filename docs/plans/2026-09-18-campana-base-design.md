# Campaña base (fallback) para leads sin folio — Diseño

**Fecha:** 2026-09-18
**Fase:** 1 (núcleo). El versionado de campañas queda fuera de esta fase (Fase 2, cuando duelan no tenerlo).

## Problema

Cuando un lead abre el redirect `wa.me` prellenado y **borra/edita el folio** del mensaje inicial (o manda un folio inválido/expirado/ya usado), el `FlowEngine.handleInbound` no lo puede atribuir:

- `extractFolio` no matchea (o `findPendingByFolio` devuelve null) → `enrollFromFolio` no enrolla.
- `conversation.leadId` es null (contacto nuevo) → el motor retorna silenciosamente.

El mensaje inbound queda huérfano: existe la conversación pero no hay lead, campaña ni flujo. El lead desaparece del radar.

## Objetivo

Una **campaña base** designada que atrape a esos leads (caso B: sin folio + folio inválido/expirado/usado) y les dé un flujo de atención, reutilizando toda la infraestructura existente (flow, asignación, eventos, listado).

## Decisiones asentidas

- **Orphans = caso B** (sin folio + folio inválido/expirado/usado). Trigger exacto: `conversation.leadId === null` tras fallar el match de folio.
- **`kind: 'base' | 'normal'`** en `campaigns` + índice único parcial (una sola base activa).
- **Formulario base** = nombre + flujo (sin `entryMessage`, sin `origins`).
- **Banner fijo** cuando no hay base; **radios** al crear; **badge "Base"** en listado.
- **Folio base** con prefijo `B-XXXXX`, solo display, no crea `lead_capture`.
- **Sin base configurada + orphan** → silencioso (comportamiento actual, sin regresión).
- **Versionado** → Fase 2.

## Sección 1 — Modelo de datos y folio

### Migración (`...CampaignsKindBase.ts`)

```sql
ALTER TABLE campaigns ADD COLUMN kind varchar(20) NOT NULL DEFAULT 'normal';
CREATE UNIQUE INDEX campaigns_single_base ON campaigns (kind) WHERE kind = 'base';
```

Backfill implícito (`DEFAULT 'normal'`). El índice parcial sobre la constante `kind` garantiza **a lo sumo una** fila base — la BD rechaza un segundo `INSERT`/`UPDATE` con `kind='base'`. No se siembra ninguna campaña base: el banner empuja al admin a crearla.

### Entidad `Campaign`

Nueva columna `kind: 'base' | 'normal'` (default `'normal'`). El repositorio gana `findActiveBase(): Promise<Campaign | null>` (`findOne WHERE kind='base'`).

### Folio service

Nueva función `generateBaseFolio()` con prefijo `B-` y mismo charset/longitud (5 chars) → `B-XXXXX`. El `FOLIO_REGEX` actual (`MC-[5]`) **no** matchea `B-`, así que un lead base jamás re-disparará `enrollFromFolio` aunque cite su folio después. No se toca `lead_captures` — los folios base viven solo en `campaign_lead.context.folio`.

### Listado de leads

La columna folio muestra `B-XXXXX` para leads base. El prefijo basta para distinguirlos; no se añade filtro "tipo" en Fase 1 (YAGNI).

## Sección 2 — Flujo de enrolamiento de orphans (FlowEngine)

Cambio en un solo sitio: `FlowEngine.handleInbound`. El punto de orfandad `if (!conversation?.leadId) return` se reemplaza por una rama que intenta la base:

```ts
const folio = extractFolio(ctx.message)
if (folio) {
  const enrolled = await this.enrollFromFolio(sender, ctx, folio)
  if (enrolled) return
}
const conversation = await this.deps.conversations.findById(ctx.conversationId)
if (!conversation?.leadId) {
  const base = await this.deps.campaigns.findActiveBase()
  if (!base) return                       // sin base → silencioso (decisión A)
  await this.enrollInBase(sender, ctx, base)
  return
}
await this.processFlowInput(sender, ctx, lead, flowState)  // lead existente
```

Cubre los dos subcasos de B: (1) sin folio → `extractFolio` null → orphan; (2) folio presente pero `findPendingByFolio` null → `enrollFromFolio` false → orphan. En ambos, si hay base, se enrola.

### `enrollInBase` espejea `enrollFromFolio` sin búsqueda de captura

- `findByContactAndCampaign(contactId, base.id)` → reusa el `campaign_lead` si el contacto ya existía en la base, o lo crea con `context: { folio: generateBaseFolio(), answers: {} }` (solo al crear; si reusa, conserva su folio).
- `leadEvents.record({ type: 'enrolled' })`.
- `conversations.setLead(conversationId, lead.id)`.
- Crea el `flowState` en `findFirstInteractiveNode(base.flowDefinition)` si no existe.
- `executeNode(entryNodeId)` → envía el primer nodo del flujo base.

### Edge case intencional

Un contacto con `conversation.leadId` ya seteado (lead previo, aunque su flujo esté `completed`) **no** se re-enrola en la base — cae a `processFlowInput`, igual que hoy. El re-engagement de leads completos queda fuera de Fase 1 (consistente con el comportamiento actual, no es regresión).

### Deps

`FlowEngineDeps` gana `campaigns: { findActiveBase(): Promise<Campaign | null> }`.

## Sección 3 — Backend: campañas (service, repo, schemas, rutas)

- **Repositorio**: además de `findActiveBase()`, `create`/`update` persisten `kind` por la columna nueva. Nada extra.
- **`CampaignService`**:
  - `CreateCampaignInput` gana `kind?: 'base' | 'normal'` (default `'normal'`).
  - `createCampaign`: si `kind === 'base'`, **ignora** `entryMessage` y `origins` (los descarta, no falla) y valida que el flujo tenga al menos un nodo interactivo (sin nodo de entrada, el orphan no recibiría nada). Antes de crear, chequea `findActiveBase()`; si ya existe, lanza `409 BASE_ALREADY_EXISTS` (mensaje limpio en vez de chocar con el índice parcial).
  - `updateCampaign`: permite editar `name` y `flowDefinition` de una base. **`kind` es inmutable** post-creación. Cambiar de base es Fase 2.
- **Schemas** (`campaigns.schemas`): `CampaignResponse` incluye `kind`. `CreateCampaignBody` acepta `kind` enum opcional. El `flow-validator` se reusa sin cambios.
- **Rutas**: sin cambios estructurales — `POST /v1/campaigns` y `PATCH /v1/campaigns/:id` pasan `kind` al servicio. `GET /v1/campaigns` devuelve `kind`.
- **RBAC**: reusa `campaigns.manage`. No hay permiso nuevo (YAGNI).
- **Borrar la base**: `campaign_leads.campaign_id` es `ON DELETE CASCADE`, así que borrar una campaña con leads los nukea (preexistente, aplica a cualquier campaña). Fase 1 no cambia la semántica de borrado; el CRM deshabilita "Eliminar" en la fila base (guardrail de UI).

## Sección 4 — Frontend CRM

- **API client** (`lib/api/campaigns.ts`): `Campaign` gana `kind`. `CreateCampaignPayload` gana `kind?`. Sin endpoints nuevos.
- **Listado de campañas** (`/campaigns`):
  - Badge "Base" en la fila con `kind === 'base'`.
  - Si `fetchCampaigns()` no retorna ninguna base, **banner fijo** arriba: "No hay campaña base configurada. Los leads que borren su folio quedarán huérfanos y no recibirán atención. [Crear campaña base]". El botón lleva al flujo de creación con el radio "Base" preseleccionado.
  - Botón "Eliminar" oculto/deshabilitado en la fila base.
- **Botón "Crear campaña"**:
  - Si **no** hay base: dialog con dos radios ("Campaña normal" / "Campaña base") → continúa al formulario correspondiente.
  - Si **ya** hay base: va directo al formulario normal.
- **Formulario base**: mismo componente del normal, pero oculta `entryMessage`, `origins` y helper texts de `{{folio}}`. Envía `kind: 'base'`. El `FlowEditor` se reusa intacto.
- **Edición**: detecta `campaign.kind === 'base'` y aplica las mismas ocultaciones. `kind` no editable.
- **Listado de leads**: sin cambios de componente — la columna folio ya renderiza `context.folio`, mostrará `B-XXXXX` para leads base automáticamente.

## Sección 5 — Testing

### `folio.service.test.ts` (nuevo/enriquecido)

- `generateBaseFolio()` retorna `B-` + 5 chars del charset, formato consistente.
- `FOLIO_REGEX` **no** matchea un folio base (`B-XXXXX`).

### `flow-engine` (tests nuevos, deps mockeadas, sin BD)

- Orphan sin folio + base configurada → `campaignLeads.create` con `campaignId=base.id`, `setLead`, `flowStates.create`, `executeNode` en el nodo de entrada, `leadEvents.record({type:'enrolled'})`.
- Orphan con folio pero `findPendingByFolio` null + base → mismo enrolamiento (verifica `enrollFromFolio` false → orphan).
- Orphan + **sin** base (`findActiveBase` null) → no crea lead, no envía, no llama `setLead` (silencioso).
- Contacto con `conversation.leadId` seteado → no invoca `findActiveBase`; va a `processFlowInput`.
- Re-engagement: contacto ya enrolado en la base → reusa `campaign_lead`, no crea folio nuevo, no duplica `flowState`.

### `campaign.service.test.ts` (nuevos)

- `createCampaign({kind:'base'})` ignora `entryMessage`/`origins`.
- `createCampaign({kind:'base'})` cuando ya existe base → `409 BASE_ALREADY_EXISTS`.
- `createCampaign({kind:'base'})` con flujo sin nodo interactivo → error de validación.
- `updateCampaign` no permite cambiar `kind`.
- `findActiveBase()` devuelve la base o null.

### Migración

Verificación manual con `npm run migration:run`; confirmar el índice parcial con un segundo `INSERT kind='base'` que debe fallar.

### Frontend

Tests unitarios del listado (banner cuando no hay base, badge "Base" en la fila) y del dialog de creación (radios solo sin base). El `FlowEditor` se reusa sin cambios.

## Fuera de Fase 1 (Fase 2 — versionado)

- Publicar nueva versión de la base, archivar la anterior.
- Labels de versión, fechas de activación/cierre.
- Métricas por versión (qué versión tuvo más leads).
- UX cambio-simple-vs-nueva-versión.
- Re-engagement de leads con flujo `completed`.
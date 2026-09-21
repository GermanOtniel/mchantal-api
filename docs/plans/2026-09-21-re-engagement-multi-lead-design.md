# Re-engagement multi-lead: lead descalificado "en el limbo" — Diseño

**Fecha:** 2026-09-21
**Fase:** única. Incluye fix del bug (núcleo) + aviso de coordinación en el CRM.

## Problema

Un contacto puede tener varios `campaign_lead` (uno por campaña en la que fue inscrito vía folio — `UNIQUE(contact_id, campaign_id)`). Cuando un operador marca uno de esos leads como `disqualified` (o `qualified`) esperando que el contacto re-entre a la campaña base al escribir sin folio, **no pasa nada**: el re-engagement no se dispara. El lead descalificado queda "en el limbo".

### Causa raíz (confirmada en código)

El re-engagement **no** revisa "el último ni el primer lead" del contacto, ni todos sus leads: revisa **el único lead linkeado a la conversación abierta** (`whatsapp_conversations.leadId`).

1. La conversación de WhatsApp tiene un solo FK `leadId`. `FlowEngine.enrollFromFolio` y `enrollInBase` llaman `conversations.setLead(conversationId, lead.id)` que **sobrescribe** ese FK (`whatsapp-conversation.repository.ts:45-47`, un simple `update`). Resultado: la conversación queda apuntando al lead del folio/base **más reciente**.
2. Al llegar un mensaje sin folio, `handleInbound` (`flow-engine.ts:18-24`) carga `conversation.leadId`, trae ese lead, y `shouldReengage` lo evalúa **a él solo**. Si ese lead no es `qualified|disqualified`, no re-engageda — aunque el contacto tenga **otro** lead `disqualified` esperando.
3. `findOpenByContactId` devuelve la conversación abierta más reciente (`order: createdAt DESC`). De facto hay una sola conversación abierta por contacto (no hay constraint DB, pero el código la trata así).

### Reproducción

- Contacto envía folio 1 (campaña A) → se crea lead1, `conversation.leadId = lead1`.
- Contacto envía folio 2 (campaña B) → `findByContactAndCampaign` no encuentra → crea lead2 → `setLead` sobrescribe → `conversation.leadId = lead2`.
- Operador marca lead1 `disqualified` en el CRM.
- Contacto escribe sin folio → `handleInbound` revisa lead2 (`new`) → `shouldReengage = false` → silencioso. lead1 `disqualified` nunca se considera.

Confirmado en prod: con un contacto de un solo lead, marcarlo `disqualified` + mensaje sin folio **sí** dispara el re-engagement. Con múltiples leads, falla si se marca el equivocado.

### Matices relevantes (encontrados al investigar)

- **El chat del CRM es el mismo para todos los leads del contacto.** `getLead` (`leads.service.ts`) obtiene la conversación con `findOpenByContactId(lead.contactId)`, no la del lead específico. El operador abre lead1, ve el thread (bound a lead2) + el Q&A de lead1. **No hay forma visible de saber a cuál lead está bound la conversación.**
- **Inconsistencia `needsReply` list vs detail:** en `listLeads` el repo joinea `wc.lead_id = cl.id` → solo el lead que coincide con `conversation.leadId` muestra `needsReply=true`. En `getLead` (detail), `needsReply` se calcula de la conversación del contacto sin importar el lead → puede mostrar `true` para un lead que en la lista mostraba `false`.
- **Ya hay precedente multi-lead:** `assertConversationInScope` (`conversation.service.ts`) no usa `conversation.leadId` para permisos porque reconoce que "el último lead del contacto podría estar asignado a otro ejecutivo cuando el contacto tiene varios leads". El codebase ya sabe que `conversation.leadId` es "el último", no "el relevante".

## Enfoque descartado: cascade de status + modal de fricción

Se evaluó cascadear el `qualified|disqualified` a **todos** los leads abiertos del contacto al cambiar status, con un modal "ya les avise" + tipear "confirmo". **Descartado** por:

- **No robusto a folios futuros:** el cascade es point-in-time. Si después el contacto manda un folio nuevo (campaña C), se crea lead3 `new`, la conversación se rebindea a lead3, y el `disqualified` vuelve a quedar ignorado → **bug recreado**. Requeriría que el operador re-cascadeara cada vez.
- **Cambio semántico:** `qualified|disqualified` pasarían de per-lead (per-campaña) a per-contacto globales. Disqualificar campaña A mataría campaña B.
- **`qualified` cascadeado es semánticamente raro.**
- **Hijack de flujo activo:** cascadear `disqualified` a un lead con `flowState` activo abortaría ese flujo al enfriarse.
- **Permisos:** cascadear a leads de otros ejecutivos necesita una decisión de scope nueva.
- **Más superficie de código** que B (API bulk + CRM modal), no menos.

## Enfoque elegido: B — re-engagement escanea leads hermanos del contacto

En `handleInbound`, cuando el lead de la conversación **no** re-engageda **ni** está en flujo activo ni `paused`, buscar un lead hermano del contacto que sea `qualified|disqualified`, no `paused`, y frío (> ventana), y enrolar en base desde ahí. La decisión se toma en **cada inbound**, así que es **robusta a folios futuros** sin intervención del operador.

**Criterio de selección (empate):** si hay varios hermanos elegibles, gana el del `status_change` más reciente (el último que el operador marcó).

## Decisiones asentidas

- **B como núcleo.** No toca `enrollInBase` ni `shouldReengage` — reusa ambos.
- **No escanear cuando el lead de la conversación está `paused`** (agente manual): respeta el control manual.
- **No escanear cuando el lead de la conversación tiene flujo `active`**: no secuestra flujos activos.
- **Selección solo si hay >1 elegible** — si hay uno, gana sin consultar events.
- **`shouldReengage` se reusa** para el filtro frío/paused sobre los hermanos (no se duplica lógica en SQL).
- **Aviso de coordinación CRM incluido** en este cambio: awareness puro, sin cascade ni fricción pesada, solo cuando hay otros leads abiertos asignados a **otros** ejecutivos.
- **Sin migración de DB.** Dos métodos nuevos en repos existentes.

## Sección 1 — Cambio en `handleInbound` (núcleo del fix)

Hoy `handleInbound` (mensaje sin folio) hace:

```ts
const lead = await this.deps.campaignLeads.findById(conversation.leadId)
if (!lead) return
const flowState = await this.deps.flowStates.findByCampaignLeadId(lead.id)
if (this.shouldReengage(lead, flowState)) {
  // enrollInBase ...
  return
}
if (!flowState || flowState.status !== 'active') return
await this.processFlowInput(sender, ctx, lead, flowState)
```

Con B:

```ts
const lead = await this.deps.campaignLeads.findById(conversation.leadId)
if (!lead) return
const flowState = await this.deps.flowStates.findByCampaignLeadId(lead.id)
if (this.shouldReengage(lead, flowState)) {
  await this.enrollInBase(sender, ctx, base)
  return
}
if (flowState?.status === 'active') {
  await this.processFlowInput(sender, ctx, lead, flowState)
  return
}
if (flowState?.status === 'paused') return // agente manual: no escanea

// nuevo: la conversación no re-engageda ni tiene flujo activo/paused.
// Buscar un lead hermano terminal+frío del contacto.
const sibling = await this.findReengageableSibling(ctx.contactId, lead.id)
if (sibling) {
  const base = await this.deps.campaigns.findActiveBase()
  if (!base) return
  await this.enrollInBase(sender, ctx, base)
  return
}
return // silencioso
```

`enrollInBase` no cambia: sigue creando/reusando el lead de la campaña base y haciendo `setLead`. El lead hermano es solo el **disparador**, no se modifica. Funcionalmente `enrollInBase` es idéntico sin importar cuál hermano dispare; el criterio de selección da determinismo para tests y futuro attribution.

### Casos cubiertos

| Lead conversación | flowState | Hermano | Resultado |
|---|---|---|---|
| `new` | `completed` | `disqualified` frío | **re-engage a base** (el bug) ✅ |
| `new` | `completed` | `qualified` frío | **re-engage a base** ✅ |
| `new` | `active` | `disqualified` frío | `processFlowInput` (no secuestra) ✅ |
| `new`/cualquier | `paused` | `disqualified` frío | silencioso (agente manual) ✅ |
| `new` | `completed` | `disqualified` **dentro de ventana** | silencioso (no frío) ✅ |
| `new` | `completed` | `disqualified` frío pero hermano `paused` | silencioso ✅ |
| `new` | `completed` | ninguno terminal | silencioso (sin cambio) |

**Robustez a folio futuro:** el escaneo decide en cada inbound, así que un lead3 `new` creado por un folio posterior no revive el bug — en el próximo sin folio, el escaneo encuentra al hermano `disqualified`.

### Método nuevo `findReengageableSibling`

```ts
private async findReengageableSibling(
  contactId: string,
  excludeLeadId: string
): Promise<CampaignLeadData | null> {
  const terminales = await this.deps.campaignLeads.findTerminalByContactId(
    contactId, excludeLeadId
  )
  const elegibles = terminales.filter((l) => {
    const fs = l.flowState ?? null
    return this.shouldReengage(l, fs)
  })
  if (elegibles.length === 0) return null
  if (elegibles.length === 1) return elegibles[0]
  const winnerId = await this.deps.leadEvents.findLatestStatusChangeLeadId(
    elegibles.map((l) => l.id)
  )
  return elegibles.find((l) => l.id === winnerId) ?? elegibles[0]
}
```

## Sección 2 — Capa de datos (repo + events)

Sin migración. Dos métodos nuevos en puertos existentes.

### `CampaignLeadRepositoryPort.findTerminalByContactId(contactId, excludeLeadId)`

Devuelve los leads del contacto con `status IN ('qualified','disqualified')`, excluyendo `excludeLeadId`, **con su `flowState` cargado** (left join a `lead_flow_states`). **No** filtra por frío/paused acá — ese chequeo lo hace `shouldReengage` en el flow-engine.

Requiere un tipo de retorno que incluya `flowState`:

```ts
export type LeadWithFlowState = CampaignLeadData & { flowState: LeadFlowStateData | null }

// en CampaignLeadRepositoryPort:
findTerminalByContactId(
  contactId: string,
  excludeLeadId: string
): Promise<LeadWithFlowState[]>
```

Implementación (`campaign-lead.repository.ts`): `createQueryBuilder` con `leftJoin('lead_flow_states', ...)`, `where contactId = :contactId AND id != :exclude AND status IN (...)`.

### `LeadEventsRepositoryPort.findLatestStatusChangeLeadId(leadIds: string[])`

Devuelve el `leadId` cuyo evento `status_change` más reciente es el último entre los pasados, o `null`. Solo se llama si `findTerminalByContactId` devuelve **más de uno** elegible.

```ts
// en LeadEventsRepositoryPort:
findLatestStatusChangeLeadId(leadIds: string[]): Promise<string | null>
```

SQL: `SELECT lead_id, max(created_at) AS latest FROM lead_events WHERE type='status_change' AND lead_id = ANY(:leadIds) GROUP BY lead_id ORDER BY latest DESC LIMIT 1`.

### Notas

- No hay N+1 problemático: un contacto tiene típicamente 2-3 leads.
- `shouldReengage` queda intacto — ya recibe `(lead, flowState)`.
- `FlowEngineDeps` gana acceso a `leadEvents` (ya está como opcional `leadEvents?`); el método nuevo lo requiere. Se confirma que `leadEvents` esté presente en el wiring de producción (ya lo está para milestones).

## Sección 3 — Testing (TDD)

Tests en `flow-engine.test.ts` (extienden los de re-engagement "trigger 3").

**Happy path / bug original:**
1. Lead conv `new` + flowState `completed` + hermano `disqualified` frío → `enrollInBase` llamado, `setLead` a base, envía nodo base.
2. Lead conv `new` + flowState `completed` + hermano `qualified` frío → idem.

**No-escaneo (protecciones):**
3. Lead conv `new` + flowState `active` + hermano `disqualified` frío → NO escanea, va a `processFlowInput`.
4. Lead conv `paused` + hermano `disqualified` frío → NO escanea, silencioso.
5. Lead conv `new` + flowState `completed` + hermano `disqualified` **dentro de ventana** → silencioso.
6. Lead conv `new` + flowState `completed` + hermano `disqualified` frío pero flowState hermano `paused` → silencioso.

**Selección (empate):**
7. Dos hermanos elegibles → `findLatestStatusChangeLeadId` llamado con los ids correctos, gana el de status_change más reciente.
8. Un solo hermano elegible → `findLatestStatusChangeLeadId` **no** se llama.

**Robustez a folio futuro:**
9. Simulación del flujo completo en un solo test de flow-engine (mockeando las llamadas secuenciales): folio nuevo crea lead3 `new` + `setLead` rebindexa conversación → luego mensaje sin folio con `findById` devolviendo lead3 + `findTerminalByContactId` devolviendo hermano `disqualified` frío → re-engage a base.

**Repo methods:** el codebase **no** tiene infra de DB para tests de repo (todos los tests son de servicio con deps mockeadas; el único `*.repository.test.ts` existente es de funciones puras). Los métodos nuevos (`findTerminalByContactId`, `findLatestStatusChangeLeadId`) se **mockean** en los tests de flow-engine y `leads.service.test.ts`, igual que el resto de deps. Su SQL (thin) se verifica manualmente contra prod/staging. No se introduce infra de DB test en este cambio (YAGNI).

## Sección 4 — Aviso de coordinación en el CRM

Awareness puro (sin cascade, sin "type confirmo"). El operador ve qué otros ejecutivos atienden leads del mismo contacto antes de cambiar status.

**Cuándo aparece:** al abrir el `LeadStatusDialog` de un lead, si el contacto tiene **otros leads abiertos** (`new|in_progress|on_hold`) asignados a **otros** ejecutivos (excluye sin asignar y los del propio operador). Si no hay, no aparece (cero fricción).

**Qué muestra:** una sección dentro del dialog existente:
> Este contacto tiene otros leads en curso atendidos por otros ejecutivos:
> • Campaña B — Juan Pérez
> • Campaña C — María Gómez
> Considera avisarles antes de cambiar el estatus.

**Botón "Cambiar estatus":** sigue habilitado (no bloquea). El cambio aplica solo al lead editado, como hoy. La lógica de re-engagement (Sección 1) ya se encarga de que el cambio surta efecto sin importar el lead bound a la conversación.

### Datos necesarios

**API:** extensión de `getLead` (o campo nuevo en `LeadDetailResponse`) que devuelva:

```ts
siblings: { campaignName: string; assignedExecutiveName: string }[]
```

para los leads abiertos del contacto (excluyendo el actual, solo `new|in_progress|on_hold`, solo asignados a un ejecutivo distinto al... criterio: distinto al actual lead's assignee? o distinto al usuario autenticado?). **Decisión (cerrada):** listar leads abiertos asignados a un ejecutivo **distinto al usuario autenticado** (el operador que abre el dialog). Esto excluye los leads propios del operador y los sin asignar, y lista los de terceros. Reusa `campaignLeads` (nuevo método `findOpenSiblingsByContactId(contactId, excludeLeadId, excludeAssigneeUserId)` o extensión del que ya necesitamos) + join de exec. El `userId` ya viaja en `getLead` input.

**CRM:** `LeadStatusDialog` consulta ese campo y renderiza la lista. Componente pequeño, sin state nuevo.

## Sección 5 — Out of scope (YAGNI)

- **Cascade de status** (descartado, ver arriba).
- **Re-apuntar la conversación al lead atendido** (Approach A) — side-effects en scope/needsReply, races entre operadores. No necesario: B ya corrige sin tocar el binding.
- **Un solo lead activo por contacto** (Approach C) — rediseño grande, el multi-lead es intencional.
- **Resolver la inconsistencia `needsReply` list vs detail** — secundaria, no bloquea el fix. Follow-up.
- **Constraint DB de una sola conversación abierta por contacto** — el código ya lo trata así; no duele ahora.
- **Attribution del re-engagement al lead hermano disparador** (eventos) — no cambia comportamiento; follow-up si se quiere trazabilidad.

## Sección 6 — Orden de implementación sugerido

1. **API:** tipos `LeadWithFlowState` + métodos repo (`findTerminalByContactId`, `findLatestStatusChangeLeadId`) con sus tests de repo.
2. **API:** `findReengageableSibling` + cambio en `handleInbound` + tests de flow-engine (TDD: tests primero).
3. **API:** extensión de `getLead` con `siblings` + método repo de siblings.
4. **CRM:** `LeadStatusDialog` renderiza el aviso.
5. Verificación: `build` + `test` (37/37 actuales + nuevos) en API; `build` + `test` en CRM.

## Puntos abiertos

- Ninguno (criterio del aviso cerrado: distintos al usuario autenticado).
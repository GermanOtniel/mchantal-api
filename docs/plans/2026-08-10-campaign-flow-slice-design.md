# Campaign Flow — Rebanada funcional (design)

Fecha: 2026-08-10
Rama: `feat/campaign-flow` (en `mchantal-api` y `mchantal-crm`), desde `main`.

## Objetivo

Rehacer desde cero (backend + frontend) el módulo de campañas con un **flujo
conversacional automatizado** que se ejecuta en WhatsApp, empezando por la
rebanada más delgada que sea **funcional** y escalando complejidad desde ahí.

La rebanada de esta iteración: **definir y ejecutar un árbol de conversación**
(preguntas → respuestas → sub-preguntas → …, profundidad N) en WhatsApp,
**sin** etiquetado ni asignación. Solo el flujo de la conversación.

## Decisiones de fondo (acordadas)

- **Empezar de cero ambos lados.** El backend de campañas/flujo se rehace; la
  plomería WhatsApp probada se **replica** (no se reinventa) trayendo solo las
  piezas mínimas en cada paso. Razón: ser dueños del stack y eliminar la
  ambigüedad de "¿falló el backend heredado o el frontend?".
- **Rama desde `main`** en ambos repos. `main` solo tiene auth → base limpia,
  reusando la infraestructura del proyecto (deps, scripts, `.env`, Postgres,
  túnel). La vieja `feat/campaigns2.0` se conserva intacta como referencia
  (`git show feat/campaigns2.0:<path>`).
- **BD nueva y limpia** (p. ej. `servis_v2_dev`); se apunta `DB_NAME` ahí. La
  vieja `servis_api_dev` se conserva para correr `feat/campaigns2.0` y comparar.
- **Sin `entryRules`.** Más simple que antes. El mensaje que el lead envía se
  define con un campo simple `entryMessage`.
- **YAGNI estricto** en esta iteración: no entra status, paramDefinitions,
  statusDefinitions, reglas de asignación, etiquetado, handoff, set_context/
  set_intent/set_status, realtime/SSE/redis, read-states, ni chat manual del
  CRM. Cada pieza entra en una iteración posterior cuando tenga comportamiento.

## Dos mensajes distintos (no confundir)

1. **`entryMessage`** — el que el **lead nos envía** (con el folio). Plantilla
   con `{{folio}}`. Se construye al abrir `/go/:slug`; el navegador redirige a
   `wa.me/<numero>?text=<entryMessage con folio>`. Es el **disparador**: el
   engine extrae el folio del inbound, busca la captura pendiente e inscribe.
2. **Welcome** — el que el **bot responde** al inscribir. Es el **primer nodo
   `interactive_buttons`** del `flowDefinition`.

## Modelo de Campaign (iter 1)

```
Campaign = { id, slug (único), name, entryMessage, flowDefinition (jsonb),
             createdAt, updatedAt }
```

- `slug`: autogenerado del `name`, único.
- `entryMessage`: string con `{{folio}}` (validado: debe contenerlo).
- `flowDefinition`: el árbol de nodos.

## Modelo de datos / entidades

**Lado campañas/leads (nuevas, mínimas):**
- `Campaign` — arriba.
- `LeadCapture` — `{ id, folio (único, MC-XXXXX), campaignId,
  status: 'pending'|'matched', createdAt }`. Boleto pendiente que vincula
  folio→campaña. Recortada (sin capturedParams/resolvedIntent/entryNodeId/
  initialContext, que eran de entryRules/params).
- `CampaignLead` — `{ id, contactId, campaignId,
  context (jsonb: { folio, answers }), enrolledAt, createdAt, updatedAt }`.
  Recortada (sin statusKey/resolvedIntent/assigneeUserId/isSuccessful).
- `LeadFlowState` — `{ id, campaignLeadId (único), currentNodeId,
  context (jsonb), status: 'active'|'completed', lastInteractionAt,
  completedAt?, timestamps }`. `completed` cuando el lead llega a una rama
  hoja (cierre).

**Lado WhatsApp (traídas de la plomería probada, recortadas):**
- `WhatsAppContact` — `{ id, waId (único), profileName?, timestamps }`.
  `profileName` es el nombre que WhatsApp reporta en el inbound (automático).
- `WhatsAppConversation` — `{ id, contactId, status, leadId? (nullable,
  enlaza con CampaignLead), lastMessageAt, lastMessageDirection, timestamps }`.
- `WhatsAppMessage` — `{ id, conversationId, direction, providerMessageId,
  type, bodyText, status, sentAt, metadata (jsonb), timestamps }`.

**No se traen:** `WhatsAppConversationReadState`, realtime/SSE/redis.

**Migraciones:** una migración nueva en `feat/campaign-flow` crea estas tablas
sobre la BD limpia. No se reusan las migraciones viejas.

## flowDefinition — modelo de nodos (iter 1)

Solo dos tipos de nodo:

```ts
type FlowNode =
  | { id, type: 'interactive_buttons',
      body: string,
      buttons: [{ id, title }],
      transitions: Record<buttonId, nodeId>,
      onFreeText: 'reprompt' }
  | { id, type: 'text_message',
      body: string,
      nextNodeId?: string }

flowDefinition = { nodes: Record<id, FlowNode> }
```

**Reglas:**
- **Entrada** = primer nodo `interactive_buttons` del dict (welcome).
- **Ramificar**: `transitions[buttonId]` → id del nodo destino.
- **Encadenar**: `text_message.nextNodeId` → siguiente nodo (automático).
- **`onFreeText = 'reprompt'`** fijo: si el lead escribe texto en vez de tocar
  un botón, se **reenvía la misma pregunta**.
- **Cierre de rama**: cada rama hoja termina con un `text_message` **sin
  `nextNodeId`**. Tras enviarlo, el motor marca `flowState.status='completed'`.
  El editor auto-crea este cierre por defecto.
- **Profundidad N, sin límite.** El árbol se recorre a lo largo del tiempo (un
  nodo por respuesta del lead), no en una pila profunda → sin límite ni
  desbordamiento. Única restricción: **máx 3 botones por pregunta** (WhatsApp,
  ancho), no profundidad.

## Ciclo de vida del motor (recortado)

1. **Inscripción** (llega el primer mensaje, con folio):
   - Extrae folio (regex `MC-XXXXX`).
   - Busca `LeadCapture` pendiente por folio → campaña.
   - Crea `CampaignLead` (`context = { folio, answers: {} }`); marca captura
     `matched`; enlaza `conversation.leadId`.
   - `entryNode` = primer `interactive_buttons` del flow.
   - Crea `LeadFlowState { currentNodeId: entryNode, status: 'active', context }`.
   - `executeNode(entryNode)` → envía el welcome (body interpolado con
     `{{folio}}` y contexto).
2. **Transición** (el lead toca un botón):
   - Busca `LeadFlowState` activo del lead de esa conversación.
   - Lee `flow.nodes[currentNodeId]` (`interactive_buttons`); obtiene `replyId`.
   - Si `transitions[replyId]` existe → guarda `context.answers[nodeId]=replyId`,
     `currentNodeId = destino`, `executeNode(destino)`.
   - Si escribe texto (no botón) y `onFreeText='reprompt'` → reenvía la misma
     pregunta.
3. **`executeNode(nodeId)`**:
   - `interactive_buttons` → `sendInteractive({toWaId, body, buttons})`,
     persiste outbound. (Queda esperando la siguiente respuesta.)
   - `text_message` → `sendText({toWaId, body})`, persiste. Si `nextNodeId` →
     `executeNode(next)`; si no (cierre) → `flowState.status='completed'`,
     `completedAt=now`. Fin de esa rama.

**Interpolación:** los `body` admiten `{{folio}}` (y más adelante otras vars de
contexto).

## API

**CRM (autenticados):**
- `GET /v1/campaigns` → lista.
- `POST /v1/campaigns` `{ name, entryMessage, flowDefinition? }` → crea (slug
  autogenerado). Devuelve la campaña.
- `GET /v1/campaigns/:id` → para editar.
- `PATCH /v1/campaigns/:id` `{ name?, entryMessage?, flowDefinition? }` →
  actualiza.

**Públicos (sin auth):**
- `POST /v1/public/lead-captures` `{ slug }` → genera folio, crea `LeadCapture`
  pendiente, devuelve `{ folio, redirectUrl }` con
  `redirectUrl = wa.me/<numero>?text=<entryMessage con {{folio}} resuelto>`.
- Frontend `/go/:slug` llama a esto y redirige el navegador a `redirectUrl`.

**Webhook (Meta):**
- `GET /whatsapp` → verificación de suscripción (`hub.challenge`).
- `POST /whatsapp` → verifica firma `X-Hub-Signature-256`, parsea, despacha al
  motor.

## Validación del flow (garantía anti-bug)

Al guardar (POST/PATCH) el backend **valida y rechaza con 400 + lista de
issues** si el flow es inválido → lo persistido siempre es válido y completo.
Reglas (función pura, espejo en el frontend para feedback en vivo):
- `id`s de nodos únicos (claves del dict).
- Existe al menos un `interactive_buttons` (entrada).
- Toda `transitions[btnId]` apunta a un id existente (sin refs colgantes).
- `text_message.nextNodeId` (si existe) apunta a un id existente.
- Cada `interactive_buttons` tiene 1–3 botones, `title` no vacío, `id`s únicos
  dentro del nodo.
- `onFreeText === 'reprompt'`.
- `entryMessage` contiene `{{folio}}`.
- Cada rama termina en un `text_message` sin `nextNodeId` (el editor lo
  garantiza auto-creándolo).

El backend es autoritativo; el frontend duplica la misma lógica (es pequeña)
para mostrar issues antes de guardar.

## Frontend

**Páginas:**
- `CampaignsListPage` → lista; clic va a editar.
- `CampaignFormPage` → crear/editar. Campos: `name`, `entryMessage` (textarea,
  ayuda `{{folio}}`) y el editor de flujo. Un solo botón "Guardar cambios"
  (`type="button"`, `onClick`).

**FlowEditor (UI):**
- Una sola columna recursiva dentro de la Card "Conversación automática".
  Sin preview (queda para después). Sin estado de navegación/path — solo arma
  el árbol (menos superficie de estado que el editor anterior).
- **Indentación:** cada nivel suma `border-l border-surface-border pl-4`
  acumulativo; la profundidad se lee como rieles anidados. Encima de cada hija
  va el conector `ChevronRight size-3` + `text-xs text-muted`: *"si eligen
  'X' →"*.
- **Colapsable:** cada Pregunta tiene un chevron (`ChevronDown`/`ChevronRight`)
  que abre/cierra su sub-árbol (`shadcn Collapsible`). Por defecto expandido;
  colapsado muestra resumen (body truncado + `Badge` "N respuestas"). El
  estado colapsado/expandido vive en un `Set<nodeId>` **local del editor** (UI),
  **no** en `flowDefinition` — colapsar nunca toca los datos.
- **Tarjeta Pregunta** (`interactive_buttons`): header "Pregunta" + borrar;
  `Textarea` para `body`; lista de botones (`Input h-8` título `maxLength 20` +
  borrar); botón `outline sm` "+ Respuesta" (`disabled` a 3 con helper).
- **Tarjeta Cierre** (`text_message`): header "Mensaje de cierre" + borrar;
  `Textarea`; se distingue con `Badge outline` "Cierre" y
  `border-l-2 border-brand-primary/30` (sin abusar del color de marca).
- **Hojas:** dos acciones `outline sm` bajo el botón: "+ Sub-pregunta"
  (`MessagesSquare`) y "Mensaje de cierre" (`MessageSquare`). El editor
  auto-crea un cierre por defecto al añadir sub-pregunta.
- **Nodo entrada:** `Badge outline` "Inicio" (`border-brand-primary/40
  text-brand-secondary-text` + `Flag`).
- **Empty state:** caja `border-dashed border-surface-border bg-surface-card`,
  `MessagesSquare size-8 text-muted`, botón `brand-primary` "Añadir
  bienvenida".
- **Validación en vivo:** issues inline (ring `destructive/30` en la card) +
  resumen abajo (`bg-destructive-bg text-xs text-destructive`).
- **Componentes (shadcn ya presentes):** `Button`, `Input`, `Textarea`,
  `Label`, `Badge`, `Collapsible`, `ScrollArea`, `Tooltip`. Iconos: solo
  `lucide-react`. Todo con tokens de `globals.css`, sin hex hardcodeado.

**Guardado confiable — medidas anti-bug:**
1. Una sola fuente de verdad: estado `flow` con el `flowDefinition` **completo**;
   toda edición produce un `flow` **nuevo entero** (inmutable), nunca una vista
   parcial. El botón Guardar envía ese `flow` entero en un `PATCH`.
2. Sin `<form>` envolvente: el guardado es solo el botón `onClick`. Ningún
   click/Enter en el editor dispara save. Botones del editor `type="button"`.
3. Init una sola vez por campaña: un `ref` evita que un refetch de React Query
   (alt-tab) pise el `flow` local tras editar.
4. Round-trip: tras guardar, invalida+refetch y el flow cargado debe igualar lo
   enviado (verificado con test).
5. El backend rechaza flows inválidos → lo persistido siempre es válido.

## Estrategia de pruebas (TDD, vitest ambos lados)

- **Backend:** `mock-whatsapp-provider` (traído) para testear el motor sin Meta.
  Casos: inscribe desde folio → welcome; botón → transiciona + graba `answers`;
  hoja → cierre → `completed`; texto libre → reprompt. Validación: válidos
  pasan; refs colgantes / botones vacíos / falta `{{folio}}` / rama sin cierre →
  rechazan. API: CRUD + `lead-captures` público + webhook. **Round-trip** (el
  test anti-bug): guardar → recargar → igual al enviado.
- **Frontend:** FlowEditor — agregar sub-pregunta/cierre, editar body, borrar →
  produce flow completo y válido; "Guardar cambios" envía el flow entero en un
  `PATCH`; clicks/Enter no disparan save. Round-trip visual: render del guardado
  = lo enviado.
- **Aceptación manual con Meta real (túnel):** `/go/:slug` → enviar folio →
  welcome → tocar botones → cierre.

## Traer piezas probadas (solo lo necesario, en orden, revisando cada una)

Desde `feat/campaigns2.0`:
1. `whatsapp-provider.interface` + tipos inbound/outbound +
   `mock-whatsapp-provider` + `meta-whatsapp-provider` + `meta-webhook.parser`
   → send + receive.
2. Entidades/repos `WhatsAppContact`/`Conversation`/`Message` (recortadas) →
   persistencia.
3. `InboundWebhookService` + `ConversationService` (solo
   `processInboundEvents`) → despacho.
4. `folio.service` → token de entrada.
5. Webhook controller/routes → cableado.

**Rehechos (somos dueños):** flow engine recortado + entidades
`Campaign`/`LeadCapture`/`CampaignLead`/`LeadFlowState` + repos + API +
validación + todo el frontend.

## Orden de construcción (vertical, cada paso trae solo lo que necesita)

1. **Backend base:** `Campaign` + migración + CRUD + validación (TDD).
2. **Motor recortado con mock provider** (TDD): inscribir/transicionar/completar/
   reprompt.
3. **Traer Meta provider + webhook** → endpoint `/whatsapp` (mock primero, Meta
   real al final).
4. **Entrada:** folio + `lead-captures` público + redirect `wa.me` + página
   `/go/:slug`.
5. **Frontend:** lista + formulario + FlowEditor (TDD del editor y del
   round-trip).
6. **Aceptación en vivo** con Meta real.

## Fuera de esta rebanada (entran después)

`set_tags`, `assign_executive`, `handoff`, `set_context`/`set_intent`/
`set_status`, `statusDefinitions`, `status` de campaña, `paramDefinitions`,
`entryRules`, reglas de asignación / `AssignmentRuleSet`, realtime/SSE/redis,
read-states, chat manual del CRM, vista previa tipo WhatsApp, pedir el nombre
al lead en el flujo (captura de texto libre).
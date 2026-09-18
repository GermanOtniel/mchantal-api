# Asignación en cualquier nivel del flujo — Plan de implementación

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Permitir definir asignación automática en `text_message` y `free_text` (no sólo `text_input`), con herencia por efecto ("primer-ancestro gana" vía flag), y avisos no-bloqueantes en el editor para ramas sin asignación y definiciones redundantes.

**Architecture:** Modelo (a) — la asignación se ejecuta al pasar por el nodo que la define; un flag `assigned` en `flowState.context` hace que el primer ancestro que asigna gane y los descendientes se ignoren. El validador extiende su DFS con un flag `hasAssignment` para emitir warnings. El CRM espeja tipos/validador y muestra la caja de asignación read-only en nodos que heredan.

**Tech Stack:** Fastify 5 + TypeORM + Vitest (API); Vite + React 18 + TS + Vitest + TanStack Query (CRM).

**Diseño de referencia:** `docs/plans/2026-09-14-flow-assignment-inheritance-design.md`.

**Convenciones:** TDD estricto. Un commit por tarea. Backend primero, luego CRM. Los issues existentes del validador quedan con `severity` default `'error'` → siguen bloqueando (tests actuales no rompen).

---

## Fase 1 — Backend (`mchantal-api`)

> **Checkpoint 1:** `npm test` verde en `mchantal-api` tras la Fase 1.

### Task 1: Tipos — `assignment?` en cierres/free_text + `severity?` en ValidationIssue

**TDD scenario:** Modifying types — type-only change; verify with compile + existing tests still green.

**Files:**
- Modify: `src/modules/campaigns/types/flow.types.ts`

**Step 1: Editar `flow.types.ts`**

A `TextMessageNode` añadir `assignment?: AssignmentDirective` (el import ya existe). A `FreeTextNode` añadir `assignment?: AssignmentDirective`. A `ValidationIssue` añadir `severity?: 'error' | 'warning'`:

```ts
export type TextMessageNode = {
  id: string
  type: 'text_message'
  body: string
  nextNodeId?: string
  assignment?: AssignmentDirective
}

export type FreeTextNode = {
  id: string
  type: 'free_text'
  body: string
  storeAs: string
  nextNodeId?: string
  assignment?: AssignmentDirective
}

export type ValidationIssue = { field: string; code: string; message: string; severity?: 'error' | 'warning' }
```

**Step 2: Compilar y correr tests**

Run: `npm test -- --run`
Expected: PASS (sin cambios de comportamiento; sólo tipos).

**Step 3: Commit**

```bash
git add src/modules/campaigns/types/flow.types.ts
git commit -m "feat(flow): añadir assignment opcional a text_message/free_text + severity en ValidationIssue"
```

---

### Task 2: Validador — validar `assignment` en text_message/free_text

**TDD scenario:** New feature — full TDD.

**Files:**
- Modify: `src/modules/campaigns/services/flow-validator.ts`
- Test: `src/modules/campaigns/services/flow-validator.test.ts`

**Step 1: Escribir tests que fallen**

En `flow-validator.test.ts`, añadir (reusa el helper `validFlow()` existente que es `welcome → closing`):

```ts
describe('validateFlowDefinition — assignment en cierres/free_text', () => {
  it('text_message con assignment inválido → ASSIGNMENT_INVALID', () => {
    const flow = validFlow()
    ;(flow.nodes.closing as { assignment?: unknown }).assignment = { mode: 'executive', executiveId: '' }
    expect(codes(validateFlowDefinition(flow))).toContain('ASSIGNMENT_INVALID')
  })
  it('text_message con assignment válido → sin issues', () => {
    const flow = validFlow()
    ;(flow.nodes.closing as { assignment?: unknown }).assignment = { mode: 'manual' }
    expect(validateFlowDefinition(flow)).toEqual([])
  })
  it('free_text con assignment inválido → ASSIGNMENT_INVALID', () => {
    const flow = validFlow()
    flow.nodes.capture = { id: 'capture', type: 'free_text', body: '¿Comentario?', storeAs: 'com', nextNodeId: undefined, assignment: { mode: 'pool', selector: { kind: 'coverage', attribute: '', value: '{{answers.estado}}' }, strategy: 'round_robin' } }
    ;(flow.nodes.welcome as { transitions?: Record<string,string> }).transitions = { comprar: 'capture' }
    expect(codes(validateFlowDefinition(flow))).toContain('ASSIGNMENT_INVALID')
  })
})
```

**Step 2: Run — verificar fail**

Run: `npm test -- --run flow-validator`
Expected: FAIL (`ASSIGNMENT_INVALID` no se emite).

**Step 3: Implementar**

En `flow-validator.ts`, importar `validateAssignmentDirective` desde `../../executives/services/assignment-validator`. En la rama `text_message` (tras la validación de `nextNodeId`) y en `validateFreeText` (tras `nextNodeId`), añadir:

```ts
if (n.assignment) {
  if (validateAssignmentDirective(n.assignment).length > 0) {
    issues.push(issue(`${base}.assignment`, 'ASSIGNMENT_INVALID', 'La directiva de asignación es inválida.'))
  }
}
```

**Step 4: Run — verificar pass**

Run: `npm test -- --run flow-validator`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/modules/campaigns/services/flow-validator.ts src/modules/campaigns/services/flow-validator.test.ts
git commit -m "feat(flow-validator): valida assignment en text_message y free_text"
```

---

### Task 3: Validador — warnings `ASSIGNMENT_REDUNDANT` y `BRANCH_WITHOUT_ASSIGNMENT`

**TDD scenario:** New feature — full TDD.

**Files:**
- Modify: `src/modules/campaigns/services/flow-validator.ts`
- Test: `src/modules/campaigns/services/flow-validator.test.ts`

**Step 1: Escribir tests que fallen**

```ts
describe('validateFlowDefinition — avisos de asignación (warnings)', () => {
  it('rama terminal sin asignación → BRANCH_WITHOUT_ASSIGNMENT (warning)', () => {
    const flow = validFlow() // welcome -> closing, sin assignment en ningún lado
    const issues = validateFlowDefinition(flow)
    const w = issues.find(i => i.code === 'BRANCH_WITHOUT_ASSIGNMENT')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('warning')
  })
  it('rama terminal CON assignment en el cierre → sin warning', () => {
    const flow = validFlow()
    ;(flow.nodes.closing as { assignment?: unknown }).assignment = { mode: 'manual' }
    expect(validateFlowDefinition(flow).filter(i => i.severity === 'warning')).toEqual([])
  })
  it('hijo redefine asignación cuando el ancestro ya la tiene → ASSIGNMENT_REDUNDANT (warning)', () => {
    const flow = validFlow()
    ;(flow.nodes.closing as { assignment?: unknown }).assignment = { mode: 'manual' }
    // encadena closing -> closing2 (también con assignment)
    flow.nodes.closing2 = { id: 'closing2', type: 'text_message', body: 'Fin', assignment: { mode: 'manual' } }
    ;(flow.nodes.closing as { nextNodeId?: string }).nextNodeId = 'closing2'
    const issues = validateFlowDefinition(flow)
    const r = issues.find(i => i.code === 'ASSIGNMENT_REDUNDANT' && i.field.includes('closing2'))
    expect(r).toBeDefined()
    expect(r!.severity).toBe('warning')
  })
  it('free_text terminal sin asignación y sin ancestro → warning', () => {
    const flow = validFlow()
    flow.nodes.capture = { id: 'capture', type: 'free_text', body: '¿Comentario?', storeAs: 'com' }
    ;(flow.nodes.welcome as { transitions?: Record<string,string> }).transitions = { comprar: 'capture' }
    expect(codes(validateFlowDefinition(flow))).toContain('BRANCH_WITHOUT_ASSIGNMENT')
  })
  it('text_input con assignment y transiciones parciales → sin warning', () => {
    const flow = validFlow()
    flow.nodes.ask = { id: 'ask', type: 'text_input', body: '¿Estado?', storeAs: 'estado', matcher: { dictionaryId: 'd1' }, transitions: { jalisco: 'closing' }, assignment: { mode: 'manual' } }
    ;(flow.nodes.welcome as { transitions?: Record<string,string> }).transitions = { comprar: 'ask' }
    expect(validateFlowDefinition(flow).filter(i => i.severity === 'warning')).toEqual([])
  })
})
```

**Step 2: Run — verificar fail**

Run: `npm test -- --run flow-validator`
Expected: FAIL.

**Step 3: Implementar**

Extender el DFS existente (`detectCycles` o un nuevo recorrido dedicado a asignación) para llevar `hasAssignment: boolean`. Recorrido top-down desde `entry`. En cada nodo:

- `selfAssigns = !!(text_message.assignment || free_text.assignment || text_input.assignment || (text_input.assignmentOverrides && Object.keys(...).length))`.
- Si `selfAssigns && hasAssignment` → push `issue(field, 'ASSIGNMENT_REDUNDANT', 'Asignación redundante: ya hay una en un ancestro; el motor la ignorará.')` con `severity: 'warning'`.
- `childHasAssignment = hasAssignment || selfAssigns`.
- Detectar terminal y, si `!childHasAssignment` (es decir, ni ancestro ni self), push `BRANCH_WITHOUT_ASSIGNMENT` con `severity: 'warning'`. Terminales: `text_message` sin `nextNodeId`; `free_text` sin `nextNodeId`; `text_input` sin `defaultTransition` y con `Object.keys(transitions).length === 0` (terminal puro); `text_input` con transiciones pero sin `defaultTransition` (conservador: avisa). Recursar por botones (interactive), `nextNodeId` (text_message/free_text), transitions + defaultTransition + fallback.transition (text_input) pasando `childHasAssignment`.

Helper:

```ts
function issue(field: string, code: string, message: string, severity: 'error' | 'warning' = 'error'): ValidationIssue {
  return { field, code, message, severity }
}
```

(Cambiar la firma existente para aceptar `severity` con default `'error'`; los callers existentes no se tocan.)

**Step 4: Run — verificar pass**

Run: `npm test -- --run flow-validator`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/modules/campaigns/services/flow-validator.ts src/modules/campaigns/services/flow-validator.test.ts
git commit -m "feat(flow-validator): warnings ASSIGNMENT_REDUNDANT y BRANCH_WITHOUT_ASSIGNMENT"
```

---

### Task 4: `campaign.service` — rechazar sólo errores; devolver warnings

**TDD scenario:** Modifying tested code — run existing tests first; full TDD for new behavior.

**Files:**
- Modify: `src/modules/campaigns/services/campaign.service.ts`
- Modify: `src/modules/campaigns/services/campaign.service.test.ts`
- Modify: `src/modules/campaigns/controllers/campaigns.controller.ts`
- Modify: `src/modules/campaigns/schemas/campaigns.schemas.ts`

**Step 1: Correr tests existentes**

Run: `npm test -- --run campaign.service`
Expected: PASS (baseline).

**Step 2: Escribir tests que fallen**

En `campaign.service.test.ts`:

```ts
it('createCampaign guarda cuando el flujo sólo tiene warnings (sin errores)', async () => {
  // flujo welcome->closing sin assignment → sólo BRANCH_WITHOUT_ASSIGNMENT (warning)
  const flow = { entryNodeId: 'welcome', nodes: { welcome: { id: 'welcome', type: 'interactive_buttons', body: 'Hola {{folio}}', buttons: [{id:'b1',title:'Sí'}], transitions: { b1: 'closing' } }, closing: { id: 'closing', type: 'text_message', body: 'Gracias' } } }
  // mock campaigns.create + slugExists; ver patrón existente en el archivo
  await service.createCampaign({ name: 'Camp', entryMessage: 'Hola {{folio}}', flowDefinition: flow })
  expect(campaigns.create).toHaveBeenCalled()
})

it('updateCampaign rechaza cuando hay errores (no warnings)', async () => {
  const flow = { nodes: { welcome: { id: 'welcome', type: 'interactive_buttons', body: '', buttons: [], transitions: {} } } } // BUTTONS_EMPTY (error)
  await expect(service.updateCampaign('c1', { flowDefinition: flow })).rejects.toMatchObject({ code: 'INVALID_FLOW' })
})
```

**Step 3: Run — verificar fail**

Run: `npm test -- --run campaign.service`
Expected: FAIL (hoy rechaza con cualquier issue).

**Step 4: Implementar**

En `campaign.service.ts`, añadir helper:

```ts
function splitSeverity(issues: ValidationIssue[]) {
  return { errors: issues.filter(i => (i.severity ?? 'error') === 'error'), warnings: issues.filter(i => i.severity === 'warning') }
}
```

En `createCampaign` y `updateCampaign`, reemplazar el bloque `if (flowIssues.length > 0) throw` por:

```ts
const { errors, warnings } = splitSeverity(flowIssues)
if (errors.length > 0) throw new HttpError('Flujo inválido', 400, 'INVALID_FLOW', errors)
```

Para devolver warnings al cliente: cambiar el return de `createCampaign`/`updateCampaign` a `{ campaign, warnings }` (o exponer vía un método que el controller consuma). Opción simple: el controller valida por separado. **Mejor:** que `createCampaign`/`updateCampaign` devuelvan `{ campaign: Campaign, warnings: ValidationIssue[] }`.

En `campaigns.controller.ts`, `toResponse` queda igual; los handlers `create`/`update` envían `{ ...toResponse(c), warnings }`.

En `campaigns.schemas.ts`, extender `CampaignResponseSchema` con `warnings: Type.Optional(Type.Array(Type.Any()))` (o un schema de issue).

**Step 5: Run — verificar pass**

Run: `npm test -- --run campaign.service`
Expected: PASS. Ajustar tests existentes que asuman shape `Campaign` directo si ahora devuelve `{ campaign, warnings }` (idealmente mantener return `Campaign` y exponer warnings por otro canal para minimizar breakage — ver nota).

> **Nota de minimización de breakage:** si devolver `{ campaign, warnings }` rompe muchos callers/tests, alternativa: mantener el return `Campaign` y añadir un método `validateForSave(flow): { errors, warnings }` que el controller llame antes de `create`/`update` para incluir `warnings` en la response sin cambiar la firma del servicio. Preferir esta alternativa si el conteo de tests rotos es alto.

**Step 6: Commit**

```bash
git add src/modules/campaigns/services/campaign.service.ts src/modules/campaigns/services/campaign.service.test.ts src/modules/campaigns/controllers/campaigns.controller.ts src/modules/campaigns/schemas/campaigns.schemas.ts
git commit -m "feat(campaigns): rechaza sólo errores; devuelve warnings al cliente"
```

---

### Task 5: Motor — flag `assigned` + ejecutar asignación en `text_message`

**TDD scenario:** New feature — full TDD.

**Files:**
- Modify: `src/modules/leads/services/flow-engine.ts`
- Test: `src/modules/leads/services/flow-engine.test.ts`

**Step 1: Escribir tests que fallen**

```ts
describe('FlowEngine — assignment en text_message', () => {
  it('cierre con assignment manual → asigna al llegar y marca flag', async () => {
    const flow = demoFlow()
    ;(flow.nodes.closing_piel as { assignment?: unknown }).assignment = { mode: 'manual' }
    const { lead, state } = leadAndState(flow, 'ask_producto')
    const deps = wireLead(lead, state)
    deps.assignment = { resolve: vi.fn(async () => ({ mode: 'manual', executiveId: null })) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', interactiveReplyId: 'piel' }) }))
    expect(deps.assignment.resolve).toHaveBeenCalledWith({ mode: 'manual' }, expect.anything())
    expect(lead.assignmentMode).toBe('manual')
    expect((state.context as { assigned?: boolean }).assigned).toBe(true)
  })
  it('cierre sin assignment → no asigna, flag queda ausente', async () => {
    const flow = demoFlow()
    const { lead, state } = leadAndState(flow, 'ask_producto')
    const deps = wireLead(lead, state)
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', interactiveReplyId: 'piel' }) }))
    expect(deps.assignment.resolve).not.toHaveBeenCalled()
    expect((state.context as { assigned?: boolean }).assigned).toBeUndefined()
  })
})
```

**Step 2: Run — verificar fail**

Run: `npm test -- --run flow-engine`
Expected: FAIL.

**Step 3: Implementar**

Añadir helper en `flow-engine.ts`:

```ts
private async maybeAssign(lead: CampaignLeadData, flowState: LeadFlowStateData, directive: AssignmentDirective | undefined): Promise<void> {
  if (!directive) return
  const ctx = flowState.context as { assigned?: boolean }
  if (ctx.assigned) return
  const result = await this.deps.assignment.resolve(directive, flowState.context)
  lead.assignmentMode = result.mode
  lead.assignedExecutiveId = result.executiveId
  lead.assignedAt = new Date()
  await this.deps.campaignLeads.save(lead)
  flowState.context = { ...flowState.context, assigned: true }
  await this.deps.flowStates.save(flowState)
}
```

En `executeNode`, rama `text_message`: tras `await this.sendText(...)` y antes del bloque `if (node.nextNodeId)`, llamar `await this.maybeAssign(lead, flowState, node.assignment)`. (Así asigna al pasar, tanto si es terminal como si encadena.)

**Step 4: Run — verificar pass**

Run: `npm test -- --run flow-engine`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/modules/leads/services/flow-engine.ts src/modules/leads/services/flow-engine.test.ts
git commit -m "feat(flow-engine): ejecuta assignment en text_message vía flag assigned"
```

---

### Task 6: Motor — ejecutar asignación en `free_text`

**TDD scenario:** New feature — full TDD.

**Files:**
- Modify: `src/modules/leads/services/flow-engine.ts`
- Test: `src/modules/leads/services/flow-engine.test.ts`

**Step 1: Escribir test que falle**

```ts
describe('FlowEngine — assignment en free_text', () => {
  it('free_text con assignment → asigna al capturar', async () => {
    const flow: FlowDefinition = { nodes: {
      capture: { id: 'capture', type: 'free_text', body: '¿Comentario?', storeAs: 'com', assignment: { mode: 'executive', executiveId: 'e1' } },
    } }
    const { lead, state } = leadAndState(flow, 'capture')
    const deps = wireLead(lead, state)
    deps.assignment = { resolve: vi.fn(async () => ({ mode: 'executive', executiveId: 'e1' })) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'Hola' }) }))
    expect(deps.assignment.resolve).toHaveBeenCalledWith({ mode: 'executive', executiveId: 'e1' }, expect.anything())
    expect(lead.assignedExecutiveId).toBe('e1')
    expect((state.context as { assigned?: boolean }).assigned).toBe(true)
  })
})
```

**Step 2: Run — verificar fail**

Run: `npm test -- --run flow-engine`
Expected: FAIL.

**Step 3: Implementar**

En `processFreeText`, tras guardar `answers[storeAs]` y `flowStates.save`, antes del `if (node.nextNodeId)`: `await this.maybeAssign(lead, flowState, node.assignment)`.

**Step 4: Run — verificar pass**

Run: `npm test -- --run flow-engine`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/modules/leads/services/flow-engine.ts src/modules/leads/services/flow-engine.test.ts
git commit -m "feat(flow-engine): ejecuta assignment en free_text"
```

---

### Task 7: Motor — `text_input` respeta el flag (ya no pisa al padre)

**TDD scenario:** Modifying tested code — run existing tests first; TDD for the new guard.

**Files:**
- Modify: `src/modules/leads/services/flow-engine.ts`
- Test: `src/modules/leads/services/flow-engine.test.ts`

**Step 1: Correr tests existentes de text_input**

Run: `npm test -- --run flow-engine`
Expected: PASS (baseline).

**Step 2: Escribir test que falle**

```ts
it('text_input con assignment no pisa si un ancestro ya asignó (flag assigned)', async () => {
  // flujo: welcome (interactive) -> closing_intermedio (text_message con assignment manual) -> ask (text_input con assignment pool)
  const flow: FlowDefinition = { nodes: {
    welcome: { id:'welcome', type:'interactive_buttons', body:'¿?', buttons:[{id:'b1',title:'Sí'}], transitions:{ b1:'closing_intermedio' } },
    closing_intermedio: { id:'closing_intermedio', type:'text_message', body:'Ok', nextNodeId:'ask', assignment:{ mode:'manual' } },
    ask: { id:'ask', type:'text_input', body:'¿Estado?', storeAs:'estado', matcher:{ dictionaryId:'d1' }, assignment:{ mode:'pool', selector:{ kind:'coverage', attribute:'states', value:'{{answers.estado}}' }, strategy:'round_robin' } },
  } }
  const { lead, state } = leadAndState(flow, 'welcome')
  const deps = wireLead(lead, state)
  deps.dictionaries = { findById: vi.fn(async () => ({ id:'d1', slug:'x', name:'x', categories:[{id:'jalisco',label:'Jalisco',aliases:['jalisco']}], isSystem:false })) }
  deps.assignment = { resolve: vi.fn(async () => ({ mode:'manual', executiveId: null })) }
  const { sender } = makeSender()
  const engine = new FlowEngine(deps)
  // primer inbound: botón -> pasa por closing_intermedio (asigna manual, flag=true) -> llega a ask (prompt)
  await engine.handleInbound(sender, ctx({ message: msg({ type:'text', interactiveReplyId:'b1' }) }))
  expect(lead.assignmentMode).toBe('manual')
  // segundo inbound: texto que clasifica jalisco en ask -> NO debe pisar (flag assigned)
  await engine.handleInbound(sender, ctx({ message: msg({ type:'text', text:'jalisco' }) }))
  expect(lead.assignmentMode).toBe('manual') // sigue manual, no pool
})
```

**Step 3: Run — verificar fail**

Run: `npm test -- --run flow-engine`
Expected: FAIL (hoy `ask` pisa a manual).

**Step 4: Implementar**

En `processTextInput`, reemplazar el bloque de resolución de asignación:

```ts
const directive: AssignmentDirective | undefined =
  node.assignmentOverrides?.[result.categoryId] ?? node.assignment
await this.maybeAssign(lead, flowState, directive)
```

(el `maybeAssign` ya chequea el flag; elimina la mutación directa de `lead` que había).

**Step 5: Run — verificar pass**

Run: `npm test -- --run flow-engine`
Expected: PASS (incluye los tests existentes de text_input: el caso "nodo sin assignment no asigna" sigue pasando porque `maybeAssign(undefined)` retorna temprano; el caso "assignmentOverrides gana" sigue pasando porque se resuelve el override).

**Step 6: Commit**

```bash
git add src/modules/leads/services/flow-engine.ts src/modules/leads/services/flow-engine.test.ts
git commit -m "fix(flow-engine): text_input respeta asignación del ancestro (primer-ancestro gana)"
```

---

### Checkpoint 1

Run: `cd mchantal-api && npm test -- --run`
Expected: todo verde. Revisar que no haya warnings inesperados en flujos válidos existentes (ej. el `demoFlow` de los tests ahora emite `BRANCH_WITHOUT_ASSIGNMENT` en sus cierres — es esperado y correcto, no es un test failure salvo que algún test asuma `toEqual([])` en un flujo sin asignación; ajustar esos assertions a filtrar warnings o a añadir assignment).

---

## Fase 2 — CRM (`mchantal-crm`)

> **Checkpoint 2:** `npm test` verde en `mchantal-crm` tras la Fase 2.

### Task 8: flowModel — tipos + helpers

**TDD scenario:** New feature — full TDD.

**Files:**
- Modify: `src/components/campaigns/flow/flowModel.ts`
- Test: `src/components/campaigns/flow/flowModel.test.ts`

**Step 1: Escribir tests que fallen**

```ts
import { setTextMessageAssignment, setFreeTextAssignment, newTextNode, newFreeTextNode } from './flowModel'

describe('flowModel — assignment en cierres/free_text', () => {
  it('setTextMessageAssignment setea la directiva', () => {
    const n = newTextNode('c1', 'Fin')
    expect(setTextMessageAssignment(n, { mode: 'manual' }).assignment).toEqual({ mode: 'manual' })
  })
  it('setFreeTextAssignment setea la directiva', () => {
    const n = newFreeTextNode('f1', '¿Comentario?')
    expect(setFreeTextAssignment(n, { mode: 'executive', executiveId: 'e1' }).assignment).toEqual({ mode: 'executive', executiveId: 'e1' })
  })
})
```

**Step 2: Run — verificar fail**

Run: `npm test -- --run flowModel`
Expected: FAIL.

**Step 3: Implementar**

Añadir `assignment?: AssignmentDirective` a `TextMessageNode` y `FreeTextNode` en `flowModel.ts` (el import de `AssignmentDirective` ya existe). Añadir:

```ts
export function setTextMessageAssignment(node: TextMessageNode, a: AssignmentDirective | undefined): TextMessageNode {
  return { ...node, assignment: a }
}
export function setFreeTextAssignment(node: FreeTextNode, a: AssignmentDirective | undefined): FreeTextNode {
  return { ...node, assignment: a }
}
```

**Step 4: Run — verificar pass**

Run: `npm test -- --run flowModel`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/campaigns/flow/flowModel.ts src/components/campaigns/flow/flowModel.test.ts
git commit -m "feat(flowModel): assignment en text_message/free_text + helpers"
```

---

### Task 9: flowValidator (CRM) — severity + validar assignment en cierres/free_text

**TDD scenario:** New feature — full TDD (espejo del Task 2).

**Files:**
- Modify: `src/components/campaigns/flow/flowValidator.ts`
- Test: `src/components/campaigns/flow/flowValidator.test.ts`

**Step 1: Escribir tests** (espejo del Task 2: `ASSIGNMENT_INVALID` en text_message/free_text).

**Step 2: Run — verificar fail.** Run: `npm test -- --run flowValidator`

**Step 3: Implementar** — añadir `severity?` a `ValidationIssue`; importar `validateAssignmentDirective` desde `@/lib/matcher/assignment-validator`; validar `n.assignment` en `text_message` y `validateFreeText` igual que el backend.

**Step 4: Run — verificar pass.**

**Step 5: Commit**

```bash
git add src/components/campaigns/flow/flowValidator.ts src/components/campaigns/flow/flowValidator.test.ts
git commit -m "feat(flowValidator): severity + valida assignment en cierres/free_text"
```

---

### Task 10: flowValidator (CRM) — warnings `ASSIGNMENT_REDUNDANT` + `BRANCH_WITHOUT_ASSIGNMENT`

**TDD scenario:** New feature — full TDD (espejo del Task 3).

**Files:**
- Modify: `src/components/campaigns/flow/flowValidator.ts`
- Test: `src/components/campaigns/flow/flowValidator.test.ts`

**Step 1: Escribir tests** (espejo del Task 3).

**Step 2: Run — verificar fail.** Run: `npm test -- --run flowValidator`

**Step 3: Implementar** — mismo DFS con `hasAssignment` que el backend; helper `issue(..., severity)`.

**Step 4: Run — verificar pass.**

**Step 5: Commit**

```bash
git add src/components/campaigns/flow/flowValidator.ts src/components/campaigns/flow/flowValidator.test.ts
git commit -m "feat(flowValidator): warnings de asignación (espejo backend)"
```

---

### Task 11: Extraer `AssignmentBox` + `PoolFields` a componente compartido

**TDD scenario:** Refactor — mantener tests verdes; no nuevo comportamiento.

**Files:**
- Create: `src/components/campaigns/flow/AssignmentBox.tsx`
- Modify: `src/components/campaigns/flow/TextInputCard.tsx`

**Step 1: Correr tests existentes**

Run: `npm test -- --run TextInputCard FlowEditor`
Expected: PASS (baseline).

**Step 2: Extraer**

Mover `AssignmentBox`, `PoolFields`, `CategoryOverrideEditor`, `nodeLabel` (la interna) de `TextInputCard.tsx` a `AssignmentBox.tsx`, exportándolos. `TextInputCard.tsx` los importa desde `./AssignmentBox`. Exportar dos variantes:

```ts
export function AssignmentBox(props: { node: TextInputNode; categories: ...; onAssignment; onSetOverrides; ... }): JSX.Element  // completa con overrides
export function SimpleAssignmentBox(props: { value: AssignmentDirective | undefined; onChange: (a: AssignmentDirective | undefined) => void; storeAs?: string; readOnly?: boolean; inheritedFrom?: string }): JSX.Element  // sin overrides, para cierres/free_text
```

`SimpleAssignmentBox` reusa `PoolFields` internamente. Cuando `readOnly=true` muestra el badge "Heredada de `<inheritedFrom>`" y no renderiza los controles editables.

**Step 3: Run — verificar pass**

Run: `npm test -- --run TextInputCard FlowEditor`
Expected: PASS (sin cambios de comportamiento).

**Step 4: Commit**

```bash
git add src/components/campaigns/flow/AssignmentBox.tsx src/components/campaigns/flow/TextInputCard.tsx
git commit -m "refactor(flow): extraer AssignmentBox a componente compartido + SimpleAssignmentBox"
```

---

### Task 12: `ClosingCard` + `FreeTextCard` ganan `SimpleAssignmentBox`

**TDD scenario:** New feature — full TDD.

**Files:**
- Modify: `src/components/campaigns/flow/FlowEditor.tsx` (`ClosingCard`)
- Modify: `src/components/campaigns/flow/FreeTextCard.tsx`
- Test: `src/components/campaigns/flow/FlowEditor.test.tsx`

**Step 1: Escribir test que falle**

```ts
it('ClosingCard permite setear asignación manual', () => {
  const node = { id:'c1', type:'text_message', body:'Fin' }
  render(<ClosingCard node={node} hasIssue={false} onUpdate={onUpdate} onRemove={onRemove} hasAssignment={false} />)
  fireEvent.click(screen.getByText('Pendiente manual'))
  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ assignment: { mode: 'manual' } }))
})
```

**Step 2: Run — verificar fail.** Run: `npm test -- --run FlowEditor`

**Step 3: Implementar**

- `ClosingCard`: recibir props `hasAssignment: boolean`, `inheritedFrom?: string`, `onUpdate`. Debajo del textarea, renderizar `SimpleAssignmentBox` con `value={node.assignment}`, `onChange={(a) => onUpdate(setTextMessageAssignment(node, a))}`, `readOnly={hasAssignment && !node.assignment}`, `inheritedFrom`. Importar `setTextMessageAssignment` de `./flowModel`.
- `FreeTextCard`: igual con `setFreeTextAssignment` y prop `hasAssignment`/`inheritedFrom`.

**Step 4: Run — verificar pass.**

**Step 5: Commit**

```bash
git add src/components/campaigns/flow/FlowEditor.tsx src/components/campaigns/flow/FreeTextCard.tsx src/components/campaigns/flow/FlowEditor.test.tsx
git commit -m "feat(flow-ui): caja de asignación en ClosingCard y FreeTextCard"
```

---

### Task 13: `FlowEditor` — threadear `hasAssignment` + render de warnings (amarillo)

**TDD scenario:** New feature — full TDD.

**Files:**
- Modify: `src/components/campaigns/flow/FlowEditor.tsx`
- Test: `src/components/campaigns/flow/FlowEditor.test.tsx`

**Step 1: Escribir tests que fallen**

```ts
it('un nodo que hereda asignación muestra caja read-only "Heredada"', () => {
  // welcome -> closing (assignment manual) -> closing2 ; closing2 hereda
  const flow = { entryNodeId:'welcome', nodes: { welcome:{...transitions:{b1:'closing'}}, closing:{...assignment:{mode:'manual'},nextNodeId:'closing2'}, closing2:{id:'closing2',type:'text_message',body:'Fin'} } }
  render(<FlowEditor value={flow} onChange={...} />)
  // expanding closing2 card → contiene texto "Heredada"
  expect(screen.getByText(/Heredada/i)).toBeInTheDocument()
})
it('un warning pinta la card con clase de warning (amarillo), no de error', () => {
  // flujo welcome->closing sin assignment → BRANCH_WITHOUT_ASSIGNMENT (warning) en closing
  render(<FlowEditor value={flowSinAsignacion} onChange={...} />)
  const card = screen.getByTestId('card-closing')
  expect(card.className).not.toContain('destructive')
})
```

**Step 2: Run — verificar fail.** Run: `npm test -- --run FlowEditor`

**Step 3: Implementar**

- `FlowTree`: añadir prop `hasAssignment: boolean` y `inheritedFrom?: string`. En `InteractiveCard`/`ClosingCard`/`FreeTextCard`/`TextInputCard` pasarlo. Calcular `selfAssigns` por nodo y `childHasAssignment = hasAssignment || selfAssigns`; pasar `childHasAssignment` a los sub-`FlowTree`. El `inheritedFrom` para un nodo = el id del ancestro más cercano que asigna (threadearlo, o null).
- Pasar `hasAssignment`/`inheritedFrom` a `ClosingCard` y `FreeTextCard` (Task 12 ya los consume).
- En el `issuesByNode`, distinguir severidad: las cards con issues de `severity === 'warning'` se estilan con borde amarillo (ej. clase `border-amber-400/40 ring-1 ring-amber-400/20`) y un ícono de alerta; las de error siguen con `destructive`. Añadir `data-testid={`card-${node.id}`}` para testabilidad.
- El `FlowTree` raíz arranca con `hasAssignment={false}`.

**Step 4: Run — verificar pass.**

**Step 5: Commit**

```bash
git add src/components/campaigns/flow/FlowEditor.tsx src/components/campaigns/flow/FlowEditor.test.tsx
git commit -m "feat(flow-ui): herencia hasAssignment, caja read-only y warnings en amarillo"
```

---

### Task 14: `CampaignFormPage` — warnings no-bloqueantes

**TDD scenario:** Modifying tested code — run existing first; TDD for warnings.

**Files:**
- Modify: `src/pages/CampaignFormPage.tsx`
- Test: `src/pages/CampaignFormPage.test.tsx`
- Modify: `src/lib/api/campaigns.ts` (tipar `warnings` en response)

**Step 1: Correr tests existentes.** Run: `npm test -- --run CampaignFormPage`

**Step 2: Escribir test que falle**

```ts
it('muestra toast de warnings pero guarda igual', async () => {
  // mutar updateCampaign para resolver con { ...campaign, warnings: [{...BRANCH_WITHOUT_ASSIGNMENT...}] }
  // render, guardar, esperar toast "1 rama sin asignación" Y que create/update fue llamado
})
```

**Step 3: Run — verificar fail.**

**Step 4: Implementar**

- En `campaigns.ts`, tipar el retorno de `updateCampaign`/`createCampaign` como `Campaign & { warnings?: ValidationIssue[] }`.
- En `CampaignFormPage.onSave`: el chequeo local `validateFlowDefinition(flow)` debe **sólo bloquear** si hay issues con `severity === 'error'` (o sin severity). Los warnings locales no bloquean; se muestran como `toast.warning('N ramas sin asignación')`.
- Tras un guardado exitoso, si la response trae `warnings`, mostrar `toast.warning(resumen)`.
- Separar la cuenta: `const flowErrors = flowIssues.filter(i => (i.severity ?? 'error') === 'error')`; `const flowWarnings = flowIssues.filter(i => i.severity === 'warning')`. Si `flowErrors.length > 0` → `toast.error(flowErrors[0].message); return`. Si `flowWarnings.length > 0` → `toast.warning(...)` y **continuar** al mutate.

**Step 5: Run — verificar pass.**

**Step 6: Commit**

```bash
git add src/pages/CampaignFormPage.tsx src/pages/CampaignFormPage.test.tsx src/lib/api/campaigns.ts
git commit -m "feat(campaign-form): warnings no-bloqueantes al guardar"
```

---

### Checkpoint 2

Run: `cd mchantal-crm && npm test -- --run`
Expected: todo verde.

**Verificación manual:** crear/editar una campaña; poner un `text_message` de cierre con asignación manual (verde); verificar que un cierre heredado muestra "Heredada" read-only; verificar que una rama sin asignación muestra warning amarillo; guardar y ver toast de warnings sin bloqueo.

---

## Notas de ejecución

- Cada tarea = un commit. Correr el comando de tests indicado antes de cada commit.
- Los tests que hoy asumen `validateFlowDefinition(flowValido) === []` para flujos **sin asignación** van a romper al añadir `BRANCH_WITHOUT_ASSIGNMENT`. Es esperado: ajustar esos assertions a `filter(i => i.severity === 'error')` o añadir assignment al fixture. Esto se detecta en el Checkpoint 1 (backend) y Task 10 (CRM).
- El `demoFlow()` de `flow-engine.test.ts` no emite warnings (es un fixture de motor, no de validador) — no se ve afectado salvo que algún test de validador lo reutilice.
- Orden estricto: Fase 1 completa antes de Fase 2 (el CRM depende de que el backend acepte `assignment` en cierres/free_text).
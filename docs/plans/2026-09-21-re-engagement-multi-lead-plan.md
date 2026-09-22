# Re-engagement multi-lead — Plan de implementación

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Que el re-engagement a campaña base dispare cuando el contacto tiene **cualquier** lead `qualified|disqualified` frío, no solo el bound a la conversación; más un aviso de coordinación en el CRM.

**Architecture:** En `FlowEngine.handleInbound`, cuando el lead de la conversación no re-engageda ni tiene flujo `active`/`paused`, escanear los leads hermanos terminal+fríos del contacto y enrolar en base. Selección por `status_change` más reciente si hay empate. Sin migración: dos métodos nuevos en repos existentes. Aviso CRM: `LeadStatusDialog` lista los leads abiertos del contacto asignados a otros ejecutivos.

**Tech Stack:** API: Node + TypeORM + Vitest (tests de servicio con deps mockeadas — **no** hay DB test). CRM: React + TanStack Query + Testing Library + Vitest.

**Design doc:** `docs/plans/2026-09-21-re-engagement-multi-lead-design.md`

**Branch (ambos repos):** `feat/re-engagement-multi-lead` desde `main`.

**Simplificación vs design doc:** `findTerminalByContactId` **no** devuelve `flowState` (ni tipo `LeadWithFlowState`). El flow-engine obtiene el flowState de cada hermano via `deps.flowStates.findByCampaignLeadId` (que ya existe), reusando `shouldReengage`. Evita un join y un tipo nuevo; N=2-3 leads → 2-3 queries extra, despreciable.

---

## Fase A — API: núcleo del fix (flow-engine + repo methods)

**Checkpoint al final de Fase A:** `npm run build` limpio + `npm test` verde (37 existentes + nuevos) en `mchantal-api`.

### Task A1: Repo `findTerminalByContactId` (port + impl)

**TDD scenario:** Modifying untested repo — sin DB test (patrón del codebase). Se verifica con build; comportamiento se cubre via tests de flow-engine (Fase A posterior).

**Files:**
- Modify: `src/modules/leads/types/leads.types.ts` (puerto `CampaignLeadRepositoryPort`)
- Modify: `src/modules/leads/repositories/campaign-lead.repository.ts`

**Step 1: Agregar al puerto**

En `src/modules/leads/types/leads.types.ts`, dentro de `CampaignLeadRepositoryPort`, agregar:

```ts
  findTerminalByContactId(
    contactId: string,
    excludeLeadId: string
  ): Promise<CampaignLeadData[]>
```

**Step 2: Implementar en el repo**

En `src/modules/leads/repositories/campaign-lead.repository.ts`, agregar el import arriba:

```ts
import { In } from 'typeorm'
```

Agregar método a la clase `CampaignLeadRepository`:

```ts
  async findTerminalByContactId(
    contactId: string,
    excludeLeadId: string
  ): Promise<CampaignLeadData[]> {
    const leads = await this.repo.find({
      where: { contactId, status: In(['qualified', 'disqualified']) },
      relations: ['campaign'],
    })
    return leads.filter((l) => l.id !== excludeLeadId).map(toData)
  }
```

**Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

**Step 4: Commit**

```bash
git add src/modules/leads/types/leads.types.ts src/modules/leads/repositories/campaign-lead.repository.ts
git commit -m "feat(leads): findTerminalByContactId en CampaignLeadRepository"
```

---

### Task A2: Repo `findLatestStatusChangeLeadId` (port + impl)

**Files:**
- Modify: `src/modules/leads/types/leads.types.ts` (puerto `LeadEventsRepositoryPort`)
- Modify: `src/modules/leads/repositories/lead-event.repository.ts`

**Step 1: Agregar al puerto**

En `src/modules/leads/types/leads.types.ts`, dentro de `LeadEventsRepositoryPort`, agregar:

```ts
  findLatestStatusChangeLeadId(leadIds: string[]): Promise<string | null>
```

**Step 2: Implementar en el repo**

En `src/modules/leads/repositories/lead-event.repository.ts`, agregar método a la clase `LeadEventsRepository`:

```ts
  async findLatestStatusChangeLeadId(leadIds: string[]): Promise<string | null> {
    if (leadIds.length === 0) return null
    const row = await this.repo
      .createQueryBuilder('e')
      .select('e.lead_id', 'leadId')
      .addSelect('MAX(e.created_at)', 'latest')
      .where('e.type = :type', { type: 'status_change' })
      .andWhere('e.lead_id IN (:...leadIds)', { leadIds })
      .groupBy('e.lead_id')
      .orderBy('latest', 'DESC')
      .limit(1)
      .getRawOne<{ leadId: string }>()
    return row?.leadId ?? null
  }
```

**Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

**Step 4: Commit**

```bash
git add src/modules/leads/types/leads.types.ts src/modules/leads/repositories/lead-event.repository.ts
git commit -m "feat(leads): findLatestStatusChangeLeadId en LeadEventsRepository"
```

---

### Task A3: Tests flow-engine — happy path del bug (RED)

**TDD scenario:** New feature — full TDD cycle. Estos tests fallan hasta que `findReengageableSibling` + el cambio en `handleInbound` existan (Task A4).

**Files:**
- Modify: `src/modules/leads/services/flow-engine.test.ts`

**Step 1: Actualizar mocks para satisfacer el puerto extendido**

En `makeDeps` (`flow-engine.test.ts`), el objeto `campaignLeads` debe incluir el método nuevo. Agregar dentro del objeto `campaignLeads` de `makeDeps`:

```ts
      findTerminalByContactId: vi.fn(async () => []),
```

En `coldReengageDeps`, el objeto `campaignLeads` también debe incluirlo. Agregar:

```ts
        findTerminalByContactId: vi.fn(async () => []),
```

Y donde `leadEvents` se mockea con `as never` (e.g. `leadEvents: { record: vi.fn(async (d: unknown) => d) } as never`), agregar `findLatestStatusChangeLeadId`:

```ts
    leadEvents: { record: vi.fn(async (d: unknown) => d), findLatestStatusChangeLeadId: vi.fn(async () => null) } as never,
```

**Step 2: Agregar helper de sibling**

Al final de la sección de helpers (antes de los `describe`), agregar:

```ts
function siblingLead(over: Partial<CampaignLeadData> = {}): CampaignLeadData {
  return {
    id: 'leadS', contactId: 'ct1', campaignId: 'campS',
    campaign: { id: 'campS', flowDefinition: demoFlow() },
    context: { folio: 'MC-SIB', answers: {} },
    assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
    status: 'disqualified',
    enrolledAt: new Date(Date.now() - 48 * 3600 * 1000),
    origin: 'unknown',
    ...over,
  }
}

function siblingColdCompleted(): LeadFlowStateData {
  return {
    id: 'fsS', campaignLeadId: 'leadS', currentNodeId: 'welcome',
    context: { folio: 'MC-SIB', answers: {} }, status: 'completed',
    lastInteractionAt: new Date(Date.now() - 25 * 3600 * 1000),
    completedAt: new Date(Date.now() - 25 * 3600 * 1000),
  }
}
```

**Step 3: Escribir los tests happy-path (RED)**

Agregar un nuevo `describe` al final del archivo:

```ts
describe('FlowEngine — re-engagement via lead hermano (multi-lead)', () => {
  it('lead conversación new+completed + hermano disqualified frío → enrola en base', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({
          id: 'leadB', contactId: d.contactId, campaignId: d.campaignId,
          campaign: { id: d.campaignId, flowDefinition: baseFlow() },
          context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(),
          assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
        })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'disqualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) =>
          id === 'leadX' ? completedState() : siblingColdCompleted()
        ),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaignLeads.findTerminalByContactId).toHaveBeenCalledWith('ct1', 'leadX')
    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'base1' }))
    expect(deps.conversations.setLead).toHaveBeenCalledWith('conv1', 'leadB')
    expect(sent).toHaveLength(1)
  })

  it('lead conversación new+completed + hermano qualified frío → enrola en base', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({
          id: 'leadB', contactId: d.contactId, campaignId: d.campaignId,
          campaign: { id: d.campaignId, flowDefinition: baseFlow() },
          context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(),
          assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
        })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'qualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) =>
          id === 'leadX' ? completedState() : siblingColdCompleted()
        ),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(sent).toHaveLength(1)
  })
})
```

**Step 4: Verificar que fallan (RED)**

Run: `npx vitest run src/modules/leads/services/flow-engine.test.ts -t "re-engagement via lead hermano"`
Expected: FAIL — `findActiveBase` no llamado / `setLead` no llamado con `leadB` (el motor retorna silencioso porque `handleInbound` no escanea hermanos).

---

### Task A4: Implementar `findReengageableSibling` + cambio en `handleInbound` (GREEN)

**Files:**
- Modify: `src/modules/leads/services/flow-engine.ts`

**Step 1: Modificar `handleInbound`**

Reemplazar el bloque final de `handleInbound` (desde el `if (this.shouldReengage(...))` hasta el final del método) por:

```ts
    const lead = await this.deps.campaignLeads.findById(conversation.leadId)
    if (!lead) return

    const flowState = await this.deps.flowStates.findByCampaignLeadId(lead.id)
    if (this.shouldReengage(lead, flowState)) {
      const base = await this.deps.campaigns.findActiveBase()
      if (!base) return
      await this.enrollInBase(sender, ctx, base)
      return
    }

    if (flowState?.status === 'active') {
      await this.processFlowInput(sender, ctx, lead, flowState)
      return
    }

    if (flowState?.status === 'paused') return

    const sibling = await this.findReengageableSibling(ctx.contactId, lead.id)
    if (sibling) {
      const base = await this.deps.campaigns.findActiveBase()
      if (!base) return
      await this.enrollInBase(sender, ctx, base)
      return
    }
    return
  }
```

(Ojo: el reemplazo empieza en `const lead = await this.deps.campaignLeads.findById(conversation.leadId)`. Conservar el código anterior a esa línea — `extractFolio`/`enrollFromFolio` y el bloque `if (!conversation?.leadId)`.)

**Step 2: Agregar método `findReengageableSibling`**

Dentro de la clase `FlowEngine`, después de `shouldReengage`, agregar:

```ts
  private async findReengageableSibling(
    contactId: string,
    excludeLeadId: string
  ): Promise<CampaignLeadData | null> {
    const terminales = await this.deps.campaignLeads.findTerminalByContactId(
      contactId,
      excludeLeadId
    )
    const elegibles: CampaignLeadData[] = []
    for (const l of terminales) {
      const fs = await this.deps.flowStates.findByCampaignLeadId(l.id)
      if (this.shouldReengage(l, fs)) elegibles.push(l)
    }
    if (elegibles.length === 0) return null
    if (elegibles.length === 1) return elegibles[0]
    const winnerId = await this.deps.leadEvents!.findLatestStatusChangeLeadId(
      elegibles.map((l) => l.id)
    )
    return elegibles.find((l) => l.id === winnerId) ?? elegibles[0]
  }
```

Nota: `this.deps.leadEvents!` — el puerto lo marca opcional (`leadEvents?`), pero el wiring de producción siempre lo provee (ver `create-conversation-service.ts`). El `!` es seguro en prod. (Si se quiere robustez, agregar un guard `if (!this.deps.leadEvents) return elegibles[0]` antes de la llamada.)

**Step 3: Verificar que los tests happy-path pasan (GREEN)**

Run: `npx vitest run src/modules/leads/services/flow-engine.test.ts -t "re-engagement via lead hermano"`
Expected: PASS (los 2 tests).

**Step 4: Verificar suite completa sin regresión**

Run: `npx vitest run src/modules/leads/services/flow-engine.test.ts`
Expected: PASS — todos los tests existentes + los 2 nuevos. Prestar atención a los tests "trigger 3" existentes (usan `findById` devolviendo `qualified`/`disqualified` + `findActiveBase` mock → `shouldReengage` directo, no toca `findTerminalByContactId`). Si alguno rompe, revisar que el mock `campaignLeads.findTerminalByContactId` exista en `coldReengageDeps` (Task A3 Step 1).

**Step 5: Commit**

```bash
git add src/modules/leads/services/flow-engine.ts src/modules/leads/services/flow-engine.test.ts
git commit -m "feat(flow-engine): re-engagement escanea leads hermanos del contacto"
```

---

### Task A5: Tests flow-engine — protecciones (no-escaneo)

**TDD scenario:** Lock-in de protecciones ya implementadas en A4. Deben pasar verde; si alguna falla, hay un gap → fix.

**Files:**
- Modify: `src/modules/leads/services/flow-engine.test.ts`

Dentro del `describe('FlowEngine — re-engagement via lead hermano (multi-lead)')`, agregar:

**Step 1: Tests de protección**

```ts
  it('lead conversación new+ACTIVE + hermano disqualified frío → NO escanea (processFlowInput)', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'leadB', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: baseFlow() }, context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(), assignmentMode: null, assignedExecutiveId: null, assignedAt: null })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'disqualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) => id === 'leadX' ? { ...completedState(), status: 'active' as const } : siblingColdCompleted()),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'comprar' }) }))

    expect(deps.campaignLeads.findTerminalByContactId).not.toHaveBeenCalled()
    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
  })

  it('lead conversación paused + hermano disqualified frío → NO escanea (respeta agente manual)', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'leadB', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: baseFlow() }, context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(), assignmentMode: null, assignedExecutiveId: null, assignedAt: null })),
        findById: vi.fn(async () => existingLead({ status: 'in_progress' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'disqualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) => id === 'leadX' ? { ...completedState(), status: 'paused' as const } : siblingColdCompleted()),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaignLeads.findTerminalByContactId).not.toHaveBeenCalled()
    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
  })

  it('hermano disqualified DENTRO de ventana (no frío) → NO re-engage', async () => {
    const recent = new Date(Date.now() - 1 * 3600 * 1000)
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'leadB', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: baseFlow() }, context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(), assignmentMode: null, assignedExecutiveId: null, assignedAt: null })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'disqualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) => id === 'leadX' ? completedState() : { ...siblingColdCompleted(), lastInteractionAt: recent }),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it('hermano disqualified frío pero flowState hermano paused → NO re-engage', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'leadB', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: baseFlow() }, context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(), assignmentMode: null, assignedExecutiveId: null, assignedAt: null })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'disqualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) => id === 'leadX' ? completedState() : { ...siblingColdCompleted(), status: 'paused' as const }),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })
```

**Step 2: Verificar**

Run: `npx vitest run src/modules/leads/services/flow-engine.test.ts -t "re-engagement via lead hermano"`
Expected: PASS — los 2 happy + 4 protecciones.

**Step 3: Commit**

```bash
git add src/modules/leads/services/flow-engine.test.ts
git commit -m "test(flow-engine): protecciones de no-escaneo (active/paused/ventana/sibling paused)"
```

---

### Task A6: Tests flow-engine — selección (empate) + robustez folio futuro

**Files:**
- Modify: `src/modules/leads/services/flow-engine.test.ts`

Dentro del mismo `describe`, agregar:

**Step 1: Tests de selección**

```ts
  it('dos hermanos elegibles → findLatestStatusChangeLeadId llamado, gana el más reciente', async () => {
    const findLatest = vi.fn(async () => 'leadS2')
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'leadB', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: baseFlow() }, context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(), assignmentMode: null, assignedExecutiveId: null, assignedAt: null })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [
          siblingLead({ id: 'leadS1', status: 'disqualified' }),
          siblingLead({ id: 'leadS2', status: 'disqualified' }),
        ]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => siblingColdCompleted()),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
      leadEvents: { record: vi.fn(async (d: unknown) => d), findLatestStatusChangeLeadId: findLatest } as never,
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(findLatest).toHaveBeenCalledWith(['leadS1', 'leadS2'])
    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(sent).toHaveLength(1)
  })

  it('un solo hermano elegible → NO llama findLatestStatusChangeLeadId', async () => {
    const findLatest = vi.fn(async () => 'leadS')
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'leadB', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: baseFlow() }, context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(), assignmentMode: null, assignedExecutiveId: null, assignedAt: null })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'disqualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) => id === 'leadX' ? completedState() : siblingColdCompleted()),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
      leadEvents: { record: vi.fn(async (d: unknown) => d), findLatestStatusChangeLeadId: findLatest } as never,
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(findLatest).not.toHaveBeenCalled()
  })
```

**Step 2: Test robustez folio futuro**

```ts
  it('robustez folio futuro: folio nuevo crea lead3 new + rebinda → luego sin folio + hermano disqualified frío → re-engage', async () => {
    // Primer inbound: folio de campaña C → crea lead3, setLead rebindexa conversación.
    const captureC: LeadCaptureData = {
      id: 'capC', folio: 'MC-CCCC', campaignId: 'campC',
      campaign: { id: 'campC', flowDefinition: demoFlow() },
      status: 'pending', campaignLeadId: null, origin: 'unknown',
    }
    let convLeadId = 'leadX' // la conversación arranca apuntando al lead viejo
    const setLead = vi.fn(async (_conv: string, leadId: string) => { convLeadId = leadId })
    const findById = vi.fn(async () => ({
      id: convLeadId, contactId: 'ct1', campaignId: 'campC',
      campaign: { id: 'campC', flowDefinition: demoFlow() },
      context: { folio: 'MC-CCCC', answers: {} },
      assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
      status: 'new', enrolledAt: new Date(), origin: 'unknown',
    }))
    const deps = coldReengageDeps({
      captures: { findPendingByFolio: vi.fn(async (f: string) => f === 'MC-CCCC' ? captureC : null), markMatched: vi.fn(async () => {}) } as never,
      conversations: {
        findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open' as const, leadId: convLeadId, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null })),
        setLead, touchLastMessage: vi.fn(async () => {}),
      },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'lead3', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: demoFlow() }, context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(), assignmentMode: null, assignedExecutiveId: null, assignedAt: null })),
        findById,
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'disqualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) => id === 'lead3' ? completedState() : siblingColdCompleted()),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    // 1) folio nuevo → enrola en campC, conversación rebindexa a lead3
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'MC-CCCC' }) }))
    expect(setLead).toHaveBeenCalledWith('conv1', 'lead3')
    expect(convLeadId).toBe('lead3')

    sent.length = 0
    vi.mocked(deps.campaigns.findActiveBase).mockClear?.()

    // 2) mensaje sin folio → lead3 new+completed, hermano disqualified frío → re-engage a base
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))
    expect(deps.campaignLeads.findTerminalByContactId).toHaveBeenCalledWith('ct1', 'lead3')
    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(sent).toHaveLength(1)
  })
```

**Step 3: Verificar**

Run: `npx vitest run src/modules/leads/services/flow-engine.test.ts -t "re-engagement via lead hermano"`
Expected: PASS — todos (happy + protecciones + selección + folio futuro).

**Step 4: Commit**

```bash
git add src/modules/leads/services/flow-engine.test.ts
git commit -m "test(flow-engine): selección por status_change + robustez a folio futuro"
```

---

### Task A7: Checkpoint Fase A — suite + build

**Step 1: Suite completa API**

Run: `npm test`
Expected: PASS — 37 existentes + los nuevos de flow-engine. Cero fallos.

**Step 2: Build**

Run: `npm run build`
Expected: sin errores de TypeScript.

**Step 3: (Opcional) Verificación manual en staging**

No es bloqueante para el plan, pero recomendado antes de mergear: con un contacto de dos leads, marcar uno `disqualified`, mandar un mensaje sin folio desde el teléfono y confirmar que enrola en base.

---

## Fase B — API: `getLead` devuelve `siblings` (para el aviso CRM)

**Checkpoint:** `npm run build` + `npm test` verde.

### Task B1: Repo `findOpenSiblingsByContactId` (port + impl)

**Files:**
- Modify: `src/modules/leads/types/leads.types.ts`
- Modify: `src/modules/leads/repositories/campaign-lead.repository.ts`

**Step 1: Puerto**

En `CampaignLeadRepositoryPort` (`leads.types.ts`), agregar:

```ts
  findOpenSiblingsByContactId(
    contactId: string,
    excludeLeadId: string,
    excludeAssigneeUserId: string
  ): Promise<{ campaignName: string; assignedExecutiveName: string }[]>
```

**Step 2: Impl**

En `CampaignLeadRepository` (`campaign-lead.repository.ts`):

```ts
  async findOpenSiblingsByContactId(
    contactId: string,
    excludeLeadId: string,
    excludeAssigneeUserId: string
  ): Promise<{ campaignName: string; assignedExecutiveName: string }[]> {
    const rows = await this.repo
      .createQueryBuilder('cl')
      .select('campaign.name', 'campaignName')
      .addSelect('executive.full_name', 'assignedExecutiveName')
      .leftJoin('campaigns', 'campaign', 'campaign.id = cl.campaign_id')
      .leftJoin('users', 'executive', 'executive.id = cl.assigned_executive_id')
      .where('cl.contact_id = :contactId', { contactId })
      .andWhere('cl.id != :excludeLeadId', { excludeLeadId })
      .andWhere('cl.status IN (:...statuses)', {
        statuses: ['new', 'in_progress', 'on_hold'],
      })
      .andWhere('cl.assigned_executive_id IS NOT NULL')
      .andWhere('cl.assigned_executive_id != :excludeAssigneeUserId', {
        excludeAssigneeUserId,
      })
      .getRawMany<{ campaignName: string; assignedExecutiveName: string }>()
    return rows.map((r) => ({
      campaignName: r.campaignName,
      assignedExecutiveName: r.assignedExecutiveName,
    }))
  }
```

**Step 3: Build**

Run: `npm run build`
Expected: sin errores.

**Step 4: Commit**

```bash
git add src/modules/leads/types/leads.types.ts src/modules/leads/repositories/campaign-lead.repository.ts
git commit -m "feat(leads): findOpenSiblingsByContactId para aviso de coordinación"
```

---

### Task B2: `LeadDetailResponse.siblings` + `getLead` (test-first)

**Files:**
- Modify: `src/modules/leads/types/leads.types.ts` (`LeadDetailResponse`)
- Modify: `src/modules/leads/services/leads.service.ts` (`getLead`)
- Modify: `src/modules/leads/services/leads.service.test.ts`

**Step 1: Tipo de respuesta**

En `LeadDetailResponse` (`leads.types.ts`), agregar campo:

```ts
  siblings: { campaignName: string; assignedExecutiveName: string }[]
```

**Step 2: Test RED**

En `leads.service.test.ts`, localizar el mock de `campaignLeads` (el objeto con `findById`, `findByContactAndCampaign`, etc., alrededor de la línea 43) y agregar:

```ts
    findOpenSiblingsByContactId: vi.fn(async () => []),
```

Agregar un test dentro del `describe` de `getLead` (buscar el `describe` existente de `getLead`; si no hay un describe dedicado, agregar junto a los tests de `getLead`):

```ts
  it('getLead incluye siblings (leads abiertos del contacto asignados a otros ejecutivos)', async () => {
    // reusa el helper de datos del archivo; sobrescribe findOpenSiblingsByContactId
    vi.mocked(campaignLeads.findOpenSiblingsByContactId).mockResolvedValue([
      { campaignName: 'Campaña B', assignedExecutiveName: 'Juan Pérez' },
      { campaignName: 'Campaña C', assignedExecutiveName: 'María Gómez' },
    ])
    const res = await service.getLead({ permissions, userId: 'u1', leadId: 'l1' })
    expect(res.siblings).toEqual([
      { campaignName: 'Campaña B', assignedExecutiveName: 'Juan Pérez' },
      { campaignName: 'Campaña C', assignedExecutiveName: 'María Gómez' },
    ])
  })

  it('getLead devuelve siblings vacío si no hay otros leads asignados a terceros', async () => {
    vi.mocked(campaignLeads.findOpenSiblingsByContactId).mockResolvedValue([])
    const res = await service.getLead({ permissions, userId: 'u1', leadId: 'l1' })
    expect(res.siblings).toEqual([])
  })
```

(Adaptar `service`, `permissions`, `userId`, `leadId` a los nombres reales usados en el archivo — revisar la sección `// mocks` y el `beforeEach` de `leads.service.test.ts` para los nombres exactos de variables.)

Run: `npx vitest run src/modules/leads/services/leads.service.test.ts -t "siblings"`
Expected: FAIL — `res.siblings` es `undefined` (getLead aún no lo retorna).

**Step 3: Impl en `getLead`**

En `leads.service.ts`, dentro de `getLead`, antes del `return { ... }` final, agregar:

```ts
    const siblings = await this.campaignLeads.findOpenSiblingsByContactId(
      lead.contactId,
      leadId,
      userId
    )
```

Y en el objeto retornado, agregar el campo:

```ts
      siblings,
```

**Step 4: GREEN**

Run: `npx vitest run src/modules/leads/services/leads.service.test.ts`
Expected: PASS — incluidos los 2 nuevos de siblings y los existentes.

**Step 5: Build**

Run: `npm run build`
Expected: sin errores.

**Step 6: Commit**

```bash
git add src/modules/leads/types/leads.types.ts src/modules/leads/services/leads.service.ts src/modules/leads/services/leads.service.test.ts
git commit -m "feat(leads): getLead devuelve siblings para aviso de coordinación"
```

---

### Task B3: Checkpoint Fase B

Run: `npm test && npm run build`
Expected: todo verde.

---

## Fase C — CRM: aviso de coordinación en `LeadStatusDialog`

**Checkpoint:** `npm test && npm run build` verde en `mchantal-crm`.

### Task C1: Tipo `LeadDetail.siblings`

**Files:**
- Modify: `src/lib/api/leads.ts`

**Step 1**

En el tipo `LeadDetail` (`src/lib/api/leads.ts`), agregar:

```ts
  siblings: { campaignName: string; assignedExecutiveName: string }[]
```

**Step 2: Commit**

```bash
git add src/lib/api/leads.ts
git commit -m "feat(crm): LeadDetail.siblings"
```

---

### Task C2: `LeadStatusDialog` muestra el aviso (test-first)

**Files:**
- Modify: `src/components/leads/LeadStatusDialog.test.tsx`
- Modify: `src/components/leads/LeadStatusDialog.tsx`
- Modify: `src/components/leads/LeadAttendHeader.tsx`

**Step 1: Test RED**

En `LeadStatusDialog.test.tsx`, actualizar `renderDialog` para aceptar `siblings` y agregar tests:

```ts
function renderDialog(
  leadStatus = 'new',
  siblings: { campaignName: string; assignedExecutiveName: string }[] = []
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const lead = { id: 'l1', status: leadStatus }
  return render(
    <QueryClientProvider client={qc}>
      <LeadStatusDialog lead={lead} open={true} onOpenChange={() => {}} siblings={siblings} />
    </QueryClientProvider>,
  )
}
```

Agregar tests:

```ts
  it('muestra aviso de coordinación cuando hay siblings asignados a otros ejecutivos', () => {
    renderDialog('new', [
      { campaignName: 'Campaña B', assignedExecutiveName: 'Juan Pérez' },
      { campaignName: 'Campaña C', assignedExecutiveName: 'María Gómez' },
    ])
    expect(screen.getByText(/otros leads en curso/i)).toBeInTheDocument()
    expect(screen.getByText('Campaña B — Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('Campaña C — María Gómez')).toBeInTheDocument()
  })

  it('no muestra aviso cuando no hay siblings', () => {
    renderDialog('new', [])
    expect(screen.queryByText(/otros leads en curso/i)).not.toBeInTheDocument()
  })
```

Run: `npx vitest run src/components/leads/LeadStatusDialog.test.tsx -t "aviso"`
Expected: FAIL — `siblings` no es prop de `LeadStatusDialog` / el texto no existe.

**Step 2: Impl en `LeadStatusDialog.tsx`**

Actualizar `Props`:

```ts
interface Props {
  lead: { id: string; status: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
  siblings?: { campaignName: string; assignedExecutiveName: string }[]
}
```

Desestructurar `siblings`:

```ts
export function LeadStatusDialog({ lead, open, onOpenChange, onChanged, siblings }: Props) {
```

Dentro del `<form>`, **antes** del select de estatus (o después del `DialogDescription`, dentro del form), agregar condicionalmente:

```tsx
          {siblings && siblings.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
              <p className="font-medium text-warning">
                Este contacto tiene otros leads en curso atendidos por otros ejecutivos:
              </p>
              <ul className="mt-1 list-disc pl-5 text-text-base">
                {siblings.map((s) => (
                  <li key={`${s.campaignName}-${s.assignedExecutiveName}`}>
                    {s.campaignName} — {s.assignedExecutiveName}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-text-muted">Considera avisarles antes de cambiar el estatus.</p>
            </div>
          )}
```

**Step 3: Pasar `siblings` desde `LeadAttendHeader`**

En `LeadAttendHeader.tsx`, el uso del dialog:

```tsx
      {canChangeStatus && (
        <LeadStatusDialog
          lead={{ id: lead.id, status: lead.status }}
          open={statusOpen}
          onOpenChange={setStatusOpen}
          siblings={lead.siblings}
        />
      )}
```

(`lead` es `LeadDetail`, que ahora tiene `siblings`.)

**Step 4: GREEN**

Run: `npx vitest run src/components/leads/LeadStatusDialog.test.tsx`
Expected: PASS — incluidos los 2 nuevos + los 3 existentes.

**Step 5: Build CRM**

Run: `npm run build`
Expected: sin errores (`tsc -b && vite build`).

**Step 6: Commit**

```bash
git add src/components/leads/LeadStatusDialog.tsx src/components/leads/LeadStatusDialog.test.tsx src/components/leads/LeadAttendHeader.tsx
git commit -m "feat(crm): aviso de coordinación en LeadStatusDialog (siblings)"
```

---

### Task C3: Checkpoint Fase C

Run: `npm test && npm run build` (en `mchantal-crm`)
Expected: todo verde.

---

## Cierre

- Ambos repos en `feat/re-engagement-multi-lead`, commits limpios.
- API: `npm test` + `npm run build` verde.
- CRM: `npm test` + `npm run build` verde.
- Abrir PRs (uno por repo) con referencia al design doc `docs/plans/2026-09-21-re-engagement-multi-lead-design.md`.
- Verificación manual en staging recomendada antes de merge (escenario de reproducción del design doc).
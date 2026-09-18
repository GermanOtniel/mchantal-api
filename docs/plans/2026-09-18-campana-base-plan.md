# Campaña base (fallback) — Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Construir la Fase 1 de la campaña base: una campaña designada que atrapa leads cuyo primer mensaje no trae folio válido (caso B) y les da un flujo de atención, reutilizando la infraestructura existente.

**Architecture:** Una columna `kind: 'base' | 'normal'` en `campaigns` con índice único parcial garantiza una sola base. El `FlowEngine.handleInbound` gana una rama `enrollInBase` que se dispara cuando `conversation.leadId === null` tras fallar el match de folio. El CRM muestra un banner cuando no hay base, radios al crear, un formulario base simplificado (sin entryMessage/origins) y un badge en el listado.

**Tech Stack:** Fastify 5 + TypeORM + PostgreSQL + TypeBox + Vitest (API); Vite + React 18 + TanStack Query + React Router + Tailwind + Vitest (CRM).

**Diseño de referencia:** `docs/plans/2026-09-18-campana-base-design.md`

**Dos fases con checkpoint:** Phase A (API) → checkpoint (tests verdes + migración corre) → Phase B (CRM).

---

## Phase A — API (`mchantal-api`)

> Trabaja en la rama `feat/campana-base` (ya creada). `cd mchantal-api`.
> Comando de tests: `npm test` (vitest run). Migración: `npm run migration:run`.

### Task A1: Migración `kind` + entidad Campaign

**TDD scenario:** Trivial change (schema) — verifica con compilación + migración manual.

**Files:**
- Create: `src/database/migrations/1751000000000-CampaignsKindBase.ts`
- Modify: `src/entities/campaigns/campaign.entity.ts`

**Step 1: Crear la migración**

```ts
// src/database/migrations/1751000000000-CampaignsKindBase.ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CampaignsKindBase1751000000000 implements MigrationInterface {
  name = 'CampaignsKindBase1751000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaigns" ADD COLUMN "kind" varchar(20) NOT NULL DEFAULT 'normal'`
    )
    // Índice único parcial: a lo sumo una fila con kind='base'.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "campaigns_single_base" ON "campaigns" ("kind") WHERE "kind" = 'base'`
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "campaigns_single_base"`)
    await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "kind"`)
  }
}
```

**Step 2: Añadir `kind` a la entidad**

En `src/entities/campaigns/campaign.entity.ts`, después de la columna `origins`:

```ts
  @Column({ type: 'varchar', length: 20, default: 'normal' })
  kind!: 'base' | 'normal'
```

**Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: PASS (sin errores nuevos)

**Step 4: Aplicar la migración (manual)**

Run: `npm run migration:run`
Expected: la migración `CampaignsKindBase1751000000000` aparece como ejecutada.

Verificar el índice parcial (opcional, desde una consola SQL):
```sql
SELECT indexname FROM pg_indexes WHERE indexname = 'campaigns_single_base';
```

**Step 5: Commit**

```bash
git add src/database/migrations/1751000000000-CampaignsKindBase.ts src/entities/campaigns/campaign.entity.ts
git commit -m "feat(campaigns): migración kind base + entidad"
```

---

### Task A2: Folio service `generateBaseFolio()`

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `src/modules/leads/services/folio.service.ts`
- Test: `src/modules/leads/services/folio.service.test.ts`

**Step 1: Escribir los tests que fallan**

Añade al final de `src/modules/leads/services/folio.service.test.ts` (crea el archivo si no existe):

```ts
import { describe, it, expect } from 'vitest'
import { generateBaseFolio, FOLIO_REGEX } from './folio.service'

const BASE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

describe('generateBaseFolio', () => {
  it('tiene prefijo B- y 5 chars del charset', () => {
    const folio = generateBaseFolio()
    expect(folio).toMatch(/^B-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/)
  })

  it('no es matcheado por FOLIO_REGEX (no re-dispara enrollFromFolio)', () => {
    const folio = generateBaseFolio()
    expect(FOLIO_REGEX.test(folio)).toBe(false)
  })

  it('genera valores distintos en llamadas sucesivas (no constante)', () => {
    const samples = new Set<string>()
    for (let i = 0; i < 50; i++) samples.add(generateBaseFolio())
    expect(samples.size).toBeGreaterThan(1)
  })
})
```

Nota: si el archivo ya tiene un `describe`/imports previo para `generateFolio`, añade solo el `describe('generateBaseFolio', ...)` y el import de `generateBaseFolio` al import existente (no dupliques `import { describe, it, expect }`).

**Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/modules/leads/services/folio.service.test.ts`
Expected: FAIL — `generateBaseFolio is not a function` (o `is not exported`).

**Step 3: Implementar `generateBaseFolio`**

En `src/modules/leads/services/folio.service.ts`, añade al final:

```ts
export const BASE_FOLIO_PREFIX = 'B-'

export function generateBaseFolio(): string {
  return `${BASE_FOLIO_PREFIX}${generateFolioSuffix()}`
}
```

Reusa `generateFolioSuffix()` (definido arriba en el mismo archivo) y el mismo `FOLIO_CHARSET`/`FOLIO_SUFFIX_LENGTH`. No se toca `FOLIO_REGEX`.

**Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/modules/leads/services/folio.service.test.ts`
Expected: PASS (3 tests).

**Step 5: Commit**

```bash
git add src/modules/leads/services/folio.service.ts src/modules/leads/services/folio.service.test.ts
git commit -m "feat(folio): generateBaseFolio con prefijo B-"
```

---

### Task A3: Tipo `Campaign.kind` + repositorio `findActiveBase()`

**TDD scenario:** Modifying tested code — run existing campaign.service tests after.

**Files:**
- Modify: `src/modules/campaigns/types/campaign.types.ts`
- Modify: `src/modules/campaigns/repositories/campaign.repository.ts`
- Modify: `src/modules/campaigns/services/campaign.service.ts` (firma de `CreateCampaignInput`)

**Step 1: Añadir `kind` al tipo `Campaign` y `CreateCampaignData`**

En `src/modules/campaigns/types/campaign.types.ts`:

- En el tipo `Campaign`, añade `kind: 'base' | 'normal'` (junto a `origins`).
- En `CreateCampaignData`, añade `kind: 'base' | 'normal'`.
- En `CampaignRepositoryPort`, añade el método:
  ```ts
  findActiveBase(): Promise<Campaign | null>
  ```

Queda así (relevantes):
```ts
export type Campaign = {
  id: string
  slug: string
  name: string
  entryMessage: string
  flowDefinition: Record<string, unknown>
  origins: string[]
  kind: 'base' | 'normal'
  createdAt: Date
  updatedAt: Date
}

export type CreateCampaignData = {
  slug: string
  name: string
  entryMessage: string
  flowDefinition: Record<string, unknown>
  origins: string[]
  kind: 'base' | 'normal'
}
```

**Step 2: Implementar `findActiveBase` en el repositorio**

En `src/modules/campaigns/repositories/campaign.repository.ts`, añade el método:

```ts
  async findActiveBase(): Promise<Campaign | null> {
    return this.repo.findOne({ where: { kind: 'base' } })
  }
```

**Step 3: Añadir `kind` a `CreateCampaignInput` en el service**

En `src/modules/campaigns/services/campaign.service.ts`, en `CreateCampaignInput`:

```ts
export type CreateCampaignInput = {
  name: string
  entryMessage: string
  flowDefinition?: Record<string, unknown>
  origins?: string[]
  kind?: 'base' | 'normal'
}
```

**Step 4: Verificar compilación + tests existentes**

Run: `npx tsc --noEmit`
Expected:可能出现 errores en `campaign.service.test.ts` porque `makeCampaign` no incluye `kind` y `create` del repo mock no recibe `kind`. Se corrigen en el Task A4. Si `tsc` falla solo por esos, continúa; los arreglas en A4.

Run: `npx vitest run src/modules/campaigns/services/campaign.service.test.ts`
Expected: puede fallar por los mocks sin `kind` — se arregla en A4.

**Step 5: Commit**

```bash
git add src/modules/campaigns/types/campaign.types.ts src/modules/campaigns/repositories/campaign.repository.ts src/modules/campaigns/services/campaign.service.ts
git commit -m "feat(campaigns): tipo kind + repo.findActiveBase"
```

---

### Task A4: Campaign service — reglas de base (409, ignorar entryMessage/origins, kind inmutable)

**TDD scenario:** New feature — full TDD cycle (tests nuevos sobre las reglas de base).

**Files:**
- Modify: `src/modules/campaigns/services/campaign.service.ts`
- Test: `src/modules/campaigns/services/campaign.service.test.ts`

**Step 1: Añadir tests que fallan**

En `src/modules/campaigns/services/campaign.service.test.ts`:

Primero actualiza los helpers existentes para incluir `kind`:

En `makeCampaign` añade `kind: 'normal' as const` (junto a `origins: []`).
En `makeRepo` añade `findActiveBase: vi.fn().mockResolvedValue(null),` al objeto retornado.

Luego añade este `describe` al final del archivo:

```ts
describe('CampaignService.createCampaign — base', () => {
  it('kind=base: ignora entryMessage y origins', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.createCampaign({
      name: 'Base',
      entryMessage: 'Hola {{folio}}',
      origins: ['Facebook'],
      kind: 'base',
      flowDefinition: validFlow(),
    })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'base',
        entryMessage: '',
        origins: [],
      })
    )
  })

  it('kind=base: lanza 409 BASE_ALREADY_EXISTS si ya hay base', async () => {
    const repo = makeRepo({ findActiveBase: vi.fn().mockResolvedValue(makeCampaign({ kind: 'base' })) })
    const svc = new CampaignService(repo)
    await expect(
      svc.createCampaign({ name: 'Base', entryMessage: 'x', kind: 'base', flowDefinition: validFlow() })
    ).rejects.toMatchObject({ statusCode: 409, code: 'BASE_ALREADY_EXISTS' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('kind=base: requiere al menos un nodo interactivo en el flujo', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await expect(
      svc.createCampaign({ name: 'Base', entryMessage: 'x', kind: 'base', flowDefinition: { nodes: {} } })
    ).rejects.toMatchObject({ code: 'INVALID_FLOW' })
  })

  it('kind por defecto es normal', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.createCampaign({ name: 'Demo', entryMessage: 'Hola {{folio}}', flowDefinition: validFlow() })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'normal' }))
  })
})

describe('CampaignService.updateCampaign — kind inmutable', () => {
  it('lanza 400 si el patch intenta cambiar kind', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeCampaign({ kind: 'normal' })) })
    const svc = new CampaignService(repo)
    await expect(
      svc.updateCampaign('c1', { kind: 'base' } as unknown as Record<string, unknown>)
    ).rejects.toMatchObject({ code: 'KIND_IMMUTABLE' })
    expect(repo.update).not.toHaveBeenCalled()
  })
})
```

Nota: `updateCampaign` hoy recibe `UpdateCampaignData` que NO incluye `kind`. El cast `as unknown as Record<string, unknown>` es para el test; el service debe rechazar `kind` si aparece. Como `UpdateCampaignData` no tiene `kind`, el schema del endpoint ya lo bloquea (additionalProperties: false). El guard en el service es defensa en profundición.

**Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/modules/campaigns/services/campaign.service.test.ts`
Expected: FAIL — los tests nuevos fallan (aún no se ignoran entryMessage/origins, ni hay 409, ni validación de nodo interactivo, ni guard de kind).

**Step 3: Implementar las reglas en `campaign.service.ts`**

Reemplaza el método `createCampaign` por:

```ts
  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const kind = input.kind ?? 'normal'

    if (kind === 'base') {
      // Solo puede existir una base activa.
      const existing = await this.campaigns.findActiveBase()
      if (existing) {
        throw new HttpError(
          'Ya existe una campaña base activa',
          409,
          'BASE_ALREADY_EXISTS'
        )
      }
      // La base no pasa por /go/:slug ni genera captura: entryMessage y origins
      // son irrelevantes. Se descartan (no fallan).
    } else {
      const entryIssues = validateEntryMessage(input.entryMessage)
      if (entryIssues.length > 0) {
        throw new HttpError(
          'Mensaje de entrada inválido',
          400,
          'INVALID_ENTRY_MESSAGE',
          entryIssues
        )
      }
    }

    const flow = input.flowDefinition ?? EMPTY_FLOW
    if (input.flowDefinition !== undefined) {
      const flowIssues = validateFlowDefinition(flow).filter((i) => (i.severity ?? 'error') === 'error')
      if (flowIssues.length > 0) {
        throw new HttpError('Flujo inválido', 400, 'INVALID_FLOW', flowIssues)
      }
    }

    // La base necesita al menos un nodo interactivo: es el punto de entrada
    // del flujo que se le envía al orphan al enrolarlo.
    if (kind === 'base' && !hasInteractiveNode(flow)) {
      throw new HttpError(
        'La campaña base requiere al menos un nodo interactivo (botones)',
        400,
        'INVALID_FLOW'
      )
    }

    const base = slugifyName(input.name)
    let slug = base
    let suffix = 2
    while (await this.campaigns.slugExists(slug)) {
      slug = `${base}-${suffix++}`
    }

    return this.campaigns.create({
      slug,
      name: input.name,
      entryMessage: kind === 'base' ? '' : input.entryMessage,
      flowDefinition: flow,
      origins: kind === 'base' ? [] : normalizeOrigins(input.origins),
      kind,
    })
  }
```

Y añade el helper `hasInteractiveNode` junto a `normalizeOrigins` (arriba en el archivo):

```ts
function hasInteractiveNode(flow: Record<string, unknown>): boolean {
  const nodes = (flow as { nodes?: Record<string, { type?: string }> }).nodes
  if (!nodes) return false
  return Object.values(nodes).some((n) => n?.type === 'interactive_buttons')
}
```

Luego añade el guard de `kind` inmutable al inicio de `updateCampaign`:

```ts
  async updateCampaign(id: string, patch: UpdateCampaignData): Promise<Campaign> {
    if ('kind' in patch && patch.kind !== undefined) {
      throw new HttpError(
        'El tipo de campaña no se puede cambiar',
        400,
        'KIND_IMMUTABLE'
      )
    }
    if (patch.flowDefinition !== undefined) {
      // ... (resto sin cambios)
```

**Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/modules/campaigns/services/campaign.service.test.ts`
Expected: PASS (todos, incluidos los nuevos y los existentes).

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/modules/campaigns/services/campaign.service.ts src/modules/campaigns/services/campaign.service.test.ts
git commit -m "feat(campaigns): reglas de base (409, sin entryMessage/origins, kind inmutable)"
```

---

### Task A5: Schemas + controller `kind` en response

**TDD scenario:** Trivial change — verifica con compilación.

**Files:**
- Modify: `src/modules/campaigns/schemas/campaigns.schemas.ts`
- Modify: `src/modules/campaigns/controllers/campaigns.controller.ts`

**Step 1: Añadir `kind` a los schemas**

En `src/modules/campaigns/schemas/campaigns.schemas.ts`:

En `CampaignResponseSchema` añade el campo:
```ts
  kind: Type.Union([Type.Literal('base'), Type.Literal('normal')]),
```

En `CreateCampaignBodySchema`, haz que `entryMessage` sea opcional (la base no la manda) y añade `kind`:
```ts
export const CreateCampaignBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 2, maxLength: 200 }),
    entryMessage: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    flowDefinition: Type.Optional(FlowDefinitionSchema),
    origins: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 60 }))),
    kind: Type.Optional(Type.Union([Type.Literal('base'), Type.Literal('normal')])),
  },
  { additionalProperties: false }
)
```

`UpdateCampaignBodySchema` no lleva `kind` (es inmutable) — sin cambios.

**Step 2: Añadir `kind` al `toResponse` del controller**

En `src/modules/campaigns/controllers/campaigns.controller.ts`, en `toResponse`:
```ts
function toResponse(c: Campaign) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    entryMessage: c.entryMessage,
    flowDefinition: c.flowDefinition,
    origins: c.origins,
    kind: c.kind,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}
```

**Step 3: Verificar compilación + tests**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS (sin regresiones).

**Step 4: Commit**

```bash
git add src/modules/campaigns/schemas/campaigns.schemas.ts src/modules/campaigns/controllers/campaigns.controller.ts
git commit -m "feat(campaigns): kind en schema y response"
```

---

### Task A6: FlowEngine `enrollInBase` + deps

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `src/modules/leads/types/leads.types.ts`
- Modify: `src/modules/leads/services/flow-engine.ts`
- Test: `src/modules/leads/services/flow-engine.test.ts`

**Step 1: Añadir el port `BaseCampaignPort` a `FlowEngineDeps`**

En `src/modules/leads/types/leads.types.ts`, añade el tipo y el campo en `FlowEngineDeps`:

```ts
export type BaseCampaignData = { id: string; flowDefinition: FlowDefinition }

export interface BaseCampaignPort {
  findActiveBase(): Promise<BaseCampaignData | null>
}
```

Y en `FlowEngineDeps` añade `campaigns: BaseCampaignPort` (junto a `captures`, etc.).

**Step 2: Escribir los tests que fallan**

En `src/modules/leads/services/flow-engine.test.ts`:

Primero actualiza `makeDeps` para incluir `campaigns`:
```ts
function makeDeps(over: Partial<FlowEngineDeps> = {}): FlowEngineDeps {
  return {
    captures: { findPendingByFolio: vi.fn(async () => null), markMatched: vi.fn(async () => {}) },
    campaigns: { findActiveBase: vi.fn(async () => null) },
    campaignLeads: { /* ... existente ... */ },
    // ... resto sin cambios ...
    ...over,
  }
}
```

Añade un helper de flujo base y los tests al final del archivo:

```ts
function baseFlow(): FlowDefinition {
  return {
    nodes: {
      welcome: {
        id: 'welcome',
        type: 'interactive_buttons',
        body: 'Hola, no detectamos tu folio. ¿Te ayudo?',
        buttons: [{ id: 'si', title: 'Sí' }, { id: 'no', title: 'No' }],
        transitions: { si: 'closing', no: 'closing' },
        onFreeText: 'reprompt',
      },
      closing: { id: 'closing', type: 'text_message', body: '¡Gracias!' },
    },
  }
}

describe('FlowEngine — campaña base (orphans)', () => {
  it('sin folio + base configurada: enrola en base, envía nodo de entrada', async () => {
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({
          id: 'leadB', contactId: d.contactId, campaignId: d.campaignId,
          campaign: { id: d.campaignId, flowDefinition: baseFlow() },
          context: d.context, origin: d.origin ?? 'unknown',
        })),
        findById: vi.fn(async () => null),
        save: vi.fn(async (l) => l),
      },
      leadEvents: { record: vi.fn(async () => ({})) } as never,
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'ct1', campaignId: 'base1', context: expect.objectContaining({ answers: {} }) })
    )
    // El folio generado empieza con B-
    const createdArg = (deps.campaignLeads.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(createdArg.context.folio).toMatch(/^B-/)
    expect(deps.conversations.setLead).toHaveBeenCalledWith('conv1', 'leadB')
    expect(deps.flowStates.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaignLeadId: 'leadB', currentNodeId: 'welcome', status: 'active' })
    )
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({ toWaId: '12345', body: 'Hola, no detectamos tu folio. ¿Te ayudo?' })
    )
    expect(sent).toHaveLength(1)
  })

  it('folio presente pero sin captura + base: enrola en base', async () => {
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'leadB', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: baseFlow() }, context: d.context, origin: 'unknown' })),
        findById: vi.fn(async () => null),
        save: vi.fn(async (l) => l),
      },
      leadEvents: { record: vi.fn(async () => ({})) } as never,
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `mi folio es ${FOLIO}` }) }))

    expect(deps.captures.findPendingByFolio).toHaveBeenCalledWith(FOLIO)
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'base1' }))
    expect(sent).toHaveLength(1)
  })

  it('sin base configurada: silencioso (no crea lead, no envía)', async () => {
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => null) },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(deps.conversations.setLead).not.toHaveBeenCalled()
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it('contacto con lead existente (conversation.leadId seteado): no invoca findActiveBase', async () => {
    const flow = demoFlow()
    const lead: CampaignLeadData = {
      id: 'lead1', contactId: 'ct1', campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      context: { folio: FOLIO, answers: {} },
    }
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => lead),
        findById: vi.fn(async () => lead),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'fs1', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
  })

  it('re-engagement: contacto ya enrolado en base reusa campaign_lead (no crea folio nuevo)', async () => {
    const existingLead: CampaignLeadData = {
      id: 'leadB', contactId: 'ct1', campaignId: 'base1',
      campaign: { id: 'base1', flowDefinition: baseFlow() },
      context: { folio: 'B-OLD01', answers: {} },
    }
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => existingLead),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        findById: vi.fn(async () => null),
        save: vi.fn(async (l) => l),
      },
      leadEvents: { record: vi.fn(async () => ({})) } as never,
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(deps.conversations.setLead).toHaveBeenCalledWith('conv1', 'leadB')
    expect(sent).toHaveLength(1)
  })
})
```

**Step 3: Correr los tests para verificar que fallan**

Run: `npx vitest run src/modules/leads/services/flow-engine.test.ts`
Expected: FAIL — los tests nuevos fallan (aún no existe `enrollInBase` ni la rama).

**Step 4: Implementar la rama `enrollInBase` en `flow-engine.ts`**

Modifica `handleInbound` para que quede:

```ts
  async handleInbound(sender: WhatsAppSender, ctx: InboundFlowContext): Promise<void> {
    const folio = extractFolio(ctx.message)
    if (folio) {
      const enrolled = await this.enrollFromFolio(sender, ctx, folio)
      if (enrolled) return
    }

    const conversation = await this.deps.conversations.findById(ctx.conversationId)
    if (!conversation?.leadId) {
      const base = await this.deps.campaigns.findActiveBase()
      if (!base) return
      await this.enrollInBase(sender, ctx, base)
      return
    }

    const lead = await this.deps.campaignLeads.findById(conversation.leadId)
    if (!lead) return

    const flowState = await this.deps.flowStates.findActiveByCampaignLeadId(lead.id)
    if (!flowState) return

    await this.processFlowInput(sender, ctx, lead, flowState)
  }
```

Añade el import de `generateBaseFolio`:
```ts
import { FOLIO_REGEX, generateBaseFolio } from './folio.service'
```

Añade el método `enrollInBase` (justo después de `enrollFromFolio`):

```ts
  private async enrollInBase(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    base: BaseCampaignData
  ): Promise<void> {
    let lead = await this.deps.campaignLeads.findByContactAndCampaign(
      ctx.contactId,
      base.id
    )
    if (!lead) {
      lead = await this.deps.campaignLeads.create({
        contactId: ctx.contactId,
        campaignId: base.id,
        context: { folio: generateBaseFolio(), answers: {} },
        origin: 'unknown',
      })
      await this.deps.leadEvents?.record({
        leadId: lead.id,
        type: 'enrolled',
        fromValue: null,
        toValue: null,
        reason: 'base_campaign',
        milestoneKind: null,
        actorUserId: null,
      })
    }

    await this.deps.conversations.setLead(ctx.conversationId, lead.id)

    const entryNodeId = findFirstInteractiveNode(base.flowDefinition)
    if (!entryNodeId) return

    let flowState = await this.deps.flowStates.findByCampaignLeadId(lead.id)
    if (!flowState) {
      flowState = await this.deps.flowStates.create({
        campaignLeadId: lead.id,
        currentNodeId: entryNodeId,
        context: lead.context,
        status: 'active',
        lastInteractionAt: new Date(),
      })
    }

    await this.executeNode(sender, ctx, lead, flowState, entryNodeId)
  }
```

E importa el tipo `BaseCampaignData` desde los types:
```ts
import type { /* ... existente ... */ BaseCampaignData } from '../types/leads.types'
```

**Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run src/modules/leads/services/flow-engine.test.ts`
Expected: PASS (todos, incluidos los nuevos y los existentes).

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/modules/leads/types/leads.types.ts src/modules/leads/services/flow-engine.ts src/modules/leads/services/flow-engine.test.ts
git commit -m "feat(flow-engine): enrollInBase para orphans sin folio"
```

---

### Task A7: Wire `campaigns` dep en el composition root

**TDD scenario:** Trivial wiring — verifica con compilación.

**Files:**
- Modify: `src/modules/whatsapp/create-conversation-service.ts`

**Step 1: Añadir el dep `campaigns` al FlowEngine**

En `src/modules/whatsapp/create-conversation-service.ts`:

Añade el import:
```ts
import { CampaignRepository } from '../campaigns/repositories/campaign.repository'
import type { FlowDefinition } from '../campaigns/types/flow.types'
```

Dentro de `getConversationService()`, antes de construir el `FlowEngine`, añade:
```ts
    const campaignRepo = new CampaignRepository()
```

Y en el objeto de deps del `new FlowEngine({...})`, añade el campo `campaigns`:
```ts
    const flowEngine = new FlowEngine({
      captures,
      campaigns: {
        findActiveBase: async () => {
          const c = await campaignRepo.findActiveBase()
          if (!c) return null
          return {
            id: c.id,
            flowDefinition: c.flowDefinition as unknown as FlowDefinition,
          }
        },
      },
      campaignLeads,
      flowStates,
      conversations,
      messages,
      dictionaries,
      assignment,
      leadEvents: new LeadEventsRepository(),
      realtimeBus: getRealtimeBus(),
    })
```

El cast `as unknown as FlowDefinition` es el mismo patrón que usa `campaign-lead.repository.ts` en `toData`.

**Step 2: Verificar compilación + tests**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS (sin regresiones).

**Step 3: Commit**

```bash
git add src/modules/whatsapp/create-conversation-service.ts
git commit -m "feat(whatsapp): wired campaigns.findActiveBase al FlowEngine"
```

---

## ✅ Checkpoint — Phase A completa

Antes de pasar al CRM:

1. `cd mchantal-api && npm test` → todo verde.
2. `npx tsc --noEmit` → sin errores.
3. `npm run migration:run` → la migración `CampaignsKindBase1751000000000` corre sin error.
4. (Opcional) Smoke manual: crear una campaña base vía `POST /v1/campaigns` con `kind: 'base'` y un flujo con nodo interactivo, verificar 201; intentar una segunda → 409 `BASE_ALREADY_EXISTS`.

Si todo cuadra, continúa con Phase B.

---

## Phase B — CRM (`mchantal-crm`)

> Trabaja en la rama `feat/campana-base` (ya creada). `cd mchantal-crm`.
> Comando de tests: `npm test`. Dev: `npm run dev`.

### Task B1: API client `kind`

**TDD scenario:** Trivial type change — verifica con compilación + test existente.

**Files:**
- Modify: `src/lib/api/campaigns.ts`

**Step 1: Añadir `kind` a los tipos**

En `src/lib/api/campaigns.ts`:

- En el tipo `Campaign`, añade `kind: 'base' | 'normal'`.
- En `CreateCampaignPayload`, añade `kind?: 'base' | 'normal'`.

```ts
export type Campaign = {
  id: string
  slug: string
  name: string
  entryMessage: string
  flowDefinition: Record<string, unknown>
  origins: string[]
  kind: 'base' | 'normal'
  createdAt: string
  updatedAt: string
}

export type CreateCampaignPayload = {
  name: string
  entryMessage?: string
  flowDefinition?: Record<string, unknown>
  origins?: string[]
  kind?: 'base' | 'normal'
}
```

**Step 2: Verificar**

Run: `npx tsc --noEmit -p tsconfig.app.json` (o `npm run build`)
Expected: pueden aparecer errores en `CampaignsListPage`/`CampaignFormPage` por el `kind` nuevo en respuestas — se resuelven en B2/B4. Si solo fallan por eso, continúa.

Run: `npx vitest run src/lib/api`
Expected: PASS (tests existentes del api client).

**Step 3: Commit**

```bash
git add src/lib/api/campaigns.ts
git commit -m "feat(api): kind en tipos de campaña del CRM"
```

---

### Task B2: CampaignsListPage — badge "Base", banner sin base, sin delete

**TDD scenario:** New feature — full TDD cycle (tests sobre el listado).

**Files:**
- Modify: `src/pages/CampaignsListPage.tsx`
- Test: `src/pages/CampaignsListPage.test.tsx`

**Step 1: Escribir tests que fallan**

Lee primero `src/pages/CampaignsListPage.test.tsx` para ver el patrón de mocks de `fetchCampaigns` (vi.fn mockeado con `vi.mock('@/lib/api/campaigns')`). Añade estos tests:

```ts
it('muestra banner de aviso cuando no hay campaña base', async () => {
  fetchCampaignsMock.mockResolvedValue([
    { id: 'c1', slug: 'verano', name: 'Verano', entryMessage: 'h', flowDefinition: {}, origins: [], kind: 'normal', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ])
  render(<CampaignsListPage />, { wrapper: createWrapper() })
  expect(await screen.findByText(/No hay campaña base configurada/i)).toBeInTheDocument()
})

it('no muestra banner cuando existe una campaña base', async () => {
  fetchCampaignsMock.mockResolvedValue([
    { id: 'b1', slug: 'base', name: 'Base', entryMessage: '', flowDefinition: {}, origins: [], kind: 'base', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'c1', slug: 'verano', name: 'Verano', entryMessage: 'h', flowDefinition: {}, origins: [], kind: 'normal', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ])
  render(<CampaignsListPage />, { wrapper: createWrapper() })
  await screen.findByText('Verano')
  expect(screen.queryByText(/No hay campaña base configurada/i)).not.toBeInTheDocument()
})

it('muestra badge Base en la fila de la campaña base', async () => {
  fetchCampaignsMock.mockResolvedValue([
    { id: 'b1', slug: 'base', name: 'Base', entryMessage: '', flowDefinition: {}, origins: [], kind: 'base', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ])
  render(<CampaignsListPage />, { wrapper: createWrapper() })
  expect(await screen.findByText('Base')).toBeInTheDocument()
})
```

(Usa el `createWrapper`/mock names que ya existan en el archivo. Si el mock se llama distinto, adapta el nombre.)

**Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/pages/CampaignsListPage.test.tsx`
Expected: FAIL — no hay banner ni badge.

**Step 3: Implementar**

En `src/pages/CampaignsListPage.tsx`, añade el cálculo de `hasBase` y el banner + badge. Reemplaza el cuerpo del componente por:

```tsx
export function CampaignsListPage() {
  const navigate = useNavigate()
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  })
  const hasBase = !!campaigns?.some((c) => c.kind === 'base')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-base">Campañas</h1>
        <Button
          type="button"
          onClick={() => navigate(hasBase ? '/campaigns/new' : '/campaigns/new?kind=base')}
          className="gap-1.5"
        >
          <Plus className="size-4" /> Nueva campaña
        </Button>
      </div>

      {!isLoading && !hasBase && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">No hay campaña base configurada.</p>
          <p className="mt-1">
            Los leads que borren su folio identificador del mensaje inicial quedarán huérfanos y no
            recibirán atención.{' '}
            <button
              type="button"
              className="underline underline-offset-2 font-medium"
              onClick={() => navigate('/campaigns/new?kind=base')}
            >
              Crear campaña base
            </button>
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-surface-border bg-surface-card p-10 text-center">
          <Megaphone className="size-8 text-text-muted" />
          <p className="text-sm text-text-muted">Aún no hay campañas. Crea la primera.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Slug público</TableHead>
              <TableHead>Plataformas</TableHead>
              <TableHead>Creada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() => navigate(`/campaigns/${c.id}/edit`)}
              >
                <TableCell className="font-medium text-text-base">
                  <span className="inline-flex items-center gap-2">
                    {c.name}
                    {c.kind === 'base' && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Base
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-text-muted">
                  <code>/go/{c.slug}</code>
                </TableCell>
                <TableCell className="text-text-muted">
                  <span className="tabular-nums">{c.origins.length}</span>
                  {c.origins[0] && <span className="ml-2">{c.origins[0]}</span>}
                </TableCell>
                <TableCell className="text-text-muted">
                  {new Date(c.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
```

Nota: el badge "Base" usa la palabra "Base" — el test `findByText('Base')` la encontrará. Si hay colisión con el nombre de la campaña, el test puede necesitar `getAllByText`; usa `findByRole` con name si es necesario. Ajusta según el mock.

**Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/pages/CampaignsListPage.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/pages/CampaignsListPage.tsx src/pages/CampaignsListPage.test.tsx
git commit -m "feat(campaigns): banner sin base + badge Base en listado"
```

---

### Task B3: Diálogo de radios al crear (cuando no hay base)

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `src/pages/CampaignsListPage.tsx` (botón abre diálogo si no hay base)
- Test: `src/pages/CampaignsListPage.test.tsx`

**Decisión de simplificación:** En lugar de un diálogo, el botón "Nueva campaña" navega directamente a `/campaigns/new?kind=base` cuando no hay base (ya hecho en B2), y a `/campaigns/new` cuando ya hay base. El formulario (Task B4) lee `?kind=base` y muestra un aviso "Estás creando una campaña base" + un link "¿Necesitas una campaña normal?". Esto evita construir un componente Dialog nuevo y cumple el espíritu de los radios (cuando no hay base, el flujo guía a crear base; cuando ya hay, va a normal).

Si prefieres el diálogo explícito con dos radios, reemplaza el `onClick` del botón por una función que abra un `<Dialog>` con radios. El diseño aprobado acepta ambas; la versión sin diálogo es más simple (YAGNI para Fase 1).

**Step 1: Añadir test del botón**

```ts
it('botón Nueva campaña lleva a ?kind=base cuando no hay base', async () => {
  fetchCampaignsMock.mockResolvedValue([])
  render(<CampaignsListPage />, { wrapper: createWrapper() })
  const btn = await screen.findByRole('button', { name: /Nueva campaña/i })
  btn.click()
  expect(mockNavigate).toHaveBeenCalledWith('/campaigns/new?kind=base')
})

it('botón Nueva campaña lleva a /campaigns/new cuando ya hay base', async () => {
  fetchCampaignsMock.mockResolvedValue([
    { id: 'b1', slug: 'base', name: 'Base', entryMessage: '', flowDefinition: {}, origins: [], kind: 'base', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ])
  render(<CampaignsListPage />, { wrapper: createWrapper() })
  const btn = await screen.findByRole('button', { name: /Nueva campaña/i })
  btn.click()
  expect(mockNavigate).toHaveBeenCalledWith('/campaigns/new')
})
```

(Requiere que `useNavigate` esté mockeado en el test — sigue el patrón existente del archivo.)

**Step 2: Correr y verificar que pasan** (la navegación ya se implementó en B2).

Run: `npx vitest run src/pages/CampaignsListPage.test.tsx`
Expected: PASS.

**Step 3: Commit** (si añadiste tests nuevos)

```bash
git add src/pages/CampaignsListPage.test.tsx
git commit -m "test(campaigns): botón navega según existencia de base"
```

---

### Task B4: CampaignFormPage — modo base (oculta entryMessage/origins/URLs, envía kind)

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `src/pages/CampaignFormPage.tsx`
- Test: `src/pages/CampaignFormPage.test.tsx`

**Step 1: Escribir tests que fallan**

Lee `src/pages/CampaignFormPage.test.tsx` para ver el patrón de mocks (`createCampaign`, `fetchCampaign`, `useNavigate`). Añade:

```ts
it('modo base (?kind=base): oculta mensaje de entrada y orígenes, envía kind=base', async () => {
  createCampaignMock.mockResolvedValue({ id: 'b1', slug: 'base', name: 'Base', entryMessage: '', flowDefinition: { nodes: {} }, origins: [], kind: 'base', createdAt: '', updatedAt: '' })
  // render con ruta /campaigns/new?kind=base (usa el helper del test o MemoryRouter initialEntries)
  render(<CampaignFormPage />, { wrapper: createWrapper(['/campaigns/new?kind=base']) })

  expect(screen.queryByLabelText(/Mensaje del lead/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/Plataformas/i)).not.toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Base orphans' } })
  fireEvent.click(screen.getByRole('button', { name: /Crear campaña/i }))

  await waitFor(() => {
    expect(createCampaignMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'base', name: 'Base orphans' }))
  })
})

it('edición de campaña base: oculta mensaje de entrada y orígenes', async () => {
  fetchCampaignMock.mockResolvedValue({ id: 'b1', slug: 'base', name: 'Base', entryMessage: '', flowDefinition: { nodes: {} }, origins: [], kind: 'base', createdAt: '', updatedAt: '' })
  render(<CampaignFormPage />, { wrapper: createWrapper(['/campaigns/b1/edit']) })

  await screen.findByDisplayValue('Base')
  expect(screen.queryByLabelText(/Mensaje del lead/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/Plataformas/i)).not.toBeInTheDocument()
})
```

(Adapta `createWrapper` para que acepte `initialEntries` con la ruta + query string. Si el helper actual no lo soporta, extiéndelo.)

**Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/pages/CampaignFormPage.test.tsx`
Expected: FAIL — aún se muestran entryMessage/origins en modo base.

**Step 3: Implementar el modo base**

En `src/pages/CampaignFormPage.tsx`:

1. Importa `useSearchParams`:
   ```ts
   import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
   ```

2. Dentro del componente, calcula `isBase`:
   ```ts
   const [searchParams] = useSearchParams()
   const [isBase, setIsBase] = useState(searchParams.get('kind') === 'base')
   ```
   Y en el `useEffect` que hidrata la edición, sincroniza `isBase` con el campaign cargado:
   ```ts
   if (campaignQuery.data?.kind === 'base') setIsBase(true)
   ```
   (Dentro del bloque `if (initializedFor.current === id) return` — antes del return, o justo después de setear los otros estados.)

3. En `onSave`, cuando es crear y `isBase`, envía `kind: 'base'` y omite `entryMessage`/`origins`:
   ```ts
   } else {
     createMutation.mutate(
       isBase
         ? { name, kind: 'base' }
         : { name, entryMessage, origins: platforms }
     )
   }
   ```
   Y en la rama de edición, omite `entryMessage`/`origins` si `isBase`:
   ```ts
   if (isEdit && id) {
     const flowIssues = validateFlowDefinition(flow).filter((i) => (i.severity ?? 'error') === 'error')
     if (flowIssues.length > 0) { toast.error(flowIssues[0].message); return }
     updateMutation.mutate({
       id,
       payload: isBase
         ? { name, flowDefinition: flow as unknown as Record<string, unknown> }
         : { name, entryMessage, flowDefinition: flow as unknown as Record<string, unknown>, origins: platforms },
     })
   }
   ```
   También omite la validación `entryIssues` cuando `isBase`:
   ```ts
   function onSave() {
     if (!isBase && entryIssues.length > 0) { toast.error(entryIssues[0].message); return }
     // ...
   }
   ```

4. Envuelve las Cards de "Mensaje de entrada" y "Orígenes / Plataformas" y la Card de "URLs de captura" con `{!isBase && (...)}`.

5. Ajusta el título y el aviso: si `isBase`, el título dice "Nueva campaña base" / "Editar campaña base", y muestra un aviso breve:
   ```tsx
   {isBase && (
     <p className="text-sm text-text-muted">
       Esta campaña atrapa a los leads que llegan sin folio. No necesita mensaje de entrada ni
       orígenes: arranca directo con el flujo de conversación.
     </p>
   )}
   ```
   Y el helper text del FlowEditor sigue visible (la base sí usa flujo).

6. En modo crear base, el FlowEditor NO se muestra hoy (solo se muestra `{isEdit && ...}`). Para que la base pueda definir su flujo al crear, cambia la condición a `{(isEdit || isBase) && (...)}` para el card del FlowEditor, y quita el aviso "Tras crear la campaña, podrás configurar el flujo" cuando `isBase`. El backend valida que el flujo tenga un nodo interactivo al crear base (Task A4), así que el usuario debe poder armarlo en la creación. Si el `FlowEditor` requiere datos cargados que solo existen tras crear, evalúa dejarlo solo en edición por simplicidad y documentar que la base se crea con flujo vacío y luego se edita — **decisión**: en Fase 1, permite editar el flujo solo tras crear (igual que hoy), y al crear base el backend rechazará flujo sin nodo interactivo; por ello el formulario de creación base debe incluir el FlowEditor. Usa `{(isEdit || isBase) && (...)}`.

**Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/pages/CampaignFormPage.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/pages/CampaignFormPage.tsx src/pages/CampaignFormPage.test.tsx
git commit -m "feat(campaigns): formulario base (sin entryMessage/origins, envía kind)"
```

---

## ✅ Phase B completa — verificación final

1. `cd mchantal-crm && npm test` → todo verde.
2. `npm run build` → sin errores.
3. Smoke manual (con el API corriendo):
   - Listado sin base → banner visible, botón "Nueva campaña" lleva a `?kind=base`.
   - Crear campaña base (nombre + flujo con nodo interactivo) → 201, aparece en listado con badge "Base".
   - Intentar crear una segunda base → 409 (toast de error).
   - El banner desaparece al haber base.
   - Editar la base → no muestra mensaje de entrada ni orígenes.
   - Editar una campaña normal → muestra todo igual que antes (sin regresión).

## Fuera de Fase 1 (Fase 2)

- Versionado de campañas base (publicar versión, archivar anterior, labels, métricas por versión).
- Re-engagement de leads con flujo `completed`.
- Filtro "tipo" en el listado de leads.
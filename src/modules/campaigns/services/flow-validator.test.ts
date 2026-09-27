import { describe, it, expect } from 'vitest'
import {
  validateFlowDefinition,
  validateEntryMessage,
  flowWarnings,
  type FlowDefinition,
  type ValidationIssue,
} from './flow-validator'
import type { AssignmentDirective } from '../../executives/types/assignment.types'

/** Flujo minimo valido: welcome (interactive) -> cierre (text_message sin next). */
function validFlow(): FlowDefinition {
  return {
    nodes: {
      welcome: {
        id: 'welcome',
        type: 'interactive_buttons',
        body: '¿Qué te trae aquí?',
        buttons: [{ id: 'comprar', title: 'Quiero comprar' }],
        transitions: { comprar: 'closing' },
        onFreeText: 'reprompt',
      },
      closing: {
        id: 'closing',
        type: 'text_message',
        body: '¡Gracias! Te contactaremos.',
      },
    },
  }
}

function codes(issues: ValidationIssue[]): string[] {
  return issues.map((i) => i.code)
}

function errors(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => (i.severity ?? 'error') === 'error')
}

describe('validateFlowDefinition — casos validos', () => {
  it('flujo minimo (welcome -> cierre) no genera issues', () => {
    expect(errors(validateFlowDefinition(validFlow()))).toEqual([])
  })

  it('arbol multinivel valido no genera issues', () => {
    const flow: FlowDefinition = {
      nodes: {
        welcome: {
          id: 'welcome',
          type: 'interactive_buttons',
          body: '¿Qué te trae aquí?',
          buttons: [
            { id: 'comprar', title: 'Quiero comprar' },
            { id: 'promo', title: 'Vi una promoción' },
          ],
          transitions: { comprar: 'ask_producto', promo: 'closing_promo' },
          onFreeText: 'reprompt',
        },
        ask_producto: {
          id: 'ask_producto',
          type: 'interactive_buttons',
          body: '¿Qué producto?',
          buttons: [
            { id: 'piel', title: 'Piel' },
            { id: 'hogar', title: 'Hogar' },
          ],
          transitions: { piel: 'closing_piel', hogar: 'closing_hogar' },
          onFreeText: 'reprompt',
        },
        closing_piel: { id: 'closing_piel', type: 'text_message', body: 'Gracias por piel 🌸' },
        closing_hogar: { id: 'closing_hogar', type: 'text_message', body: 'Gracias por hogar 🏠' },
        closing_promo: { id: 'closing_promo', type: 'text_message', body: 'Gracias por la promo 🎉' },
      },
    }
    expect(errors(validateFlowDefinition(flow))).toEqual([])
  })

  it('onFreeText ausente es valido (default reprompt)', () => {
    const flow = validFlow()
    delete (flow.nodes.welcome as { onFreeText?: string }).onFreeText
    expect(errors(validateFlowDefinition(flow))).toEqual([])
  })
})

describe('validateFlowDefinition — casos invalidos', () => {
  it('nodes no es objeto', () => {
    expect(codes(validateFlowDefinition({ nodes: [] as unknown }))).toContain('NODES_NOT_OBJECT')
  })

  it('sin nodo interactive_buttons (sin entrada)', () => {
    const flow: FlowDefinition = {
      nodes: { closing: { id: 'closing', type: 'text_message', body: 'x' } },
    }
    expect(codes(validateFlowDefinition(flow))).toContain('ENTRY_NODE_MISSING')
  })

  it('interactive_buttons sin botones', () => {
    const flow = validFlow()
    ;(flow.nodes.welcome as { buttons: unknown[] }).buttons = []
    expect(codes(validateFlowDefinition(flow))).toContain('BUTTONS_EMPTY')
  })

  it('interactive_buttons con mas de 3 botones', () => {
    const flow = validFlow()
    ;(flow.nodes.welcome as { buttons: unknown[] }).buttons = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' },
      { id: 'd', title: 'D' },
    ]
    expect(codes(validateFlowDefinition(flow))).toContain('BUTTONS_TOO_MANY')
  })

  it('boton con titulo vacio', () => {
    const flow = validFlow()
    ;(flow.nodes.welcome as { buttons: { id: string; title: string }[] }).buttons = [
      { id: 'comprar', title: '' },
    ]
    expect(codes(validateFlowDefinition(flow))).toContain('BUTTON_TITLE_EMPTY')
  })

  it('ids de botones duplicados', () => {
    const flow = validFlow()
    ;(flow.nodes.welcome as { buttons: { id: string; title: string }[]; transitions: Record<string, string> }).buttons = [
      { id: 'dup', title: 'Uno' },
      { id: 'dup', title: 'Dos' },
    ]
    ;(flow.nodes.welcome as { transitions: Record<string, string> }).transitions = { dup: 'closing' }
    expect(codes(validateFlowDefinition(flow))).toContain('BUTTON_ID_DUPLICATE')
  })

  it('transicion apunta a nodo inexistente', () => {
    const flow = validFlow()
    ;(flow.nodes.welcome as { transitions: Record<string, string> }).transitions = { comprar: 'no_existe' }
    expect(codes(validateFlowDefinition(flow))).toContain('NODE_REF_NOT_FOUND')
  })

  it('text_message.nextNodeId apunta a nodo inexistente', () => {
    const flow = validFlow()
    ;(flow.nodes.closing as { nextNodeId?: string }).nextNodeId = 'no_existe'
    expect(codes(validateFlowDefinition(flow))).toContain('NODE_REF_NOT_FOUND')
  })

  it('onFreeText con valor no soportado', () => {
    const flow = validFlow()
    ;(flow.nodes.welcome as { onFreeText?: string }).onFreeText = 'fallback_node'
    expect(codes(validateFlowDefinition(flow))).toContain('ON_FREE_TEXT_UNSUPPORTED')
  })

  it('node.id no coincide con la clave del dict', () => {
    const flow = validFlow()
    ;(flow.nodes.welcome as { id: string }).id = 'otro_id'
    expect(codes(validateFlowDefinition(flow))).toContain('ID_MISMATCH')
  })

  it('rama que no termina en cierre (boton sin transicion)', () => {
    const flow: FlowDefinition = {
      nodes: {
        welcome: {
          id: 'welcome',
          type: 'interactive_buttons',
          body: '¿?',
          buttons: [{ id: 'comprar', title: 'Comprar' }],
          transitions: {},
          onFreeText: 'reprompt',
        },
      },
    }
    expect(codes(validateFlowDefinition(flow))).toContain('BRANCH_NOT_TERMINATED')
  })

  it('ciclo entre nodos', () => {
    const flow: FlowDefinition = {
      nodes: {
        a: {
          id: 'a',
          type: 'interactive_buttons',
          body: 'A',
          buttons: [{ id: 'x', title: 'X' }],
          transitions: { x: 'b' },
          onFreeText: 'reprompt',
        },
        b: {
          id: 'b',
          type: 'interactive_buttons',
          body: 'B',
          buttons: [{ id: 'y', title: 'Y' }],
          transitions: { y: 'a' },
          onFreeText: 'reprompt',
        },
      },
    }
    expect(codes(validateFlowDefinition(flow))).toContain('CYCLE')
  })
})

describe('validateEntryMessage', () => {
  it('mensaje con {{folio}} es valido', () => {
    expect(validateEntryMessage('Hola, mi folio es {{folio}}')).toEqual([])
  })

  it('mensaje sin {{folio}} genera issue', () => {
    expect(codes(validateEntryMessage('Hola, quiero info'))).toContain('ENTRY_MESSAGE_NO_FOLIO')
  })

  it('mensaje vacio genera issue', () => {
    expect(codes(validateEntryMessage(''))).toContain('ENTRY_MESSAGE_EMPTY')
  })
})
describe('validateFlowDefinition — entryNodeId', () => {
  it('entryNodeId que apunta a un interactive_buttons es válido', () => {
    const flow = {
      entryNodeId: 'welcome',
      nodes: {
        welcome: { id: 'welcome', type: 'interactive_buttons', body: '¿?', buttons: [{ id: 'b1', title: 'X' }], transitions: { b1: 'closing' }, onFreeText: 'reprompt' },
        closing: { id: 'closing', type: 'text_message', body: 'gracias' },
      },
    }
    expect(errors(validateFlowDefinition(flow))).toEqual([])
  })

  it('entryNodeId que apunta a un nodo inexistente → ENTRY_NODE_INVALID', () => {
    const flow = {
      entryNodeId: 'nope',
      nodes: {
        welcome: { id: 'welcome', type: 'interactive_buttons', body: '¿?', buttons: [{ id: 'b1', title: 'X' }], transitions: { b1: 'closing' }, onFreeText: 'reprompt' },
        closing: { id: 'closing', type: 'text_message', body: 'gracias' },
      },
    }
    expect(codes(validateFlowDefinition(flow))).toContain('ENTRY_NODE_INVALID')
  })

  it('entryNodeId que apunta a un text_message → ENTRY_NODE_INVALID', () => {
    const flow = {
      entryNodeId: 'closing',
      nodes: {
        welcome: { id: 'welcome', type: 'interactive_buttons', body: '¿?', buttons: [{ id: 'b1', title: 'X' }], transitions: { b1: 'closing' }, onFreeText: 'reprompt' },
        closing: { id: 'closing', type: 'text_message', body: 'gracias' },
      },
    }
    expect(codes(validateFlowDefinition(flow))).toContain('ENTRY_NODE_INVALID')
  })

  it('sin entryNodeId es válido (fallback a welcome/primer interactive)', () => {
    const flow = {
      nodes: {
        welcome: { id: 'welcome', type: 'interactive_buttons', body: '¿?', buttons: [{ id: 'b1', title: 'X' }], transitions: { b1: 'closing' }, onFreeText: 'reprompt' },
        closing: { id: 'closing', type: 'text_message', body: 'gracias' },
      },
    }
    expect(errors(validateFlowDefinition(flow))).toEqual([])
  })
})

describe('validateFlowDefinition — text_input', () => {
  function textInputFlow(over: Partial<Record<string, unknown>> = {}): FlowDefinition {
    return {
      nodes: {
        welcome: {
          id: 'welcome',
          type: 'interactive_buttons',
          body: '¿?',
          buttons: [{ id: 'b1', title: 'Ir' }],
          transitions: { b1: 'ask_estado' },
          onFreeText: 'reprompt',
        },
        ask_estado: {
          id: 'ask_estado',
          type: 'text_input',
          body: '¿De qué estado nos escribes?',
          storeAs: 'estado',
          matcher: { dictionaryId: 'dic1' },
          transitions: { jalisco: 'closing', nuevo_leon: 'closing' },
          ...over,
        },
        closing: { id: 'closing', type: 'text_message', body: '¡Gracias!' },
      },
    }
  }

  it('text_input válido → []', () => {
    expect(errors(validateFlowDefinition(textInputFlow()))).toEqual([])
  })

  it('body vacío → TEXT_INPUT_BODY_EMPTY', () => {
    expect(codes(validateFlowDefinition(textInputFlow({ body: '' })))).toContain('TEXT_INPUT_BODY_EMPTY')
  })

  it('storeAs vacío → TEXT_INPUT_STOREAS_EMPTY', () => {
    expect(codes(validateFlowDefinition(textInputFlow({ storeAs: '' })))).toContain('TEXT_INPUT_STOREAS_EMPTY')
  })

  it('matcher.dictionaryId vacío → TEXT_INPUT_DICTIONARY_MISSING', () => {
    expect(codes(validateFlowDefinition(textInputFlow({ matcher: { dictionaryId: '' } })))).toContain('TEXT_INPUT_DICTIONARY_MISSING')
  })

  it('transitions a nodo inexistente → NODE_REF_NOT_FOUND', () => {
    expect(codes(validateFlowDefinition(textInputFlow({ transitions: { jalisco: 'no_existe' } })))).toContain('NODE_REF_NOT_FOUND')
  })

  it('assignment inválido → ASSIGNMENT_INVALID', () => {
    const badAssignment = { mode: 'executive', executiveId: '' } as unknown as AssignmentDirective
    expect(codes(validateFlowDefinition(textInputFlow({ assignment: badAssignment })))).toContain('ASSIGNMENT_INVALID')
  })

  it('assignment válido no genera issues', () => {
    const assignment: AssignmentDirective = { mode: 'manual' }
    expect(validateFlowDefinition(textInputFlow({ assignment }))).toEqual([])
  })

  it('assignmentOverrides con directiva inválida → ASSIGNMENT_INVALID', () => {
    const overrides = { jalisco: { mode: 'executive', executiveId: '' } as unknown as AssignmentDirective }
    expect(codes(validateFlowDefinition(textInputFlow({ assignmentOverrides: overrides })))).toContain('ASSIGNMENT_INVALID')
  })

  it('ciclo que incluye text_input → CYCLE', () => {
    const flow: FlowDefinition = {
      nodes: {
        welcome: {
          id: 'welcome',
          type: 'interactive_buttons',
          body: '¿?',
          buttons: [{ id: 'b1', title: 'Ir' }],
          transitions: { b1: 'ask' },
          onFreeText: 'reprompt',
        },
        ask: {
          id: 'ask',
          type: 'text_input',
          body: '¿?',
          storeAs: 'x',
          matcher: { dictionaryId: 'd' },
          transitions: { a: 'welcome' },
        },
      },
    }
    expect(codes(validateFlowDefinition(flow))).toContain('CYCLE')
  })
})

describe('validateFlowDefinition — text_input defaultTransition', () => {
  function flow(over: Partial<{ defaultTransition: string; transitions: Record<string, string> }> = {}): FlowDefinition {
    return {
      nodes: {
        welcome: { id: 'welcome', type: 'interactive_buttons', body: '?', buttons: [{ id: 'b1', title: 'Ir' }], transitions: { b1: 'ask_estado' }, onFreeText: 'reprompt' },
        ask_estado: {
          id: 'ask_estado', type: 'text_input', body: '¿De qué estado?', storeAs: 'estado',
          matcher: { dictionaryId: 'd1' },
          transitions: over.transitions ?? {},
          defaultTransition: over.defaultTransition,
        },
        closing: { id: 'closing', type: 'text_message', body: '¡Gracias!' },
      },
    }
  }

  it('defaultTransition que apunta a nodo existente es válido', () => {
    expect(errors(validateFlowDefinition(flow({ defaultTransition: 'closing' })))).toEqual([])
  })
  it('defaultTransition a nodo inexistente → NODE_REF_NOT_FOUND', () => {
    expect(codes(validateFlowDefinition(flow({ defaultTransition: 'no_existe' })))).toContain('NODE_REF_NOT_FOUND')
  })
  it('sin defaultTransition ni transitions es válido (la pregunta es terminal)', () => {
    expect(errors(validateFlowDefinition(flow()))).toEqual([])
  })
  it('ciclo vía defaultTransition → CYCLE', () => {
    expect(codes(validateFlowDefinition(flow({ defaultTransition: 'welcome' })))).toContain('CYCLE')
  })
})

describe('validateFlowDefinition — free_text', () => {
  function flow(over: Partial<{ body: string; storeAs: string; nextNodeId?: string }> = {}): FlowDefinition {
    return {
      nodes: {
        welcome: { id: 'welcome', type: 'interactive_buttons', body: '?', buttons: [{ id: 'b1', title: 'Ir' }], transitions: { b1: 'capture' }, onFreeText: 'reprompt' },
        capture: { id: 'capture', type: 'free_text', body: over.body ?? 'Déjame tu nombre', storeAs: over.storeAs ?? 'nombre', nextNodeId: over.nextNodeId },
      },
    }
  }
  it('free_text válido → []', () => expect(errors(validateFlowDefinition(flow()))).toEqual([]))
  it('con nextNodeId válido → []', () => {
    const f = flow({ nextNodeId: 'welcome' })
    ;(f.nodes.welcome as { transitions: Record<string, string> }).transitions = { b1: 'closing' }
    f.nodes.closing = { id: 'closing', type: 'text_message', body: 'gracias' } as never
    // recoloca capture.nextNodeId a closing
    ;(f.nodes.capture as { nextNodeId?: string }).nextNodeId = 'closing'
    expect(errors(validateFlowDefinition(f))).toEqual([])
  })
  it('body vacío → FREE_TEXT_BODY_EMPTY', () => expect(codes(validateFlowDefinition(flow({ body: '' })))).toContain('FREE_TEXT_BODY_EMPTY'))
  it('storeAs vacío → FREE_TEXT_STOREAS_EMPTY', () => expect(codes(validateFlowDefinition(flow({ storeAs: '' })))).toContain('FREE_TEXT_STOREAS_EMPTY'))
  it('nextNodeId a inexistente → NODE_REF_NOT_FOUND', () => expect(codes(validateFlowDefinition(flow({ nextNodeId: 'no_existe' })))).toContain('NODE_REF_NOT_FOUND'))
})

describe('validateFlowDefinition — assignment en cierres/free_text', () => {
  it('text_message con assignment inválido → ASSIGNMENT_INVALID', () => {
    const flow = validFlow()
    ;(flow.nodes.closing as { assignment?: unknown }).assignment = { mode: 'executive', executiveId: '' }
    expect(codes(validateFlowDefinition(flow))).toContain('ASSIGNMENT_INVALID')
  })
  it('text_message con assignment válido → sin issues', () => {
    const flow = validFlow()
    ;(flow.nodes.closing as { assignment?: unknown }).assignment = { mode: 'manual' }
    expect(errors(validateFlowDefinition(flow))).toEqual([])
  })
  it('free_text con assignment inválido → ASSIGNMENT_INVALID', () => {
    const flow = validFlow()
    flow.nodes.capture = { id: 'capture', type: 'free_text', body: '¿Comentario?', storeAs: 'com', nextNodeId: undefined, assignment: { mode: 'pool', selector: { kind: 'coverage', attribute: '', value: '{{answers.estado}}' }, strategy: 'round_robin' } }
    ;(flow.nodes.welcome as { transitions?: Record<string,string> }).transitions = { comprar: 'capture' }
    expect(codes(validateFlowDefinition(flow))).toContain('ASSIGNMENT_INVALID')
  })
})

describe('validateFlowDefinition — avisos de asignación (warnings)', () => {
  it('rama terminal sin asignación → BRANCH_WITHOUT_ASSIGNMENT (warning)', () => {
    const flow = validFlow()
    const w = validateFlowDefinition(flow).find(i => i.code === 'BRANCH_WITHOUT_ASSIGNMENT')
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
    flow.nodes.closing2 = { id: 'closing2', type: 'text_message', body: 'Fin', assignment: { mode: 'manual' } }
    ;(flow.nodes.closing as { nextNodeId?: string }).nextNodeId = 'closing2'
    const r = validateFlowDefinition(flow).find(i => i.code === 'ASSIGNMENT_REDUNDANT' && i.field.includes('closing2'))
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
  it('text_input con SÓLO assignmentOverrides (sin default) → warn en rama sin override', () => {
    // assignmentOverrides sólo cubre jalisco; nuevo_leon no recibe asignación →
    // su rama terminal debe marcar BRANCH_WITHOUT_ASSIGNMENT (conservador).
    const flow: FlowDefinition = {
      nodes: {
        welcome: { id: 'welcome', type: 'interactive_buttons', body: '¿?', buttons: [{ id: 'b1', title: 'Ir' }], transitions: { b1: 'ask_estado' }, onFreeText: 'reprompt' },
        ask_estado: {
          id: 'ask_estado', type: 'text_input', body: '¿Estado?', storeAs: 'estado', matcher: { dictionaryId: 'd1' },
          transitions: { jalisco: 'closing_jal', nuevo_leon: 'closing_nl' },
          assignmentOverrides: { jalisco: { mode: 'manual' } },
        },
        closing_jal: { id: 'closing_jal', type: 'text_message', body: 'jal' },
        closing_nl: { id: 'closing_nl', type: 'text_message', body: 'nl' },
      },
    }
    const warns = validateFlowDefinition(flow).filter(i => i.severity === 'warning')
    expect(warns.some(w => w.code === 'BRANCH_WITHOUT_ASSIGNMENT' && w.field.includes('closing_nl'))).toBe(true)
  })
  it('text_input con fallback.transition y sin defaultTransition → NO es terminal (sin warning propio)', () => {
    const flow: FlowDefinition = {
      nodes: {
        welcome: { id: 'welcome', type: 'interactive_buttons', body: '¿?', buttons: [{ id: 'b1', title: 'Ir' }], transitions: { b1: 'ask_estado' }, onFreeText: 'reprompt' },
        ask_estado: {
          id: 'ask_estado', type: 'text_input', body: '¿Estado?', storeAs: 'estado', matcher: { dictionaryId: 'd1' },
          transitions: { jalisco: 'closing' },
          fallback: { transition: 'closing' },
        },
        closing: { id: 'closing', type: 'text_message', body: '¡Gracias!', assignment: { mode: 'manual' } },
      },
    }
    const warns = validateFlowDefinition(flow).filter(i => i.severity === 'warning')
    expect(warns.some(w => w.code === 'BRANCH_WITHOUT_ASSIGNMENT' && w.field.includes('ask_estado'))).toBe(false)
  })
})

describe('flowWarnings', () => {
  it('devuelve sólo los issues con severity warning (BRANCH_WITHOUT_ASSIGNMENT)', () => {
    const flow = validFlow() // welcome -> closing sin asignación → warning
    const warns = flowWarnings(flow)
    expect(warns.length).toBeGreaterThan(0)
    expect(warns.some((w) => w.code === 'BRANCH_WITHOUT_ASSIGNMENT')).toBe(true)
    expect(warns.every((w) => w.severity === 'warning')).toBe(true)
  })

  it('devuelve [] cuando todas las ramas tienen asignación', () => {
    const flow = validFlow()
    ;(flow.nodes.closing as { assignment?: unknown }).assignment = { mode: 'manual' }
    expect(flowWarnings(flow)).toEqual([])
  })

  it('no incluye errores (sólo warnings)', () => {
    const invalidFlow: FlowDefinition = {
      nodes: {
        welcome: {
          id: 'welcome',
          type: 'interactive_buttons',
          body: '¿?',
          buttons: [{ id: 'x', title: 'X' }],
          transitions: { x: 'no_existe' },
          onFreeText: 'reprompt',
        },
      },
    }
    const warns = flowWarnings(invalidFlow)
    expect(warns.every((w) => w.severity === 'warning')).toBe(true)
    expect(warns.some((w) => w.code === 'NODE_REF_NOT_FOUND')).toBe(false)
  })
})

// ── list_message validation ──

function listMessageFlow(over: Partial<Record<string, unknown>> = {}): FlowDefinition {
  return {
    nodes: {
      welcome: {
        id: 'welcome',
        type: 'list_message',
        body: '¿Qué te interesa?',
        buttonText: 'Ver opciones',
        rows: [
          { id: 'r1', title: 'Maquillaje', description: 'Labiales, bases' },
          { id: 'r2', title: 'Skincare' },
          { id: 'r3', title: 'Perfumes' },
        ],
        transitions: { r1: 'closing', r2: 'closing', r3: 'closing' },
        onFreeText: 'reprompt',
        ...over,
      },
      closing: { id: 'closing', type: 'text_message', body: '¡Gracias!' },
    },
  }
}

describe('validateFlowDefinition — list_message casos válidos', () => {
  it('list_message válido con 3 rows, transitions y header/footer → sin errores', () => {
    const flow = listMessageFlow({ header: 'Encuesta', footer: 'Gracias' })
    expect(errors(validateFlowDefinition(flow))).toEqual([])
  })

  it('list_message sin header ni footer → válido', () => {
    expect(errors(validateFlowDefinition(listMessageFlow()))).toEqual([])
  })

  it('list_message con rows que tienen description → válido', () => {
    expect(errors(validateFlowDefinition(listMessageFlow()))).toEqual([])
  })

  it('list_message como entry node → válido', () => {
    const flow = { ...listMessageFlow(), entryNodeId: 'welcome' }
    expect(errors(validateFlowDefinition(flow))).toEqual([])
  })

  it('entryNodeId apuntando a list_message → válido', () => {
    const flow = {
      entryNodeId: 'list1',
      nodes: {
        list1: { id: 'list1', type: 'list_message', body: '¿?', buttonText: 'Abrir', rows: [{ id: 'r1', title: 'O1' }], transitions: { r1: 'closing' } },
        closing: { id: 'closing', type: 'text_message', body: 'bye' },
      },
    }
    expect(errors(validateFlowDefinition(flow))).toEqual([])
  })

  it('entryNodeId apuntando a text_message → ENTRY_NODE_INVALID', () => {
    const flow = {
      entryNodeId: 'closing',
      nodes: {
        welcome: { id: 'welcome', type: 'list_message', body: '¿?', buttonText: 'Abrir', rows: [{ id: 'r1', title: 'O1' }], transitions: { r1: 'closing' } },
        closing: { id: 'closing', type: 'text_message', body: 'bye' },
      },
    }
    expect(codes(validateFlowDefinition(flow))).toContain('ENTRY_NODE_INVALID')
  })
})

describe('validateFlowDefinition — list_message casos inválidos', () => {
  it('body vacío → LIST_BODY_EMPTY', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ body: '' })))).toContain('LIST_BODY_EMPTY')
  })

  it('buttonText vacío → LIST_BUTTON_TEXT_EMPTY', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ buttonText: '' })))).toContain('LIST_BUTTON_TEXT_EMPTY')
  })

  it('rows vacío → LIST_ROWS_EMPTY', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ rows: [] })))).toContain('LIST_ROWS_EMPTY')
  })

  it('rows con 11 elementos → LIST_ROWS_TOO_MANY', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `O${i}` }))
    const flow = listMessageFlow({ rows, transitions: Object.fromEntries(rows.map(r => [r.id, 'closing'])) })
    expect(codes(validateFlowDefinition(flow))).toContain('LIST_ROWS_TOO_MANY')
  })

  it('row con title vacío → LIST_ROW_TITLE_EMPTY', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ rows: [{ id: 'r1', title: '' }] })))).toContain('LIST_ROW_TITLE_EMPTY')
  })

  it('row con id duplicado → LIST_ROW_ID_DUPLICATE', () => {
    const rows = [{ id: 'dup', title: 'A' }, { id: 'dup', title: 'B' }]
    const flow = listMessageFlow({ rows, transitions: { dup: 'closing' } })
    expect(codes(validateFlowDefinition(flow))).toContain('LIST_ROW_ID_DUPLICATE')
  })

  it('transition apunta a nodo inexistente → NODE_REF_NOT_FOUND', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ transitions: { r1: 'no_existe', r2: 'closing', r3: 'closing' } })))).toContain('NODE_REF_NOT_FOUND')
  })

  it('row sin transition (vacía) → BRANCH_NOT_TERMINATED', () => {
    const flow: FlowDefinition = {
      nodes: {
        welcome: { id: 'welcome', type: 'list_message', body: '¿?', buttonText: 'Abrir', rows: [{ id: 'r1', title: 'O1' }], transitions: {} },
      },
    }
    expect(codes(validateFlowDefinition(flow))).toContain('BRANCH_NOT_TERMINATED')
  })

  it('onFreeText con valor no soportado → ON_FREE_TEXT_UNSUPPORTED', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ onFreeText: 'fallback_node' })))).toContain('ON_FREE_TEXT_UNSUPPORTED')
  })

  it('body con más de 1024 chars → LIST_BODY_TOO_LONG', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ body: 'A'.repeat(1025) })))).toContain('LIST_BODY_TOO_LONG')
  })

  it('buttonText con más de 20 chars → LIST_BUTTON_TEXT_TOO_LONG', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ buttonText: 'B'.repeat(21) })))).toContain('LIST_BUTTON_TEXT_TOO_LONG')
  })

  it('header con más de 60 chars → LIST_HEADER_TOO_LONG', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ header: 'H'.repeat(61) })))).toContain('LIST_HEADER_TOO_LONG')
  })

  it('footer con más de 60 chars → LIST_FOOTER_TOO_LONG', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ footer: 'F'.repeat(61) })))).toContain('LIST_FOOTER_TOO_LONG')
  })

  it('row.title con más de 24 chars → LIST_ROW_TITLE_TOO_LONG', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ rows: [{ id: 'r1', title: 'T'.repeat(25) }] })))).toContain('LIST_ROW_TITLE_TOO_LONG')
  })

  it('row.description con más de 72 chars → LIST_ROW_DESCRIPTION_TOO_LONG', () => {
    expect(codes(validateFlowDefinition(listMessageFlow({ rows: [{ id: 'r1', title: 'OK', description: 'D'.repeat(73) }] })))).toContain('LIST_ROW_DESCRIPTION_TOO_LONG')
  })
})

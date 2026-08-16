import { describe, it, expect } from 'vitest'
import {
  validateFlowDefinition,
  validateEntryMessage,
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

describe('validateFlowDefinition — casos validos', () => {
  it('flujo minimo (welcome -> cierre) no genera issues', () => {
    expect(validateFlowDefinition(validFlow())).toEqual([])
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
    expect(validateFlowDefinition(flow)).toEqual([])
  })

  it('onFreeText ausente es valido (default reprompt)', () => {
    const flow = validFlow()
    delete (flow.nodes.welcome as { onFreeText?: string }).onFreeText
    expect(validateFlowDefinition(flow)).toEqual([])
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
    expect(validateFlowDefinition(flow)).toEqual([])
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
    expect(validateFlowDefinition(flow)).toEqual([])
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
    expect(validateFlowDefinition(textInputFlow())).toEqual([])
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

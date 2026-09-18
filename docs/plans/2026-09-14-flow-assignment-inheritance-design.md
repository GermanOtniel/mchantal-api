# Asignación automática en cualquier nivel del flujo — Diseño

**Fecha:** 2026-09-14
**Base:** `main` de `mchantal-api` y `mchantal-crm` (ya incluye lead-assignment por `text_input`, matcher-dictionaries, executives con cobertura, flow editor).
**Antecesora:** `docs/plans/2026-08-16-lead-assignment-by-flow-classification-design.md` (asignación por clasificación de `text_input`).

## Objetivo

Hoy la única forma de ejecutar una asignación automática es configurar un `text_input` con diccionario + directiva (`assignment`/`assignmentOverrides`). Cualquier rama que no pase por un `text_input` con asignación (ramas de puros botones → cierre, `free_text` → cierre, `text_input` sin directiva) termina **sin asignar** (`assignmentMode = null`), y el validador no lo detecta.

Se quiere poder **definir una asignación automática en cualquier nivel de cualquier ramificación** (no sólo en `text_input`), con herencia por efecto ("si se define arriba, los descendientes ya la tienen"), **una sola asignación por camino** (sin lógica de prioridad/combinación), y **avisos** en el editor para las ramas que quedan sin asignación y para las definiciones redundantes. No es forzoso: puede haber ramas sin asignación, pero el editor debe señalarlas.

## Decisiones de diseño (resumen)

- **Modelo de ejecución: (a) al pasar por el nodo que la define.** El motor ejecuta la directiva cuando el lead alcanza el nodo. Los descendientes "heredan" porque el lead ya quedó asignado — es efecto, no dato. Justificación: si el lead abandona a mitad, al menos quedó asignado mientras más arriba se haya definido.
- **Restricción inherente (obligatoria, por construcción):** una asignación que use `{{answers.X}}` debe definirse en el mismo nodo que recolecta `X` o debajo de él. No se puede leer una respuesta que todavía no existe. La asignación por cobertura `{{answers.estado}}` vive, pues, al nivel de (o debajo de) la pregunta que recolecta el estado, en cada camino que la recolecta. Las asignaciones definidas "arriba" sólo pueden ser `executive` / `manual` / `all_active` / `executive_ids` (no cobertura-por-respuesta).
- **Una sola asignación por camino: primer-ancestro gana.** El primer nodo (más arriba, en recorrido top-down) que define asignación es el que cuenta. Los descendientes que definan la suya son **ignorados por el motor** y **avisados por el editor** como redundantes. No hay override por defecto (tradeoff aceptado: si se quiere una asignación distinta en una sub-rama, se quita la del ancestro).
- **Nodos que pueden llevar asignación:** `text_input` (ya la tiene, con overrides por categoría), `text_message` (cierre) y `free_text` — **no** `interactive_buttons` (asignaría al mostrar la pregunta, antes de que el lead responda → sobre-asignación).
- **Avisos = warnings, no bloqueantes.** "Rama sin asignación" y "asignación redundante" son warnings: no impiden guardar. Los errores actuales (botón sin destino, nodo inexistente, ciclo) siguen bloqueando.
- **UI: caja read-only en nodos que heredan.** Cuando un nodo recibe asignación de un ancestro, su caja de asignación se muestra read-only ("Heredada de `<nodo>`") y **no permite definir una nueva** — se previene el caso redundante por UI, no sólo por warning.
- **Sin migración de BD.** `flowDefinition` es columna JSON; un campo opcional nuevo no rompe flujos existentes.

---

## 1. Modelo y cambios de tipos (ambos espejos)

### 1.1 Modelo

- La asignación se ejecuta al **pasar** por el nodo que la define (modelo a). Los descendientes la "heredan" porque el lead ya quedó asignado.
- **Una sola asignación por camino**: el primer ancestro que la define es el que cuenta; los descendientes se ignoran (vía flag, ver §2).
- Nodos portadores: `text_input`, `text_message`, `free_text`. No `interactive_buttons`.

### 1.2 Tipos — API (`mchantal-api/src/modules/campaigns/types/flow.types.ts`)

`TextMessageNode` y `FreeTextNode` ganan un campo opcional:

```ts
export type TextMessageNode = {
  id: string
  type: 'text_message'
  body: string
  nextNodeId?: string
  assignment?: AssignmentDirective   // NUEVO
}

export type FreeTextNode = {
  id: string
  type: 'free_text'
  body: string
  storeAs: string
  nextNodeId?: string
  assignment?: AssignmentDirective   // NUEVO
}
```

`TextInputNode` no cambia su campo `assignment`/`assignmentOverrides` — sólo cambia *cuándo* se ejecuta (ver §2). `AssignmentDirective` (`executive` | `pool` | `manual`) se reusa sin tocar.

### 1.3 Tipos — CRM (`mchantal-crm/src/components/campaigns/flow/flowModel.ts`)

Espejo idéntico: `TextMessageNode` y `FreeTextNode` ganan `assignment?: AssignmentDirective`. Más helpers:

```ts
export function setTextMessageAssignment(node: TextMessageNode, a: AssignmentDirective | undefined): TextMessageNode
export function setFreeTextAssignment(node: FreeTextNode, a: AssignmentDirective | undefined): FreeTextNode
```

### 1.4 Severidad en el validador (ambos espejos)

`ValidationIssue` gana `severity?: 'error' | 'warning'` (default `'error'`):

```ts
export type ValidationIssue = { field: string; code: string; message: string; severity?: 'error' | 'warning' }
```

El backend rechaza el guardado sólo si hay issues con `severity === 'error'`. Los warnings se devuelven al cliente (campo nuevo en la response, ej. `warnings: ValidationIssue[]`) sin bloquear. El editor los pinta amarillo, no rojo, y no marca la card como "con error".

---

## 2. Motor (`mchantal-api/src/modules/leads/services/flow-engine.ts`)

### 2.1 Flag "primer-ancestro gana"

Se añade `assigned: true` en `flowState.context` la primera vez que se ejecuta una asignación. Se persiste (el `context` ya es un blob JSON guardado en cada paso). Antes de ejecutar la directiva de cualquier nodo, el motor revisa ese flag: si ya está asignado → **la ignora**. Así "primer ancestro gana" sale por construcción: el primero en disparar setea el flag, los descendientes se skipean. No hay lógica de prioridad.

### 2.2 Dónde se ejecuta en cada tipo de nodo (todo al "pasar", modelo a)

- **`text_message`** — en `executeNode`, justo después de enviar el texto: si `node.assignment` y `!flowState.context.assigned` → resolver, setear `lead.assignmentMode/assignedExecutiveId/assignedAt`, marcar `flowState.context.assigned = true`. Luego avanza a `nextNodeId` o completa igual que hoy. (Un `text_message` que encadena también asigna al pasar — consistente con el modelo a.)
- **`free_text`** — en `processFreeText`, después de capturar la respuesta en `answers[storeAs]`: si `node.assignment` y `!assigned` → resolver, marcar flag. Luego avanza/completa.
- **`text_input`** — la lógica existente (resuelve `assignmentOverrides[cat] ?? assignment`, setea lead) se envuelve en `if (!flowState.context.assigned)`. **Cambio de comportamiento:** hoy un `text_input` anidado pisaba la asignación del padre; ahora la respeta (la salta). Corrige el bug silencioso del "último gana".

### 2.3 Qué se reusa

`deps.assignment.resolve(directive, flowState.context)` ya existe e interpola `{{answers.X}}` desde el contexto. No se toca `AssignmentService` ni `assignment-validator`.

### 2.4 Lead que abandona

Como la asignación se ejecuta al pasar, si el lead deja de responder después de un nodo con asignación, igual queda asignado. Si nunca alcanza un nodo con asignación, queda `assignmentMode = null` (sin asignar) — justo lo que el warning del editor (§3) debe prevenir al armar el flujo.

---

## 3. Detección y avisos (validador, ambos espejos)

El validador ya hace un DFS desde el nodo de entrada (para detectar ciclos). Se extiende ese recorrido para llevar un flag `hasAssignment` (si algún ancestro definió asignación) y emitir dos warnings nuevos.

### 3.1 `ASSIGNMENT_REDUNDANT` (warning)

En un nodo que define asignación pero `hasAssignment` ya venía `true` (un ancestro ya la define). Mensaje: *"esta asignación es redundante: ya hay una en `<nodoAncestro>`; el motor la ignorará."* El `field` apunta al nodo para resaltar su card.

### 3.2 `BRANCH_WITHOUT_ASSIGNMENT` (warning, conservador)

En un nodo **terminal** cuyo camino no tiene asignación (`!hasAssignment` y el nodo tampoco define una). Terminales estructurales:

- `text_message` sin `nextNodeId`.
- `free_text` sin `nextNodeId`.
- `text_input` sin `defaultTransition` y sin transiciones (terminal puro).
- `text_input` con transiciones parciales pero sin `defaultTransition`: las categorías sin transición explícita terminan sin asignar → warning en ese nodo (conservador: avisa aunque sólo algunas categorías queden al aire).

Caso fino: un `text_input` **con** asignación no dispara el warning aunque le falten transiciones, porque el lead ya quedó asignado al clasificar (el motor lo asigna antes de avanzar/terminar). Un `interactive_buttons` no puede llevar asignación, así que sólo propaga el flag a sus sub-árboles (uno por botón); un botón sin destino sigue siendo el error `BRANCH_NOT_TERMINATED` de hoy.

### 3.3 Propagación del flag (top-down)

`hasAssignment` que se pasa a un sub-árbol = `true` si algún ancestro definió directiva (cualquiera de: `text_message.assignment`, `free_text.assignment`, `text_input.assignment`, `text_input.assignmentOverrides` no vacío). Una vez `true`, se mantiene `true` por ese camino. En el nodo que define: si `hasAssignment` ya era `true` → `ASSIGNMENT_REDUNDANT`; el flag para sus hijos es `hasAssignment || selfAssigns`.

### 3.4 Backend — `campaign.service.ts`

Hoy rechaza si `validateFlowDefinition` devuelve *cualquier* issue. Cambia a: rechaza sólo si hay issues con `severity === 'error'`. Los warnings se devuelven al cliente en un campo `warnings` de la response. Los issues existentes quedan con `severity` default `'error'` → siguen bloqueando (los tests actuales no rompen).

### 3.5 CRM — `flowValidator.ts`

Replica la misma lógica para feedback en vivo mientras se edita, antes de guardar.

---

## 4. Editor visual (`FlowEditor` + cards, CRM)

### 4.1 Componente compartido

Hoy `AssignmentBox` y `PoolFields` viven embebidos en `TextInputCard.tsx` sin exportar. Se extraen a un componente compartido (ej. `flow/AssignmentBox.tsx`) para reusarlos. Para `text_message` y `free_text` se usa la versión **simple** (sin overrides por categoría, porque no hay clasificación): sólo `sin asignar | pool | ejecutivo | manual` + `PoolFields`.

### 4.2 Cards que ganan la caja

- `ClosingCard` (text_message) — la caja debajo del textarea.
- `FreeTextCard` — la caja debajo de sus campos.
- `TextInputCard` — sigue usando la caja completa (con overrides), ahora desde el componente compartido.

### 4.3 Display "heredada" (caja read-only)

El `FlowTree` recursivo ya baja por las ramas; se le threadea un prop `hasAssignment` (igual que el DFS del validador). Cuando un nodo recibe `hasAssignment = true` y él mismo no define asignación:

- La caja se muestra **read-only** con un badge *"Asignación heredada de `<nodoAncestro>`"* y **no** permite definir una nueva ahí.
- Se previene el caso redundante por UI, no sólo por warning. Si el usuario quiere una asignación distinta en esa sub-rama, debe quitar la del ancestro (tradeoff aceptado: no hay 2, no hay override).

Cuando `hasAssignment = false`, la caja es editable normally.

### 4.4 Render de warnings

El `issuesByNode` que ya pinta las cards se extiende con severidad. Los warnings pintan la card con borde/badge **amarillo** (no rojo como los errores) + ícono de alerta y tooltip: *"Rama sin asignación"* o *"Asignación redundante (ignorada por el motor)"*. No bloquean el botón guardar.

### 4.5 Flujo de guardado

Al guardar, si el backend devuelve `warnings`, se muestran en un toast/bandeja no bloqueante ("3 ramas sin asignación") sin impedir el guardado.

---

## 5. Pruebas, compatibilidad y despliegue

### 5.1 TDD, ambos espejos

- **Backend `flow-validator`**: warnings nuevos (`BRANCH_WITHOUT_ASSIGNMENT` en cada forma terminal, `ASSIGNMENT_REDUNDANT`); `severity` correcta (warning vs error); casos válidos sin warnings cuando toda rama termina con asignación; el caso fino `text_input` con asignación + transiciones parciales → **sin** warning.
- **Backend `flow-engine`**: (a) asignación en `text_message` terminal se ejecuta; (b) en `free_text` se ejecuta al capturar; (c) `text_input` anidado **ya no pisa** al padre (flag `assigned`); (d) lead que abandona después de un nodo con asignación queda asignado; (e) nodo sin asignación no muta el lead. Todo con repos mockeados.
- **`campaign.service`**: guarda cuando sólo hay warnings; rechaza cuando hay errores.
- **CRM `flowValidator`**: espejo de los mismos casos.
- **CRM `flowModel`**: helpers `setTextMessageAssignment` / `setFreeTextAssignment`; campo opcional no rompe nodos existentes.
- **CRM `FlowEditor`**: caja read-only "heredada" cuando `hasAssignment=true`; warnings en amarillo; caja editable en `ClosingCard`/`FreeTextCard`.

### 5.2 Compatibilidad con flujos existentes

- `text_message`/`free_text` sin `assignment` → campo ausente → comportamiento actual. Sin migración de BD.
- `text_input` con asignación y sin ancestro con asignación → se ejecuta igual que hoy.
- Único cambio de comportamiento observable: `text_input` anidado que antes pisaba al padre, ahora respeta al primero (corrección acordada).

### 5.3 Orden de despliegue

Backend primero (tipos + validador + motor + `campaign.service` severidad), luego CRM (espejo + UI). El backend debe aceptar el campo nuevo antes de que el CRM lo envíe. No requiere coordinación estricta: el CRM viejo nunca envía `assignment` en cierres/free_text, y el backend nuevo lo acepta opcional.

---

## Alcance fuera (YAGNI)

- **Override de asignación en sub-ramas** (un hijo que pise deliberadamente al ancestro). Aceptado como tradeoff: no hay 2, no hay prioridad. Si se quiere, se quita la del ancestro.
- **Asignación en `interactive_buttons`.** Excluido para evitar sobre-asignar a leads que apenas vieron la pregunta y no respondieron.
- **Combina/prioridad entre múltiples asignaciones.** Fuera de alcance por ahora.
- **Migración de BD.** No se necesita (JSON).
- **Re-engagement / auto-cierre.** Ortogonal; fuera de este diseño.
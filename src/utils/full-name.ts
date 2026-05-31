export type NameParts = {
  firstName: string
  middleName?: string | null
  lastName: string
  secondLastName?: string | null
}

/** Une las cuatro partes con un espacio; omite vacíos/null tras trim. */
export function buildFullName(parts: NameParts): string {
  return [parts.firstName, parts.middleName, parts.lastName, parts.secondLastName]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0)
    .join(' ')
}

export function normalizeOptionalName(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function normalizeRequiredName(value: string): string {
  return value.trim()
}

/**
 * Resuelve la opción `origin` de @fastify/cors a partir de la env var `CORS_ORIGIN`.
 *
 * - Ausente o vacío → `true` (refleja el origen del request, igual que el comportamiento
 *   histórico en desarrollo). Así no se rompe el local.
 * - Un único origen → string.
 * - Varios orígenes separados por coma → arreglo (útil para previews de Vercel).
 *
 * Los orígenes se trimmean y se descartan los vacíos (p.ej. comas sobrantes).
 */
export function resolveCorsOrigin(value: string | undefined): true | string | string[] {
  if (value === undefined || value === '') return true
  const origins = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (origins.length === 0) return true
  if (origins.length === 1) return origins[0]
  return origins
}
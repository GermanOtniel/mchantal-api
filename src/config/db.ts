/**
 * Resuelve la opción `ssl` de TypeORM/pg a partir de la env var `DB_SSL`.
 *
 * - `DB_SSL=true`  → activa SSL sin verificación estricta del CA (necesario para Neon).
 * - cualquier otro valor (o ausente) → `false` (comportamiento por defecto en local).
 *
 * Es intencional el `rejectUnauthorized: false` para evitar problemas de CA en
 * ambientes de staging; la verificación estricta queda fuera del scope de la demo.
 */
export function resolveSsl(value: string | undefined): false | { rejectUnauthorized: false } {
  return value === 'true' ? { rejectUnauthorized: false } : false
}
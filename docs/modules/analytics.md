# Analytics

> Estado: documento vivo. Editar cuando el código cambie.

## Propósito

Dashboard analítico de leads: KPIs y charts globales y por campaña, con rollups diarios precomputados para no golpear la tabla de leads en cada consulta.

## Alcance

- Agregaciones diarias (capturas, enrollments, conversiones) global y por campaña, con desglose por **origen**.
- Endpoints de KPIs y series temporales con rango de fechas (máx. `MAX_ANALYTICS_RANGE_DAYS`, default 90).
- Comparación con período anterior (`changePercent`).
- Tasa de conversión.

**No** cubre el cálculo en streaming; el rollup es un job (`npm run analytics:rollup`).

## Cómo funciona

### Rollup
`analytics-rollup.service.ts` + `database/run-analytics-rollup.ts` (CLI `npm run analytics:rollup`):
- Lee `lead_captures` (capturas), `campaign_leads` (enrollments por `enrolled_at`) y conversions (`is_successful` / `success_at`).
- Agrega a `analytics_daily_global` y `analytics_daily_campaign` por día.
- `by_origin` (jsonb) acumula conteo por origen (extraído con `extractOriginFromEnrollment`).

### Query
`analytics-query.service.ts`:
- Lee de las tablas de rollup (rápido) y complementa con `CampaignLead` cuando necesita origen dinámico (`listOriginsFromEnrollments`).
- Helpers de fechas en `utils/analytics-dates.ts` (UTC, semanas lunes, meses).
- KPIs con `previousValue` y `changePercent`; series para charts; tabla de campañas.

## Endpoints

Prefijo `/v1/analytics`. Todas requieren JWT.

| Método | Ruta | Permiso | Propósito |
|--------|------|---------|-----------|
| `GET` | `/overview/kpis` | `analytics.read` | KPIs globales (con `from`/`to`) |
| `GET` | `/overview/charts` | `analytics.read` | Series globales por día |
| `GET` | `/overview/campaigns` | `analytics.read` | Tabla comparativa de campañas |
| `GET` | `/campaigns/:id/kpis` | `analytics.read` **o** `campaigns.manage` | KPIs de una campaña |
| `GET` | `/campaigns/:id/charts` | `analytics.read` **o** `campaigns.manage` | Series de una campaña |

## Modelo de datos

- `analytics_daily_global` — PK `date`. `captures_count`, `enrollments_count`, `conversions_count`, `by_origin` jsonb, `computed_at`.
- `analytics_daily_campaign` — PK `(date, campaign_id)`. Mismas columnas + relación a `campaigns`.

## Componentes

- `modules/analytics/services/analytics-rollup.service.ts` — job de agregación.
- `modules/analytics/services/analytics-query.service.ts` — consultas del dashboard.
- `modules/analytics/repositories/analytics-daily.repository.ts`.
- `modules/analytics/controllers/analytics.controller.ts` + `routes/analytics.routes.ts`.
- `modules/analytics/schemas/analytics.schemas.ts`.
- `modules/analytics/utils/analytics-dates.ts`, `analytics-origin.utils.ts`.
- `database/run-analytics-rollup.ts` — CLI.

## Migraciones relevantes

`1748500000000-AnalyticsInitial`.

## Variables de entorno

`MAX_ANALYTICS_RANGE_DAYS` (default 90).

## Pendientes / Notas

- El rollup es **manual** (`npm run analytics:rollup`); no hay job programado (cron). Considerar scheduler.
- Origen `unknown` aparece cuando el param `origin` falta; revisar campañas con capturas sin origen.
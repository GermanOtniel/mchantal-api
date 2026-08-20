import { describe, it, expect, vi } from 'vitest'
import { AnalyticsQueryService } from './analytics-query.service'
import type { AnalyticsQueryDeps } from '../types/analytics.types'

function makeDeps(over: Partial<AnalyticsQueryDeps> = {}): AnalyticsQueryDeps {
  return {
    countEnrollments: vi.fn(async () => 10),
    countConversions: vi.fn(async () => 2),
    groupOrigins: vi.fn(async () => []),
    topCampaigns: vi.fn(async () => []),
    dailySeries: vi.fn(async () => []),
    ...over,
  }
}

describe('AnalyticsQueryService — getOverviewKpis', () => {
  it('construye los 4 KPIs con value/previousValue/changePercent (constantes → determinista)', async () => {
    // countEnrollments devuelve 10 para cualquier rango; countConversions 2.
    const svc = new AnalyticsQueryService(makeDeps())
    const kpis = await svc.getOverviewKpis()

    // hoy=10, ayer=10 → changePercent 0
    expect(kpis.leadsToday.value).toBe(10)
    expect(kpis.leadsToday.previousValue).toBe(10)
    expect(kpis.leadsToday.changePercent).toBe(0)

    // semana = sumRange(semana)+hoy = 10+10 = 20; semana previa = 10 → +100%
    expect(kpis.leadsThisWeek.value).toBe(20)
    expect(kpis.leadsThisWeek.previousValue).toBe(10)
    expect(kpis.leadsThisWeek.changePercent).toBe(100)

    // mes = 20; mes previo = 10 → +100%
    expect(kpis.leadsThisMonth.value).toBe(20)
    expect(kpis.leadsThisMonth.previousValue).toBe(10)
    expect(kpis.leadsThisMonth.changePercent).toBe(100)

    // conversión 30d = 2/10 = 20%; periodo anterior = 20% → diff 0
    expect(kpis.conversionRate.value).toBe(20)
    expect(kpis.conversionRate.previousValue).toBe(20)
    expect(kpis.conversionRate.changePercent).toBe(0)
  })

  it('changePercent es null cuando ambos periodos son 0', async () => {
    const deps = makeDeps({
      countEnrollments: vi.fn(async () => 0),
      countConversions: vi.fn(async () => 0),
    })
    const svc = new AnalyticsQueryService(deps)
    const kpis = await svc.getOverviewKpis()
    expect(kpis.leadsToday.changePercent).toBe(null)
    expect(kpis.leadsThisWeek.changePercent).toBe(null)
    expect(kpis.conversionRate.changePercent).toBe(null)
  })
})

describe('AnalyticsQueryService — getOverviewCharts', () => {
  it('devuelve origins tal cual y campaigns con conversionRate calculada', async () => {
    const deps = makeDeps({
      groupOrigins: vi.fn(async () => [
        { origin: 'Facebook', count: 7 },
        { origin: 'unknown', count: 3 },
      ]),
      topCampaigns: vi.fn(async () => [
        {
          campaignId: 'c1',
          campaignName: 'Demo',
          campaignSlug: 'demo',
          enrollments: 10,
          conversions: 2,
        },
      ]),
    })
    const svc = new AnalyticsQueryService(deps)
    const res = await svc.getOverviewCharts('2026-08-01', '2026-08-19')
    expect(res.origins).toEqual([
      { origin: 'Facebook', count: 7 },
      { origin: 'unknown', count: 3 },
    ])
    expect(res.campaigns[0]).toMatchObject({
      campaignId: 'c1',
      enrollments: 10,
      conversions: 2,
      conversionRate: 20,
    })
  })

  it('valida rango: from > to → 400 INVALID_DATE_RANGE', async () => {
    const svc = new AnalyticsQueryService(makeDeps())
    await expect(svc.getOverviewCharts('2026-08-19', '2026-08-01')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_DATE_RANGE',
    })
  })

  it('valida rango: > 90 días → 400 DATE_RANGE_TOO_LARGE', async () => {
    const svc = new AnalyticsQueryService(makeDeps())
    await expect(svc.getOverviewCharts('2026-01-01', '2026-08-19')).rejects.toMatchObject({
      statusCode: 400,
      code: 'DATE_RANGE_TOO_LARGE',
    })
  })
})

describe('AnalyticsQueryService — listCampaignsTable', () => {
  it('pagina los top campaigns', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      campaignId: `c${i}`,
      campaignName: `Camp ${i}`,
      campaignSlug: `camp-${i}`,
      enrollments: 30 - i,
      conversions: 1,
    }))
    const deps = makeDeps({ topCampaigns: vi.fn(async () => rows) })
    const svc = new AnalyticsQueryService(deps)
    const page1 = await svc.listCampaignsTable('2026-08-01', '2026-08-19', 1, 10)
    expect(page1.items).toHaveLength(10)
    expect(page1.items[0].campaignId).toBe('c0')
    expect(page1.page).toBe(1)
    expect(page1.limit).toBe(10)
    const page2 = await svc.listCampaignsTable('2026-08-01', '2026-08-19', 2, 10)
    expect(page2.items[0].campaignId).toBe('c10')
  })
})

describe('AnalyticsQueryService — getCampaignCharts', () => {
  it('filtra origins por campaignId y calcula conversionRate diaria', async () => {
    const deps = makeDeps({
      groupOrigins: vi.fn(async () => [{ origin: 'Facebook', count: 5 }]),
      dailySeries: vi.fn(async () => [
        { date: '2026-08-19', enrollments: 5, conversions: 1, conversionRate: 0 },
      ]),
    })
    const svc = new AnalyticsQueryService(deps)
    const res = await svc.getCampaignCharts('c1', '2026-08-01', '2026-08-19')
    expect(deps.groupOrigins).toHaveBeenCalledWith(expect.anything(), 'c1')
    expect(deps.dailySeries).toHaveBeenCalledWith('c1', expect.anything())
    expect(res.origins[0].origin).toBe('Facebook')
    expect(res.daily[0]).toMatchObject({ date: '2026-08-19', enrollments: 5, conversions: 1 })
    expect(res.daily[0].conversionRate).toBe(20)
  })
})

describe('AnalyticsQueryService — getCampaignKpis', () => {
  it('pasa campaignId a las llamadas de conteo', async () => {
    const countEnrollments = vi.fn(async () => 10)
    const countConversions = vi.fn(async () => 2)
    const svc = new AnalyticsQueryService(
      makeDeps({ countEnrollments, countConversions })
    )
    await svc.getCampaignKpis('c1')
    for (const call of countEnrollments.mock.calls) {
      expect(call[1]).toBe('c1')
    }
    for (const call of countConversions.mock.calls) {
      expect(call[1]).toBe('c1')
    }
  })
})
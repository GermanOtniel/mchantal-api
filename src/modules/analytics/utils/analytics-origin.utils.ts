import type { CampaignLead } from '../../../entities/leads/campaign-lead.entity'

export function extractOrigin(
  params: Record<string, string> | null | undefined
): string {
  const origin = params?.origin?.trim()
  return origin && origin.length > 0 ? origin : 'unknown'
}

export function extractOriginFromEnrollment(lead: CampaignLead): string {
  const context = lead.context as Record<string, unknown> | undefined
  const contextOrigin = context?.origin
  if (typeof contextOrigin === 'string' && contextOrigin.trim()) {
    return contextOrigin.trim()
  }

  return extractOrigin(lead.leadCapture?.capturedParams)
}

export function countsToOriginSlices(
  counts: Record<string, number>
): Array<{ origin: string; count: number }> {
  return Object.entries(counts)
    .map(([origin, count]) => ({ origin, count }))
    .sort((a, b) => b.count - a.count)
}

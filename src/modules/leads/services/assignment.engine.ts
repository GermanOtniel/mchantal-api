import type { CampaignLead } from '../../../entities/leads/campaign-lead.entity'
import { CampaignExecutiveRepository } from '../repositories/campaign-executive.repository'
import { CampaignLeadRepository } from '../repositories/campaign-lead.repository'
import { AssignmentRuleSetRepository } from '../repositories/assignment-rule-set.repository'
import { UserLeadProfileRepository } from '../repositories/user-lead-profile.repository'
import type {
  AssignmentCondition,
  AssignmentRule,
  ExecutivePool,
} from '../types/flow-definition.types'

const roundRobinState = new Map<string, number>()

function matchesCondition(
  condition: AssignmentCondition,
  lead: CampaignLead
): boolean {
  if (condition._default) return true

  const context = lead.context as Record<string, unknown>
  const answers = (context.answers ?? {}) as Record<string, string>
  const tags = (context.tags ?? []) as string[]
  const origin =
    (context.origin as string | undefined) ??
    (lead.leadCapture?.capturedParams?.origin as string | undefined)

  if (condition.intent && lead.resolvedIntent !== condition.intent) return false
  if (condition.origin && origin !== condition.origin) return false
  if (condition.tags?.length) {
    const hasTag = condition.tags.some((tag) => tags.includes(tag))
    if (!hasTag) return false
  }
  if (condition.answers) {
    for (const [key, value] of Object.entries(condition.answers)) {
      if (answers[key] !== value) return false
    }
  }

  return true
}

export class AssignmentEngine {
  constructor(
    private readonly ruleSets = new AssignmentRuleSetRepository(),
    private readonly profiles = new UserLeadProfileRepository(),
    private readonly campaignLeads = new CampaignLeadRepository(),
    private readonly campaignExecutives = new CampaignExecutiveRepository()
  ) {}

  async resolveAssignee(
    campaignLead: CampaignLead,
    ruleSetKey: string
  ): Promise<string | null> {
    const ruleSet = await this.ruleSets.findLatestActive(
      campaignLead.campaignId,
      ruleSetKey
    )

    if (!ruleSet || !Array.isArray(ruleSet.rules) || ruleSet.rules.length === 0) {
      return null
    }

    const rules = [...(ruleSet.rules as AssignmentRule[])].sort(
      (a, b) => a.priority - b.priority
    )

    const matched = rules.find((rule) => matchesCondition(rule.when, campaignLead))
    if (!matched) return null

    return this.resolveTarget(matched.assign, campaignLead.campaignId)
  }

  private async resolveTarget(
    target: AssignmentRule['assign'],
    campaignId: string
  ): Promise<string | null> {
    if (target.type === 'user') return target.userId

    const poolUserIds = await this.resolvePool(target.pool, campaignId)
    if (poolUserIds.length === 0) return null

    if (target.type === 'least_load') {
      const loads = await Promise.all(
        poolUserIds.map(async (userId) => ({
          userId,
          load: await this.campaignLeads.countActiveByAssignee(userId),
        }))
      )
      loads.sort((a, b) => a.load - b.load)
      return loads[0]?.userId ?? null
    }

    const key = `${campaignId}:${target.pool.roleSlug}:${target.pool.segments?.join(',') ?? ''}`
    const current = roundRobinState.get(key) ?? 0
    const userId = poolUserIds[current % poolUserIds.length]
    roundRobinState.set(key, current + 1)
    return userId ?? null
  }

  private async resolvePool(pool: ExecutivePool, campaignId: string): Promise<string[]> {
    const profiles = await this.profiles.listByRoleSlug(pool.roleSlug)
    const requiredSegments = pool.segments ?? []
    const eligible: string[] = []

    for (const profile of profiles) {
      if (!profile.isAcceptingLeads) continue
      if (
        requiredSegments.length > 0 &&
        !requiredSegments.every((segment) => profile.segments.includes(segment))
      ) {
        continue
      }

      const campaignEligible = await this.campaignExecutives.isEligibleForCampaign(
        profile.userId,
        campaignId
      )
      if (!campaignEligible) continue

      if (profile.maxActiveLeads != null) {
        const load = await this.campaignLeads.countActiveByAssignee(profile.userId)
        if (load >= profile.maxActiveLeads) continue
      }

      eligible.push(profile.userId)
    }

    return eligible
  }
}

import { AppDataSource } from '../../../database/data-source'
import { User } from '../../../entities/auth/user.entity'
import { HttpError } from '../../auth/http-error'
import { CampaignExecutiveRepository } from '../repositories/campaign-executive.repository'
import { CampaignLeadRepository } from '../repositories/campaign-lead.repository'
import { UserLeadProfileRepository } from '../repositories/user-lead-profile.repository'

export type UserLeadProfileDto = {
  userId: string
  segments: string[]
  isAcceptingLeads: boolean
  maxActiveLeads: number | null
  enabledCampaignIds: string[]
}

export type AvailableExecutiveDto = {
  userId: string
  fullName: string
  email: string
  segments: string[]
  activeLeads: number
  isAcceptingLeads: boolean
}

export class UserLeadProfileService {
  constructor(
    private readonly profiles = new UserLeadProfileRepository(),
    private readonly campaignExecutives = new CampaignExecutiveRepository(),
    private readonly campaignLeads = new CampaignLeadRepository()
  ) {}

  async getProfile(userId: string): Promise<UserLeadProfileDto> {
    const profile = await this.profiles.findByUserId(userId)
    const enabledCampaignIds =
      await this.campaignExecutives.listEnabledCampaignIdsForUser(userId)

    if (!profile) {
      return {
        userId,
        segments: [],
        isAcceptingLeads: true,
        maxActiveLeads: null,
        enabledCampaignIds,
      }
    }

    return {
      userId: profile.userId,
      segments: profile.segments ?? [],
      isAcceptingLeads: profile.isAcceptingLeads,
      maxActiveLeads: profile.maxActiveLeads,
      enabledCampaignIds,
    }
  }

  async updateProfile(
    userId: string,
    input: {
      segments?: string[]
      isAcceptingLeads?: boolean
      maxActiveLeads?: number | null
      enabledCampaignIds?: string[]
    }
  ): Promise<UserLeadProfileDto> {
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: userId },
    })
    if (!user) {
      throw new HttpError('User not found', 404, 'USER_NOT_FOUND')
    }

    await this.profiles.upsert(userId, {
      segments: input.segments,
      isAcceptingLeads: input.isAcceptingLeads,
      maxActiveLeads: input.maxActiveLeads,
    })

    if (input.enabledCampaignIds !== undefined) {
      await this.campaignExecutives.setForUser(userId, input.enabledCampaignIds)
    }

    return this.getProfile(userId)
  }

  async listAvailableExecutives(params: {
    campaignId?: string
    segments?: string[]
  }): Promise<AvailableExecutiveDto[]> {
    const profiles = await this.profiles.listByRoleSlug('lead-executive')
    const requiredSegments = params.segments ?? []
    const users = await AppDataSource.getRepository(User).find()

    const userMap = new Map(users.map((user) => [user.id, user]))
    const results: AvailableExecutiveDto[] = []

    for (const profile of profiles) {
      if (!profile.isAcceptingLeads) continue

      if (
        requiredSegments.length > 0 &&
        !requiredSegments.every((segment) => profile.segments.includes(segment))
      ) {
        continue
      }

      if (params.campaignId) {
        const eligible = await this.campaignExecutives.isEligibleForCampaign(
          profile.userId,
          params.campaignId
        )
        if (!eligible) continue
      }

      if (profile.maxActiveLeads != null) {
        const load = await this.campaignLeads.countActiveByAssignee(profile.userId)
        if (load >= profile.maxActiveLeads) continue
      }

      const user = userMap.get(profile.userId)
      if (!user) continue

      const activeLeads = await this.campaignLeads.countActiveByAssignee(profile.userId)
      results.push({
        userId: profile.userId,
        fullName: user.fullName,
        email: user.email,
        segments: profile.segments ?? [],
        activeLeads,
        isAcceptingLeads: profile.isAcceptingLeads,
      })
    }

    return results.sort((a, b) => a.fullName.localeCompare(b.fullName))
  }
}

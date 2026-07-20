import { AppDataSource } from '../../../database/data-source'
import { CampaignExecutive } from '../../../entities/leads/campaign-executive.entity'

export class CampaignExecutiveRepository {
  private get repo() {
    return AppDataSource.getRepository(CampaignExecutive)
  }

  async listEnabledCampaignIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { userId, enabled: true },
      select: { campaignId: true },
    })
    return rows.map((row) => row.campaignId)
  }

  async userHasRestrictions(userId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { userId } })
    return count > 0
  }

  async isEligibleForCampaign(userId: string, campaignId: string): Promise<boolean> {
    const hasRestrictions = await this.userHasRestrictions(userId)
    if (!hasRestrictions) return true

    const row = await this.repo.findOne({
      where: { userId, campaignId, enabled: true },
    })
    return Boolean(row)
  }

  async listEnabledUserIdsForCampaign(campaignId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { campaignId, enabled: true },
      select: { userId: true },
    })
    return rows.map((row) => row.userId)
  }

  async setForUser(userId: string, campaignIds: string[]): Promise<void> {
    await this.repo.delete({ userId })

    if (campaignIds.length === 0) return

    await this.repo.save(
      campaignIds.map((campaignId, index) =>
        this.repo.create({
          campaignId,
          userId,
          enabled: true,
          priority: index,
        })
      )
    )
  }
}

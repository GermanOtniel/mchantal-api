import { AppDataSource } from '../../../database/data-source'
import { UserLeadProfile } from '../../../entities/leads/user-lead-profile.entity'

export class UserLeadProfileRepository {
  private get repo() {
    return AppDataSource.getRepository(UserLeadProfile)
  }

  findByUserId(userId: string) {
    return this.repo.findOne({ where: { userId } })
  }

  listByRoleSlug(roleSlug: string) {
    return this.repo
      .createQueryBuilder('ulp')
      .innerJoin('user_roles', 'ur', 'ur.user_id = ulp.user_id')
      .innerJoin('roles', 'r', 'r.id = ur.role_id')
      .where('r.slug = :roleSlug', { roleSlug })
      .andWhere('ulp.is_accepting_leads = true')
      .getMany()
  }

  upsert(userId: string, data: Partial<UserLeadProfile>) {
    return this.repo.save(
      this.repo.create({
        userId,
        segments: data.segments ?? [],
        isAcceptingLeads: data.isAcceptingLeads ?? true,
        maxActiveLeads: data.maxActiveLeads ?? null,
      })
    )
  }
}

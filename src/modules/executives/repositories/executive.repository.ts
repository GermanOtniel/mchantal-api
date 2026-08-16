import { AppDataSource } from '../../../database/data-source'
import { User } from '../../../entities/auth/user.entity'
import { HttpError } from '../../auth/http-error'
import type {
  ExecutiveData,
  ExecutiveRepositoryPort,
  UpdateExecutiveData,
} from '../types/executives.types'

function toData(u: User): ExecutiveData {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    isActive: u.isExecutive,
    coverage: u.coverage ?? {},
    lastAssignedAt: u.lastAssignedAt ?? null,
  }
}

export class ExecutiveRepository implements ExecutiveRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(User)
  }

  async listExecutives(): Promise<ExecutiveData[]> {
    const rows = await this.repo.find({
      where: { isExecutive: true },
      order: { fullName: 'ASC' },
    })
    return rows.map(toData)
  }

  async findById(id: string): Promise<ExecutiveData | null> {
    const u = await this.repo.findOne({ where: { id } })
    return u ? toData(u) : null
  }

  async findActiveByCoverage(attribute: string, value: string): Promise<ExecutiveData[]> {
    const rows = await this.repo
      .createQueryBuilder('u')
      .where('u.is_executive = true')
      .andWhere(`u.coverage @> CAST(:json AS jsonb)`, {
        json: JSON.stringify({ [attribute]: [value] }),
      })
      .getMany()
    return rows.map(toData)
  }

  async findAllActive(): Promise<ExecutiveData[]> {
    const rows = await this.repo.find({ where: { isExecutive: true } })
    return rows.map(toData)
  }

  async update(id: string, patch: UpdateExecutiveData): Promise<ExecutiveData> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new HttpError('Ejecutivo no encontrado', 404, 'EXECUTIVE_NOT_FOUND')
    if (patch.isActive !== undefined) existing.isExecutive = patch.isActive
    if (patch.coverage !== undefined) existing.coverage = patch.coverage
    const saved = await this.repo.save(existing)
    return toData(saved)
  }

  async touchLastAssignedAt(id: string): Promise<void> {
    await this.repo.update(id, { lastAssignedAt: new Date() })
  }
}
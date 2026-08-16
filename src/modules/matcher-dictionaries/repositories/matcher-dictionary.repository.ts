import { AppDataSource } from '../../../database/data-source'
import { MatcherDictionary } from '../../../entities/matcher/matcher-dictionary.entity'
import { HttpError } from '../../auth/http-error'
import type {
  CreateDictionaryData,
  MatcherCategory,
  MatcherDictionaryData,
  MatcherDictionaryRepositoryPort,
  UpdateDictionaryData,
} from '../types/dictionary.types'

function toData(d: MatcherDictionary): MatcherDictionaryData {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    categories: d.categories as MatcherCategory[],
    isSystem: d.isSystem,
  }
}

export class MatcherDictionaryRepository implements MatcherDictionaryRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(MatcherDictionary)
  }

  async listAll(): Promise<MatcherDictionaryData[]> {
    const all = await this.repo.find({ order: { name: 'ASC' } })
    return all.map(toData)
  }

  async findById(id: string): Promise<MatcherDictionaryData | null> {
    const d = await this.repo.findOne({ where: { id } })
    return d ? toData(d) : null
  }

  async findBySlug(slug: string): Promise<MatcherDictionaryData | null> {
    const d = await this.repo.findOne({ where: { slug } })
    return d ? toData(d) : null
  }

  async create(data: CreateDictionaryData): Promise<MatcherDictionaryData> {
    const saved = await this.repo.save(
      this.repo.create({
        slug: data.slug,
        name: data.name,
        categories: data.categories,
        isSystem: data.isSystem ?? false,
      })
    )
    return toData(saved)
  }

  async update(id: string, patch: UpdateDictionaryData): Promise<MatcherDictionaryData> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new HttpError('Diccionario no encontrado', 404, 'DICTIONARY_NOT_FOUND')
    Object.assign(existing, patch)
    const saved = await this.repo.save(existing)
    return toData(saved)
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id)
  }

  async slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const found = await this.repo.findOne({ where: { slug } })
    if (!found) return false
    return found.id !== exceptId
  }
}
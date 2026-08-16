import { HttpError } from '../../auth/http-error'
import type {
  CreateDictionaryData,
  MatcherDictionaryData,
  MatcherDictionaryRepositoryPort,
  UpdateDictionaryData,
} from '../types/dictionary.types'
import { validateMatcherDictionary } from './dictionary-validator'

export class MatcherDictionaryService {
  constructor(private readonly dictionaries: MatcherDictionaryRepositoryPort) {}

  async listAll(): Promise<MatcherDictionaryData[]> {
    return this.dictionaries.listAll()
  }

  async findById(id: string): Promise<MatcherDictionaryData | null> {
    return this.dictionaries.findById(id)
  }

  async create(input: CreateDictionaryData): Promise<MatcherDictionaryData> {
    const issues = validateMatcherDictionary(input)
    if (issues.length > 0) throw new HttpError('Diccionario inválido', 400, 'INVALID_DICTIONARY', issues)
    if (await this.dictionaries.slugExists(input.slug)) {
      throw new HttpError(`El slug "${input.slug}" ya existe`, 409, 'SLUG_TAKEN')
    }
    return this.dictionaries.create({ ...input, isSystem: input.isSystem ?? false })
  }

  async update(id: string, patch: UpdateDictionaryData): Promise<MatcherDictionaryData> {
    const existing = await this.dictionaries.findById(id)
    if (!existing) throw new HttpError('Diccionario no encontrado', 404, 'DICTIONARY_NOT_FOUND')
    if (existing.isSystem) {
      throw new HttpError('Los diccionarios de sistema no se pueden editar', 403, 'SYSTEM_DICTIONARY')
    }
    const merged = { slug: existing.slug, name: existing.name, categories: existing.categories, ...patch }
    const issues = validateMatcherDictionary(merged)
    if (issues.length > 0) throw new HttpError('Diccionario inválido', 400, 'INVALID_DICTIONARY', issues)
    if (patch.slug !== undefined && patch.slug !== existing.slug && await this.dictionaries.slugExists(patch.slug, id)) {
      throw new HttpError(`El slug "${patch.slug}" ya existe`, 409, 'SLUG_TAKEN')
    }
    return this.dictionaries.update(id, patch)
  }

  async clone(id: string): Promise<MatcherDictionaryData> {
    const existing = await this.dictionaries.findById(id)
    if (!existing) throw new HttpError('Diccionario no encontrado', 404, 'DICTIONARY_NOT_FOUND')
    let slug = `${existing.slug}-copia`
    let suffix = 2
    while (await this.dictionaries.slugExists(slug)) {
      slug = `${existing.slug}-copia-${suffix++}`
    }
    return this.dictionaries.create({
      slug,
      name: `${existing.name} (copia)`,
      categories: existing.categories,
      isSystem: false,
    })
  }

  async delete(id: string): Promise<void> {
    const existing = await this.dictionaries.findById(id)
    if (!existing) throw new HttpError('Diccionario no encontrado', 404, 'DICTIONARY_NOT_FOUND')
    if (existing.isSystem) {
      throw new HttpError('Los diccionarios de sistema no se pueden borrar', 403, 'SYSTEM_DICTIONARY')
    }
    await this.dictionaries.delete(id)
  }
}
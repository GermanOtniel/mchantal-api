export type ExecutiveData = {
  id: string
  fullName: string
  email: string
  isActive: boolean // isExecutive === true
  coverage: Record<string, string[]>
  lastAssignedAt: Date | null
}

export type UpdateExecutiveData = {
  isActive?: boolean
  coverage?: Record<string, string[]>
}

export interface ExecutiveRepositoryPort {
  listAll(): Promise<ExecutiveData[]>
  findById(id: string): Promise<ExecutiveData | null>
  findActiveByCoverage(attribute: string, value: string): Promise<ExecutiveData[]>
  findAllActive(): Promise<ExecutiveData[]>
  update(id: string, patch: UpdateExecutiveData): Promise<ExecutiveData>
  touchLastAssignedAt(id: string): Promise<void>
}
import { AppDataSource } from '../../../database/data-source'
import { User } from '../../../entities/auth/user.entity'

export type CreateUserData = Pick<
  User,
  | 'email'
  | 'passwordHash'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'secondLastName'
  | 'fullName'
>

export class UserRepository {
  private get repo() {
    return AppDataSource.getRepository(User)
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } })
  }

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } })
  }

  async create(data: CreateUserData): Promise<User> {
    const u = this.repo.create({
      ...data,
      emailVerifiedAt: null,
    })
    return this.repo.save(u)
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.repo.update({ id: userId }, { passwordHash })
  }
}

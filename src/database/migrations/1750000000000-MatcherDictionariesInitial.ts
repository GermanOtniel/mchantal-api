import type { MigrationInterface, QueryRunner } from 'typeorm'

export class MatcherDictionariesInitial1750000000000 implements MigrationInterface {
  name = 'MatcherDictionariesInitial1750000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "matcher_dictionaries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(120) NOT NULL UNIQUE,
        "name" varchar(200) NOT NULL,
        "categories" jsonb NOT NULL DEFAULT '[]',
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "matcher_dictionaries"`)
  }
}
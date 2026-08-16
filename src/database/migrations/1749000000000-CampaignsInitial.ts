import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CampaignsInitial1749000000000 implements MigrationInterface {
  name = 'CampaignsInitial1749000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "campaigns" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(120) NOT NULL UNIQUE,
        "name" varchar(200) NOT NULL,
        "entry_message" text NOT NULL,
        "flow_definition" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "campaigns"`)
  }
}
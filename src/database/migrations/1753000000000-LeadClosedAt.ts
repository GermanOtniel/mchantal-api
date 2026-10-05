import type { MigrationInterface, QueryRunner } from 'typeorm'

export class LeadClosedAt1753000000000 implements MigrationInterface {
  name = 'LeadClosedAt1753000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaign_leads" ADD COLUMN "closed_at" timestamptz NULL`
    )
    await queryRunner.query(
      `UPDATE "campaign_leads" SET "closed_at" = "enrolled_at" WHERE "status" IN ('qualified', 'disqualified') AND "closed_at" IS NULL`
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaign_leads" DROP COLUMN "closed_at"`
    )
  }
}
import { MigrationInterface, QueryRunner } from 'typeorm'

export class CampaignOriginsAnalytics1750800000000 implements MigrationInterface {
  name = 'CampaignOriginsAnalytics1750800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "campaigns" ADD COLUMN "origins" text[] NOT NULL DEFAULT '{}'`)
    await queryRunner.query(
      `ALTER TABLE "lead_captures" ADD COLUMN "origin" character varying(60) NOT NULL DEFAULT 'unknown'`
    )
    await queryRunner.query(
      `ALTER TABLE "campaign_leads" ADD COLUMN "origin" character varying(60) NOT NULL DEFAULT 'unknown'`
    )
    await queryRunner.query(`CREATE INDEX "campaign_leads_enrolled_at_idx" ON "campaign_leads" ("enrolled_at")`)
    await queryRunner.query(
      `CREATE INDEX "campaign_leads_campaign_enrolled_idx" ON "campaign_leads" ("campaign_id", "enrolled_at")`
    )
    await queryRunner.query(
      `CREATE INDEX "lead_events_type_tovalue_created_idx" ON "lead_events" ("type", "to_value", "created_at")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "lead_events_type_tovalue_created_idx"`)
    await queryRunner.query(`DROP INDEX "campaign_leads_campaign_enrolled_idx"`)
    await queryRunner.query(`DROP INDEX "campaign_leads_enrolled_at_idx"`)
    await queryRunner.query(`ALTER TABLE "campaign_leads" DROP COLUMN "origin"`)
    await queryRunner.query(`ALTER TABLE "lead_captures" DROP COLUMN "origin"`)
    await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "origins"`)
  }
}
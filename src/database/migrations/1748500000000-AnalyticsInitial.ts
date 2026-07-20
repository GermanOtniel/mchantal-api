import { MigrationInterface, QueryRunner } from 'typeorm'

export class AnalyticsInitial1748500000000 implements MigrationInterface {
  name = 'AnalyticsInitial1748500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "analytics_daily_global" (
        "date" date NOT NULL,
        "captures_count" integer NOT NULL DEFAULT 0,
        "enrollments_count" integer NOT NULL DEFAULT 0,
        "conversions_count" integer NOT NULL DEFAULT 0,
        "by_origin" jsonb NOT NULL DEFAULT '{}',
        "computed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_analytics_daily_global" PRIMARY KEY ("date")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "analytics_daily_campaign" (
        "date" date NOT NULL,
        "campaign_id" uuid NOT NULL,
        "captures_count" integer NOT NULL DEFAULT 0,
        "enrollments_count" integer NOT NULL DEFAULT 0,
        "conversions_count" integer NOT NULL DEFAULT 0,
        "by_origin" jsonb NOT NULL DEFAULT '{}',
        "computed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_analytics_daily_campaign" PRIMARY KEY ("date", "campaign_id"),
        CONSTRAINT "FK_analytics_daily_campaign" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_campaign_campaign_date" ON "analytics_daily_campaign" ("campaign_id", "date")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_daily_campaign"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_daily_global"`)
  }
}

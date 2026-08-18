import type { MigrationInterface, QueryRunner } from 'typeorm'

export class ExecutivesAndAssignmentInitial1750100000000 implements MigrationInterface {
  name = 'ExecutivesAndAssignmentInitial1750100000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN "is_executive" boolean NOT NULL DEFAULT false`)
    await q.query(`ALTER TABLE "users" ADD COLUMN "coverage" jsonb NOT NULL DEFAULT '{}'`)
    await q.query(`ALTER TABLE "users" ADD COLUMN "last_assigned_at" timestamptz`)
    await q.query(`ALTER TABLE "campaign_leads" ADD COLUMN "assignment_mode" varchar(20)`)
    await q.query(`ALTER TABLE "campaign_leads" ADD COLUMN "assigned_executive_id" uuid`)
    await q.query(`ALTER TABLE "campaign_leads" ADD COLUMN "assigned_at" timestamptz`)
    await q.query(`ALTER TABLE "campaign_leads" ADD CONSTRAINT "FK_campaign_leads_assigned_executive" FOREIGN KEY ("assigned_executive_id") REFERENCES "users"("id") ON DELETE SET NULL`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "campaign_leads" DROP CONSTRAINT "FK_campaign_leads_assigned_executive"`)
    await q.query(`ALTER TABLE "campaign_leads" DROP COLUMN "assigned_at"`)
    await q.query(`ALTER TABLE "campaign_leads" DROP COLUMN "assigned_executive_id"`)
    await q.query(`ALTER TABLE "campaign_leads" DROP COLUMN "assignment_mode"`)
    await q.query(`ALTER TABLE "users" DROP COLUMN "last_assigned_at"`)
    await q.query(`ALTER TABLE "users" DROP COLUMN "coverage"`)
    await q.query(`ALTER TABLE "users" DROP COLUMN "is_executive"`)
  }
}
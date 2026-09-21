import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CampaignsKindBase1751000000000 implements MigrationInterface {
  name = 'CampaignsKindBase1751000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaigns" ADD COLUMN "kind" varchar(20) NOT NULL DEFAULT 'normal'`
    )
    // Índice único parcial: a lo sumo una fila con kind='base'.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "campaigns_single_base" ON "campaigns" ("kind") WHERE "kind" = 'base'`
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "campaigns_single_base"`)
    await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "kind"`)
  }
}
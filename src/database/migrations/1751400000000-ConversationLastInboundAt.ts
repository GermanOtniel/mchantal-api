import type { MigrationInterface, QueryRunner } from 'typeorm'

export class ConversationLastInboundAt1751400000000 implements MigrationInterface {
  name = 'ConversationLastInboundAt1751400000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" ADD COLUMN "last_inbound_at" timestamptz`
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_conversations" DROP COLUMN "last_inbound_at"`
    )
  }
}
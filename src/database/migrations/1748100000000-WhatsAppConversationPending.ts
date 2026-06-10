import { MigrationInterface, QueryRunner } from 'typeorm'

export class WhatsAppConversationPending1748100000000
  implements MigrationInterface
{
  name = 'WhatsAppConversationPending1748100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_conversations"
      ADD COLUMN "last_message_direction" character varying(20)
    `)

    await queryRunner.query(`
      UPDATE "whatsapp_conversations" c
      SET "last_message_direction" = sub.direction
      FROM (
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id,
          m.direction
        FROM "whatsapp_messages" m
        ORDER BY m.conversation_id, m.sent_at DESC, m.id DESC
      ) sub
      WHERE c.id = sub.conversation_id
    `)

    await queryRunner.query(`
      CREATE TABLE "whatsapp_conversation_read_states" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "last_read_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_whatsapp_conversation_read_states" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_whatsapp_conversation_read_states_pair" UNIQUE ("conversation_id", "user_id"),
        CONSTRAINT "FK_whatsapp_conversation_read_states_conversation" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_whatsapp_conversation_read_states_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_whatsapp_conversation_read_states_user"
      ON "whatsapp_conversation_read_states" ("user_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "whatsapp_conversation_read_states"`)
    await queryRunner.query(`
      ALTER TABLE "whatsapp_conversations"
      DROP COLUMN "last_message_direction"
    `)
  }
}

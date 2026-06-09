import { MigrationInterface, QueryRunner } from 'typeorm'

export class WhatsAppInitial1748000000000 implements MigrationInterface {
  name = 'WhatsAppInitial1748000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "whatsapp_contacts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "wa_id" character varying(20) NOT NULL,
        "profile_name" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_contacts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_whatsapp_contacts_wa_id" UNIQUE ("wa_id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "whatsapp_media_assets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "provider_media_id" character varying(255) NOT NULL,
        "mime_type" character varying(127),
        "sha256" character varying(64),
        "size_bytes" bigint,
        "original_filename" character varying(255),
        "storage_key" character varying(512),
        "download_status" character varying(20) NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_media_assets" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "whatsapp_conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contact_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'open',
        "lead_id" uuid,
        "last_message_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_whatsapp_conversations_contact" FOREIGN KEY ("contact_id") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_conversations_contact_status" ON "whatsapp_conversations" ("contact_id", "status")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_conversations_last_message_at" ON "whatsapp_conversations" ("last_message_at" DESC)`
    )

    await queryRunner.query(`
      CREATE TABLE "whatsapp_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "direction" character varying(20) NOT NULL,
        "provider_message_id" character varying(255) NOT NULL,
        "type" character varying(30) NOT NULL,
        "body_text" text,
        "media_asset_id" uuid,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_messages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_whatsapp_messages_provider_message_id" UNIQUE ("provider_message_id"),
        CONSTRAINT "FK_whatsapp_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_whatsapp_messages_media_asset" FOREIGN KEY ("media_asset_id") REFERENCES "whatsapp_media_assets"("id") ON DELETE SET NULL
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_messages_conversation_sent" ON "whatsapp_messages" ("conversation_id", "sent_at" DESC)`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "whatsapp_messages"`)
    await queryRunner.query(`DROP TABLE "whatsapp_conversations"`)
    await queryRunner.query(`DROP TABLE "whatsapp_media_assets"`)
    await queryRunner.query(`DROP TABLE "whatsapp_contacts"`)
  }
}

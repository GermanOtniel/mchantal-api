import type { MigrationInterface, QueryRunner } from 'typeorm'

export class LeadsWhatsappInitial1749100000000 implements MigrationInterface {
  name = 'LeadsWhatsappInitial1749100000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "whatsapp_contacts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "wa_id" varchar(20) NOT NULL UNIQUE,
      "profile_name" varchar(255),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`)

    await queryRunner.query(`CREATE TABLE "whatsapp_conversations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "contact_id" uuid NOT NULL REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE,
      "status" varchar(20) NOT NULL DEFAULT 'open',
      "lead_id" uuid,
      "last_message_at" timestamptz,
      "last_message_direction" varchar(20),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`)

    await queryRunner.query(`CREATE TABLE "whatsapp_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid NOT NULL REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE,
      "direction" varchar(20) NOT NULL,
      "provider_message_id" varchar(255) NOT NULL UNIQUE,
      "type" varchar(30) NOT NULL,
      "body_text" text,
      "status" varchar(30) NOT NULL DEFAULT 'pending',
      "sent_at" timestamptz NOT NULL,
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`)

    await queryRunner.query(`CREATE TABLE "lead_captures" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "folio" varchar(12) NOT NULL UNIQUE,
      "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
      "status" varchar(20) NOT NULL DEFAULT 'pending',
      "campaign_lead_id" uuid,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`)

    await queryRunner.query(`CREATE TABLE "campaign_leads" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "contact_id" uuid NOT NULL REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE,
      "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
      "context" jsonb NOT NULL DEFAULT '{}',
      "enrolled_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("contact_id", "campaign_id")
    )`)

    await queryRunner.query(`CREATE TABLE "lead_flow_states" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "campaign_lead_id" uuid NOT NULL UNIQUE REFERENCES "campaign_leads"("id") ON DELETE CASCADE,
      "current_node_id" varchar(100) NOT NULL,
      "context" jsonb NOT NULL DEFAULT '{}',
      "status" varchar(20) NOT NULL DEFAULT 'active',
      "last_interaction_at" timestamptz NOT NULL DEFAULT now(),
      "completed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "lead_flow_states"`)
    await queryRunner.query(`DROP TABLE "campaign_leads"`)
    await queryRunner.query(`DROP TABLE "lead_captures"`)
    await queryRunner.query(`DROP TABLE "whatsapp_messages"`)
    await queryRunner.query(`DROP TABLE "whatsapp_conversations"`)
    await queryRunner.query(`DROP TABLE "whatsapp_contacts"`)
  }
}
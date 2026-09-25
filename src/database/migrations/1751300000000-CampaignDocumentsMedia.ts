import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CampaignDocumentsMedia1751300000000 implements MigrationInterface {
  name = 'CampaignDocumentsMedia1751300000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "campaign_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "display_name" varchar(200) NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "mime_type" varchar(100) NOT NULL,
        "file_size" integer NOT NULL,
        "cloudinary_public_id" varchar(300) NOT NULL,
        "cloudinary_url" varchar(500) NOT NULL,
        "meta_media_id" varchar(200),
        "deleted_at" timestamptz,
        "uploaded_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_campaign_documents_campaign" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "idx_campaign_documents_campaign_active" ON "campaign_documents" ("campaign_id", "deleted_at")`
    )

    await queryRunner.query(`ALTER TABLE "whatsapp_messages" ADD COLUMN "media_url" varchar(500)`)
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" ADD COLUMN "media_type" varchar(30)`)
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" ADD COLUMN "media_caption" text`)
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" ADD COLUMN "media_file_name" varchar(255)`)
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" ADD COLUMN "campaign_document_id" uuid`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" DROP COLUMN "campaign_document_id"`)
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" DROP COLUMN "media_file_name"`)
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" DROP COLUMN "media_caption"`)
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" DROP COLUMN "media_type"`)
    await queryRunner.query(`ALTER TABLE "whatsapp_messages" DROP COLUMN "media_url"`)
    await queryRunner.query(`DROP INDEX "idx_campaign_documents_campaign_active"`)
    await queryRunner.query(`DROP TABLE "campaign_documents"`)
  }
}
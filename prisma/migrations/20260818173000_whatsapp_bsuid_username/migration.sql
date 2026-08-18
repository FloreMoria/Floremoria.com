-- AlterTable: WhatsApp BSUID + username (usernames Meta 2026)
ALTER TABLE "whatsapp_chat_sessions" ADD COLUMN IF NOT EXISTS "bsuid" VARCHAR(128);
ALTER TABLE "whatsapp_chat_sessions" ADD COLUMN IF NOT EXISTS "wa_username" VARCHAR(100);

CREATE INDEX IF NOT EXISTS "whatsapp_chat_sessions_bsuid_idx" ON "whatsapp_chat_sessions"("bsuid");

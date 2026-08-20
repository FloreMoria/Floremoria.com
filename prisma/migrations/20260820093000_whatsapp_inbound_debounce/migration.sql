-- Debounce inbound WhatsApp: una sola reply Vera dopo 60s di quiete
CREATE TABLE IF NOT EXISTS "whatsapp_inbound_debounce_batches" (
    "id" TEXT NOT NULL,
    "phone_key" VARCHAR(128) NOT NULL,
    "outbound_address" VARCHAR(128) NOT NULL,
    "sender_name" VARCHAR(255) NOT NULL DEFAULT '',
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "last_inbound_at" TIMESTAMP(3) NOT NULL,
    "flush_after" TIMESTAMP(3) NOT NULL,
    "items_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_inbound_debounce_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_inbound_debounce_batches_phone_key_key"
  ON "whatsapp_inbound_debounce_batches"("phone_key");
CREATE INDEX IF NOT EXISTS "whatsapp_inbound_debounce_batches_status_flush_after_idx"
  ON "whatsapp_inbound_debounce_batches"("status", "flush_after");

-- Finance: compenso fiorista editabile + ricevute cortesia + settlement
DO $$ BEGIN
  CREATE TYPE "FloristSettlementStatus" AS ENUM ('PENDING', 'BONIFICATO', 'RICEVUTA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "florist_compensation_cents" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "florist_vat_rate" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "florist_settlement_status" "FloristSettlementStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "accessory_amount_cents" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "payment_method_label" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "finance_notes" TEXT;

CREATE TABLE IF NOT EXISTS "customer_order_receipts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" VARCHAR(64),
    "issued_at" TIMESTAMP(3) NOT NULL,
    "period_key" VARCHAR(16) NOT NULL,
    "blob_path" TEXT NOT NULL,
    "blob_url" TEXT,
    "content_type" VARCHAR(128) NOT NULL DEFAULT 'text/html; charset=utf-8',
    "gross_cents" INTEGER NOT NULL,
    "floral_imponibile_cents" INTEGER NOT NULL,
    "accessory_imponibile_cents" INTEGER NOT NULL DEFAULT 0,
    "iva_debito_cents" INTEGER NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_order_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_order_receipts_order_id_key" ON "customer_order_receipts"("order_id");
CREATE INDEX IF NOT EXISTS "customer_order_receipts_issued_at_idx" ON "customer_order_receipts"("issued_at");
CREATE INDEX IF NOT EXISTS "customer_order_receipts_period_key_idx" ON "customer_order_receipts"("period_key");
CREATE INDEX IF NOT EXISTS "customer_order_receipts_order_number_idx" ON "customer_order_receipts"("order_number");

DO $$ BEGIN
  ALTER TABLE "customer_order_receipts"
    ADD CONSTRAINT "customer_order_receipts_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

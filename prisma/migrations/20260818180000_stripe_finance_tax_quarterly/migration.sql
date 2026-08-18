-- Contabilità fiscale: movimenti Stripe + fatture mensili commissioni
CREATE TABLE IF NOT EXISTS "stripe_finance_movements" (
    "id" TEXT NOT NULL,
    "stripe_id" VARCHAR(128) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "reporting_category" VARCHAR(64),
    "description" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL DEFAULT 0,
    "net_cents" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'eur',
    "status" VARCHAR(32),
    "created_at_stripe" TIMESTAMP(3) NOT NULL,
    "available_on" TIMESTAMP(3),
    "source_id" VARCHAR(128),
    "payout_id" VARCHAR(128),
    "order_id" TEXT,
    "metadata_json" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_finance_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stripe_finance_movements_stripe_id_key" ON "stripe_finance_movements"("stripe_id");
CREATE INDEX IF NOT EXISTS "stripe_finance_movements_type_created_at_stripe_idx" ON "stripe_finance_movements"("type", "created_at_stripe");
CREATE INDEX IF NOT EXISTS "stripe_finance_movements_created_at_stripe_idx" ON "stripe_finance_movements"("created_at_stripe");
CREATE INDEX IF NOT EXISTS "stripe_finance_movements_payout_id_idx" ON "stripe_finance_movements"("payout_id");

CREATE TABLE IF NOT EXISTS "stripe_service_invoices" (
    "id" TEXT NOT NULL,
    "stripe_invoice_id" VARCHAR(128),
    "period_key" VARCHAR(16) NOT NULL,
    "number" VARCHAR(64),
    "status" VARCHAR(32),
    "issued_at" TIMESTAMP(3) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'eur',
    "total_fee_cents" INTEGER NOT NULL,
    "taxable_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "vat_reverse_charge_cents" INTEGER NOT NULL DEFAULT 0,
    "vendor_name" VARCHAR(128) NOT NULL DEFAULT 'Stripe Payments Europe Ltd',
    "invoice_pdf_url" TEXT,
    "hosted_invoice_url" TEXT,
    "local_pdf_path" TEXT,
    "metadata_json" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_service_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stripe_service_invoices_stripe_invoice_id_key" ON "stripe_service_invoices"("stripe_invoice_id");
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_service_invoices_period_key_key" ON "stripe_service_invoices"("period_key");
CREATE INDEX IF NOT EXISTS "stripe_service_invoices_issued_at_idx" ON "stripe_service_invoices"("issued_at");
CREATE INDEX IF NOT EXISTS "stripe_service_invoices_period_start_period_end_idx" ON "stripe_service_invoices"("period_start", "period_end");

-- Fatture SaaS / estere per Contabilità (upload + ZIP mensile commercialista)
CREATE TABLE IF NOT EXISTS "saas_foreign_invoices" (
    "id" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "vendor_name" VARCHAR(160) NOT NULL,
    "original_currency" VARCHAR(8) NOT NULL DEFAULT 'EUR',
    "original_amount_cents" INTEGER NOT NULL,
    "eur_amount_cents" INTEGER NOT NULL,
    "country_code" VARCHAR(8),
    "jurisdiction" VARCHAR(16) NOT NULL DEFAULT 'EXTRA_UE',
    "autofattura_type" VARCHAR(16) NOT NULL DEFAULT 'TD17',
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(128) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "blob_path" TEXT NOT NULL,
    "blob_url" TEXT,
    "storage_kind" VARCHAR(16) NOT NULL DEFAULT 'blob',
    "period_key" VARCHAR(7) NOT NULL,
    "notes" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saas_foreign_invoices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "saas_foreign_invoices_period_key_idx" ON "saas_foreign_invoices"("period_key");
CREATE INDEX IF NOT EXISTS "saas_foreign_invoices_invoice_date_idx" ON "saas_foreign_invoices"("invoice_date");
CREATE INDEX IF NOT EXISTS "saas_foreign_invoices_vendor_name_idx" ON "saas_foreign_invoices"("vendor_name");

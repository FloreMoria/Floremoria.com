-- Spese / documenti manuali Contabilità (fatture, scontrini, ricevute)
CREATE TABLE IF NOT EXISTS "manual_finance_expenses" (
    "id" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "doc_type" VARCHAR(32) NOT NULL,
    "vendor_name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "vat_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_cents" INTEGER NOT NULL DEFAULT 0,
    "net_cents" INTEGER NOT NULL DEFAULT 0,
    "file_name" VARCHAR(255),
    "content_type" VARCHAR(128),
    "size_bytes" INTEGER,
    "blob_path" TEXT,
    "blob_url" TEXT,
    "storage_kind" VARCHAR(16) NOT NULL DEFAULT 'none',
    "period_key" VARCHAR(7) NOT NULL,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "matched_statement_line_id" TEXT,
    "notes" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "manual_finance_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "manual_finance_expenses_period_key_idx" ON "manual_finance_expenses"("period_key");
CREATE INDEX IF NOT EXISTS "manual_finance_expenses_expense_date_idx" ON "manual_finance_expenses"("expense_date");
CREATE INDEX IF NOT EXISTS "manual_finance_expenses_vendor_name_idx" ON "manual_finance_expenses"("vendor_name");
CREATE INDEX IF NOT EXISTS "manual_finance_expenses_reconciled_idx" ON "manual_finance_expenses"("reconciled");

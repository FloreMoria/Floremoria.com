-- Registro Storico Permanente Contabile (immutabile)
CREATE TABLE IF NOT EXISTS "financial_ledger_entries" (
    "id" TEXT NOT NULL,
    "source_key" VARCHAR(180) NOT NULL,
    "source_type" VARCHAR(32) NOT NULL,
    "source_id" VARCHAR(128) NOT NULL,
    "direction" VARCHAR(16) NOT NULL,
    "category" VARCHAR(48) NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "fiscal_quarter" INTEGER NOT NULL,
    "period_key" VARCHAR(7) NOT NULL,
    "accounting_date" TIMESTAMP(3) NOT NULL,
    "value_date" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "counterparty_name" VARCHAR(160),
    "counterparty_vat" VARCHAR(32),
    "net_cents" INTEGER NOT NULL,
    "vat_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'EUR',
    "reconciliation_status" VARCHAR(24) NOT NULL DEFAULT 'UNMATCHED',
    "document_ref" VARCHAR(160),
    "attachment_url" TEXT,
    "attachment_path" TEXT,
    "attachment_kind" VARCHAR(32),
    "bank_line_id" TEXT,
    "order_id" TEXT,
    "partner_id" TEXT,
    "metadata_json" JSONB,
    "reversed_at" TIMESTAMP(3),
    "reverses_entry_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "financial_ledger_entries_source_key_key"
  ON "financial_ledger_entries"("source_key");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_fiscal_year_fiscal_quarter_idx"
  ON "financial_ledger_entries"("fiscal_year", "fiscal_quarter");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_period_key_idx"
  ON "financial_ledger_entries"("period_key");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_category_idx"
  ON "financial_ledger_entries"("category");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_direction_idx"
  ON "financial_ledger_entries"("direction");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_accounting_date_idx"
  ON "financial_ledger_entries"("accounting_date");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_partner_id_idx"
  ON "financial_ledger_entries"("partner_id");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_order_id_idx"
  ON "financial_ledger_entries"("order_id");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_source_type_source_id_idx"
  ON "financial_ledger_entries"("source_type", "source_id");

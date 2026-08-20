-- Rendiconti / estratti conto FinecoBank (upload Contabilità)
CREATE TABLE IF NOT EXISTS "bank_statement_documents" (
    "id" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(128) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "blob_path" TEXT NOT NULL,
    "blob_url" TEXT,
    "storage_kind" VARCHAR(16) NOT NULL DEFAULT 'blob',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "status" VARCHAR(24) NOT NULL DEFAULT 'UPLOADED',
    "parse_error" TEXT,
    "closing_balance_cents" INTEGER,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "unmatched_count" INTEGER NOT NULL DEFAULT 0,
    "metadata_json" JSONB,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_statement_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bank_statement_documents_uploaded_at_idx" ON "bank_statement_documents"("uploaded_at");
CREATE INDEX IF NOT EXISTS "bank_statement_documents_status_idx" ON "bank_statement_documents"("status");
CREATE INDEX IF NOT EXISTS "bank_statement_documents_period_start_period_end_idx" ON "bank_statement_documents"("period_start", "period_end");

CREATE TABLE IF NOT EXISTS "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "line_index" INTEGER NOT NULL,
    "value_date" TIMESTAMP(3),
    "accounting_date" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "debit_cents" INTEGER,
    "credit_cents" INTEGER,
    "balance_cents" INTEGER,
    "match_status" VARCHAR(24) NOT NULL DEFAULT 'UNMATCHED',
    "match_type" VARCHAR(48),
    "match_score" INTEGER,
    "matched_tx_id" VARCHAR(128),
    "matched_order_id" TEXT,
    "match_notes" TEXT,
    "raw_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bank_statement_lines_document_id_line_index_idx" ON "bank_statement_lines"("document_id", "line_index");
CREATE INDEX IF NOT EXISTS "bank_statement_lines_match_status_idx" ON "bank_statement_lines"("match_status");
CREATE INDEX IF NOT EXISTS "bank_statement_lines_accounting_date_idx" ON "bank_statement_lines"("accounting_date");

DO $$ BEGIN
  ALTER TABLE "bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "bank_statement_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

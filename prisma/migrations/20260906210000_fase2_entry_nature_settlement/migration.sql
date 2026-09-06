-- Fase 2: partita esplicita — colonne NULLABLE senza default / senza backfill.
ALTER TABLE "financial_ledger_entries"
  ADD COLUMN IF NOT EXISTS "entry_nature" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "settlement_status" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "matched_entry_id" TEXT,
  ADD COLUMN IF NOT EXISTS "matched_bank_line_id" TEXT;

CREATE INDEX IF NOT EXISTS "financial_ledger_entries_settlement_status_idx"
  ON "financial_ledger_entries"("settlement_status");

-- Fase 3: chiave canonica + stato verifica documenti passivi (nullable, no backfill).
ALTER TABLE "manual_finance_expenses"
  ADD COLUMN IF NOT EXISTS "canonical_doc_key" VARCHAR(220),
  ADD COLUMN IF NOT EXISTS "verification_status" VARCHAR(16);

ALTER TABLE "saas_foreign_invoices"
  ADD COLUMN IF NOT EXISTS "canonical_doc_key" VARCHAR(220),
  ADD COLUMN IF NOT EXISTS "verification_status" VARCHAR(16);

CREATE UNIQUE INDEX IF NOT EXISTS "manual_finance_expenses_canonical_doc_key_key"
  ON "manual_finance_expenses"("canonical_doc_key");

CREATE UNIQUE INDEX IF NOT EXISTS "saas_foreign_invoices_canonical_doc_key_key"
  ON "saas_foreign_invoices"("canonical_doc_key");

CREATE INDEX IF NOT EXISTS "manual_finance_expenses_verification_status_idx"
  ON "manual_finance_expenses"("verification_status");

CREATE INDEX IF NOT EXISTS "saas_foreign_invoices_verification_status_idx"
  ON "saas_foreign_invoices"("verification_status");

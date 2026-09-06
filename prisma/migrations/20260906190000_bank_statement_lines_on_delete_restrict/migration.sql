-- Fase 1 finance: stop CASCADE su eliminazione estratto → righe movimento.
-- financial_ledger_entries.bank_line_id NON ha FK Prisma: nessuna cascade ledger.
ALTER TABLE "bank_statement_lines"
  DROP CONSTRAINT IF EXISTS "bank_statement_lines_document_id_fkey";

ALTER TABLE "bank_statement_lines"
  ADD CONSTRAINT "bank_statement_lines_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "bank_statement_documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

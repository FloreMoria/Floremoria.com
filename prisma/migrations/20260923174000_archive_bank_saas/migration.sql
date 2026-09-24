-- Soft-archive: nessuna cancellazione fisica di estratti Fineco / fatture SaaS.
ALTER TABLE "bank_statement_documents" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "bank_statement_documents_archived_at_idx" ON "bank_statement_documents"("archived_at");

ALTER TABLE "saas_foreign_invoices" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "saas_foreign_invoices_archived_at_idx" ON "saas_foreign_invoices"("archived_at");

-- Fase 1 Contabilità: hash file estratto + fingerprint riga (dedup Fineco)
ALTER TABLE "bank_statement_documents" ADD COLUMN IF NOT EXISTS "sha256_hash" VARCHAR(64);
ALTER TABLE "bank_statement_lines" ADD COLUMN IF NOT EXISTS "fingerprint" VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_statement_documents_sha256_hash_key"
  ON "bank_statement_documents"("sha256_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "bank_statement_lines_fingerprint_key"
  ON "bank_statement_lines"("fingerprint");

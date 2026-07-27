-- Persistenza ID post social + snapshot metriche per Command Center
ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "external_id" VARCHAR(191);
ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3);
ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "metrics_json" JSONB;
ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "metrics_synced_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "marketing_campaigns_targetChannel_status_published_at_idx"
  ON "marketing_campaigns"("targetChannel", "status", "published_at");

CREATE INDEX IF NOT EXISTS "marketing_campaigns_external_id_idx"
  ON "marketing_campaigns"("external_id");

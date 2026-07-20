-- Schema drift: campi presenti in prisma/schema.prisma ma mai migrati su Neon.
-- Perché: senza Partner.user_id e colonne User di attivazione/reset, le query dashboard
-- (fioristi/utenti/ordini con include) falliscono e le sezioni risultano vuote.

-- Partner ↔ User (login fiorista)
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Partner_user_id_key" ON "Partner"("user_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Partner_user_id_fkey'
    ) THEN
        ALTER TABLE "Partner"
            ADD CONSTRAINT "Partner_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Attivazione account / reset password
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activation_token" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activation_token_expires" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_activated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reset_password_token" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reset_password_token_expires" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_activation_token_key" ON "User"("activation_token");
CREATE UNIQUE INDEX IF NOT EXISTS "User_reset_password_token_key" ON "User"("reset_password_token");

-- Allineamento minori già rilevati da prisma migrate diff (idempotenti)
ALTER TABLE "system_state" ALTER COLUMN "updated_at" DROP DEFAULT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'floremoria_logs_data_sessione_idx' AND n.nspname = 'public'
    ) THEN
        DROP INDEX "floremoria_logs_data_sessione_idx";
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'marketing_campaigns_status_targetChannel_contentFormat_schedule'
          AND n.nspname = 'public'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'marketing_campaigns_status_targetChannel_contentFormat_sche_idx'
          AND n.nspname = 'public'
    ) THEN
        ALTER INDEX "marketing_campaigns_status_targetChannel_contentFormat_schedule"
            RENAME TO "marketing_campaigns_status_targetChannel_contentFormat_sche_idx";
    END IF;
END $$;

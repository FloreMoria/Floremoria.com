-- prisma:no-transaction
-- Ruoli mancanti nello enum UserRole (idempotente: produzione può avere valori già aggiunti a mano).
DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE 'ADMIN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE 'FLORIST'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE 'AGENCY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE 'MUNICIPALITY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE 'ACCOUNTANT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE 'STAKEHOLDER'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabella verbali operativi (Overview + /dashboard/logs).
CREATE TABLE IF NOT EXISTS "floremoria_logs" (
    "id" SERIAL NOT NULL,
    "data_sessione" DATE NOT NULL DEFAULT CURRENT_DATE,
    "tag" VARCHAR(50),
    "titolo_argomento" VARCHAR(255),
    "prompt_chiave" TEXT,
    "riassunto_breve" TEXT,
    "search_vector" tsvector,
    "allarmi_critici" TEXT,
    "in_completamento" TEXT,
    "punti_discussi" TEXT,
    "risultati_raggiunti" TEXT,
    "testo_integrale" TEXT,

    CONSTRAINT "floremoria_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "floremoria_logs_data_sessione_idx" ON "floremoria_logs"("data_sessione" DESC);

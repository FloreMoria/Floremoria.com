-- CreateTable
CREATE TABLE "corrispettivi_register_snapshots" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "frozen_at" TIMESTAMP(3) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "source_engine" VARCHAR(64) NOT NULL DEFAULT 'gateway_corrispettivi',
    "row_count" INTEGER NOT NULL,
    "lordo_cents" INTEGER NOT NULL,
    "imponibile_cents" INTEGER NOT NULL,
    "iva_cents" INTEGER NOT NULL,
    "rows_json" JSONB NOT NULL,
    "xlsx_bytes" BYTEA NOT NULL,
    "filename" VARCHAR(180) NOT NULL,
    "rettifica_motivo" TEXT,
    "rettifica_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corrispettivi_register_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "corrispettivi_register_snapshots_year_quarter_version_key" ON "corrispettivi_register_snapshots"("year", "quarter", "version");

-- CreateIndex
CREATE INDEX "corrispettivi_register_snapshots_year_quarter_is_active_idx" ON "corrispettivi_register_snapshots"("year", "quarter", "is_active");

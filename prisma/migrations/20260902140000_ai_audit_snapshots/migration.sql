-- CreateTable
CREATE TABLE "ai_audit_snapshots" (
    "id" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(80),
    "overall_score" INTEGER NOT NULL,
    "brand_mention_rate" INTEGER NOT NULL,
    "guarantee_accuracy_rate" INTEGER NOT NULL,
    "intent_scores" JSONB NOT NULL,
    "prompt_results" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_audit_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_audit_snapshots_run_at_idx" ON "ai_audit_snapshots"("run_at" DESC);

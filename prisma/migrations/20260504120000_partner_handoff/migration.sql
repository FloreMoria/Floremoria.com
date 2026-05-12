-- AlterTable
ALTER TABLE "Order" ADD COLUMN "partner_notify_email" VARCHAR(255);

-- CreateTable
CREATE TABLE "partner_handoff_sessions" (
    "id" TEXT NOT NULL,
    "external_key" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "partner_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_handoff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_handoff_sessions_external_key_key" ON "partner_handoff_sessions"("external_key");

-- CreateIndex
CREATE INDEX "partner_handoff_sessions_expires_at_idx" ON "partner_handoff_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "partner_handoff_sessions" ADD CONSTRAINT "partner_handoff_sessions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

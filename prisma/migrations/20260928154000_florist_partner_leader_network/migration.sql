-- CreateEnum
CREATE TYPE "FloristNetworkRole" AS ENUM ('LEADER', 'PARTNER', 'EXECUTOR');

-- CreateEnum
CREATE TYPE "FloristNetworkStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED');

-- CreateEnum
CREATE TYPE "OrderCancellationCause" AS ENUM ('CUSTOMER', 'FLORIST', 'FLOREMORIA', 'OTHER');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "accept_deadline_at" TIMESTAMP(3),
ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "assigned_at" TIMESTAMP(3),
ADD COLUMN     "cancellation_cause" "OrderCancellationCause",
ADD COLUMN     "coordination_fee_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coordinator_florist_id" TEXT,
ADD COLUMN     "executor_florist_id" TEXT,
ADD COLUMN     "penalty_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referral_fee_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referral_florist_id" TEXT,
ADD COLUMN     "referral_scan_event_id" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "assigned_provinces" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "assigned_region" VARCHAR(120),
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "contract_ended_at" TIMESTAMP(3),
ADD COLUMN     "contract_signed_at" TIMESTAMP(3),
ADD COLUMN     "direct_contract_at" TIMESTAMP(3),
ADD COLUMN     "leader_id" TEXT,
ADD COLUMN     "network_role" "FloristNetworkRole",
ADD COLUMN     "network_status" "FloristNetworkStatus",
ADD COLUMN     "phone" VARCHAR(40),
ADD COLUMN     "preferred_cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "slug" VARCHAR(80);

-- CreateTable
CREATE TABLE "florist_scan_events" (
    "id" TEXT NOT NULL,
    "florist_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "session_token" VARCHAR(64) NOT NULL,

    CONSTRAINT "florist_scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_field_change_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT NOT NULL,
    "actor_role" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field" VARCHAR(120) NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,

    CONSTRAINT "admin_field_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "florist_scan_events_session_token_key" ON "florist_scan_events"("session_token");

-- CreateIndex
CREATE INDEX "florist_scan_events_florist_id_created_at_idx" ON "florist_scan_events"("florist_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_field_change_logs_entity_type_entity_id_created_at_idx" ON "admin_field_change_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_field_change_logs_actor_user_id_created_at_idx" ON "admin_field_change_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Order_referral_scan_event_id_key" ON "Order"("referral_scan_event_id");

-- CreateIndex
CREATE INDEX "Order_referral_florist_id_idx" ON "Order"("referral_florist_id");

-- CreateIndex
CREATE INDEX "Order_executor_florist_id_idx" ON "Order"("executor_florist_id");

-- CreateIndex
CREATE INDEX "Order_coordinator_florist_id_idx" ON "Order"("coordinator_florist_id");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_slug_key" ON "Partner"("slug");

-- CreateIndex
CREATE INDEX "Partner_leader_id_idx" ON "Partner"("leader_id");

-- CreateIndex
CREATE INDEX "Partner_network_status_idx" ON "Partner"("network_status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_referral_florist_id_fkey" FOREIGN KEY ("referral_florist_id") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_referral_scan_event_id_fkey" FOREIGN KEY ("referral_scan_event_id") REFERENCES "florist_scan_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_executor_florist_id_fkey" FOREIGN KEY ("executor_florist_id") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_coordinator_florist_id_fkey" FOREIGN KEY ("coordinator_florist_id") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "florist_scan_events" ADD CONSTRAINT "florist_scan_events_florist_id_fkey" FOREIGN KEY ("florist_id") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed config tariffe rete (centesimi / percento) — mai hardcodate nel codice di calcolo.
-- Idempotente: non sovrascrive valori già presenti.
INSERT INTO "system_state" ("key", "value", "updated_at")
VALUES
  ('florist_network.qr_fee_cents', '500', CURRENT_TIMESTAMP),
  ('florist_network.coordination_percent', '10', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;


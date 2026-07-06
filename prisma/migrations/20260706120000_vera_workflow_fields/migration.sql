-- Workflow nativo VERA: flag ordine, alert operativi, recensioni Google
ALTER TABLE "Order" ADD COLUMN "is_first_order_for_partner" BOOLEAN;
ALTER TABLE "Order" ADD COLUMN "vera_workflow_flags" JSONB;
ALTER TABLE "Order" ADD COLUMN "vera_alert_type" VARCHAR(64);
ALTER TABLE "Order" ADD COLUMN "vera_alert_message" TEXT;
ALTER TABLE "Order" ADD COLUMN "vera_alert_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "vera_alert_priority" VARCHAR(16) DEFAULT 'normal';
ALTER TABLE "Order" ADD COLUMN "order_frozen_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "order_frozen_reason" TEXT;

ALTER TABLE "User" ADD COLUMN "has_left_google_review" BOOLEAN NOT NULL DEFAULT false;

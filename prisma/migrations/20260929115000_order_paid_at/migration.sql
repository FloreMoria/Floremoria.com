-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_paid_at_idx" ON "Order"("paid_at");

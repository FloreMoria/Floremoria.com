-- AlterTable
ALTER TABLE "DeliveryProof" ADD COLUMN "social_ready_after_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeliveryProof" ADD COLUMN "social_ready_primary_url" TEXT;
ALTER TABLE "DeliveryProof" ADD COLUMN "social_copy_category" TEXT;
ALTER TABLE "DeliveryProof" ADD COLUMN "social_sanitized_at" TIMESTAMP(3);

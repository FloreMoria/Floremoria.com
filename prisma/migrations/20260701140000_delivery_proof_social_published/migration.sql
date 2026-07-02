-- AlterTable
ALTER TABLE "DeliveryProof" ADD COLUMN "social_published_channels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MarketingChannel" AS ENUM ('META_FACEBOOK', 'META_INSTAGRAM', 'GOOGLE_ADS', 'LINKEDIN');

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "imageUrl" TEXT NOT NULL,
    "copy" TEXT NOT NULL,
    "hashtags" TEXT[],
    "targetChannel" "MarketingChannel" NOT NULL,
    "category" TEXT NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

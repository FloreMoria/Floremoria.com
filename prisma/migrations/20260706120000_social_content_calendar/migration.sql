-- Calendario editoriale: formati (feed/reel/story) + TikTok
CREATE TYPE "ContentFormat" AS ENUM ('FEED_POST', 'REEL', 'STORY');

ALTER TYPE "MarketingChannel" ADD VALUE 'TIKTOK';

ALTER TABLE "marketing_campaigns"
  ADD COLUMN "videoUrl" TEXT,
  ADD COLUMN "contentFormat" "ContentFormat" NOT NULL DEFAULT 'FEED_POST',
  ADD COLUMN "scheduledFor" DATE;

CREATE INDEX "marketing_campaigns_status_targetChannel_contentFormat_scheduledFor_idx"
  ON "marketing_campaigns" ("status", "targetChannel", "contentFormat", "scheduledFor");

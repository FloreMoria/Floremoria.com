-- Soft-delete + merge pointer for duplicate deceased profiles / orders
ALTER TABLE "DeceasedProfile" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "DeceasedProfile" ADD COLUMN IF NOT EXISTS "merged_into_id" TEXT;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "merged_into_id" VARCHAR(255);

CREATE INDEX IF NOT EXISTS "DeceasedProfile_deleted_at_idx" ON "DeceasedProfile"("deleted_at");
CREATE INDEX IF NOT EXISTS "DeceasedProfile_merged_into_id_idx" ON "DeceasedProfile"("merged_into_id");

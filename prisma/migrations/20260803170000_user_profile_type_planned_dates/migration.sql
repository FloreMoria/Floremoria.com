-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProfileUserType" AS ENUM ('NEW', 'REGULAR', 'SUBSCRIBER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable User: profilazione commerciale + date future senza impegno
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "user_type" "ProfileUserType" NOT NULL DEFAULT 'NEW';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planned_delivery_dates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable DeceasedProfile: date future commemorative
ALTER TABLE "DeceasedProfile" ADD COLUMN IF NOT EXISTS "planned_delivery_dates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

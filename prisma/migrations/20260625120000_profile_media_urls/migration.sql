-- Avatar utente (Giardino della Memoria) e foto commemorativa defunto.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;
ALTER TABLE "DeceasedProfile" ADD COLUMN IF NOT EXISTS "photo_url" TEXT;

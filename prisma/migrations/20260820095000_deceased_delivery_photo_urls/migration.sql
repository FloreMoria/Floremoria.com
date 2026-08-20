-- Gallery foto consegna denormalizzata su scheda defunto
ALTER TABLE "DeceasedProfile" ADD COLUMN IF NOT EXISTS "delivery_photo_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];

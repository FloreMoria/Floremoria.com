-- Mini-App fioristi: fino a 3 foto "prima" e 3 "dopo" per ordine.
ALTER TABLE "DeliveryProof" ADD COLUMN IF NOT EXISTS "photos_before_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeliveryProof" ADD COLUMN IF NOT EXISTS "photos_after_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

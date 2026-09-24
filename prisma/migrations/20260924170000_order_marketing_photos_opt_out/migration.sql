-- Strada A: opt-out facoltativo uso foto consegna per marketing/Momo.
-- Solo aggiunta di colonna; default false; idempotente su Neon.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "marketing_photos_opt_out" BOOLEAN NOT NULL DEFAULT false;

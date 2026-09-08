-- Aliquota IVA prodotto (10|22, nullable) + costo standard fiorista (METODO v1.4 §6.4 / §8.1).
-- Nessun DEFAULT su vat_rate_percent: se manca resta NULL e va compilato a mano.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "vat_rate_percent" INTEGER,
  ADD COLUMN IF NOT EXISTS "florist_standard_cost_cents" INTEGER;

-- Unique su PaymentIntent / chiave idempotenza partner (NULL multipli ammessi in PG).
CREATE UNIQUE INDEX IF NOT EXISTS "Order_stripe_transaction_id_key"
ON "Order" ("stripe_transaction_id");

-- Lookup secondario per annuncio/ordine esterno partner.
CREATE INDEX IF NOT EXISTS "Order_external_announcement_id_idx"
ON "Order" ("external_announcement_id");

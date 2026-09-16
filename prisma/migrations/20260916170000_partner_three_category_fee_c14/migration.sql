-- Partner B2B: tre categorie, fee IVA 22%, C14 month-close, legacy order number, credential env.

CREATE TYPE "PartnerApiCredentialEnvironment" AS ENUM ('TEST', 'LIVE');
CREATE TYPE "PartnerFeeMonthCloseStatus" AS ENUM ('ATTESA', 'RICEVUTA', 'QUADRATA', 'NON_VERIFICABILE', 'ECCEZIONE');

-- Partner: master link + fee config + Stripe Connect
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "master_partner_id" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "commission_percent_inclusive" DECIMAL(5,2);
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" VARCHAR(64);
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "stripe_connect_charges_enabled" BOOLEAN;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "stripe_connect_payouts_enabled" BOOLEAN;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "stripe_connect_verified_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Partner_master_partner_id_idx" ON "Partner"("master_partner_id");

ALTER TABLE "Partner"
  DROP CONSTRAINT IF EXISTS "Partner_master_partner_id_fkey";
ALTER TABLE "Partner"
  ADD CONSTRAINT "Partner_master_partner_id_fkey"
  FOREIGN KEY ("master_partner_id") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Order: master, credential, legacy number, fee VAT split
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "master_partner_id" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "api_credential_id" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "legacy_order_number" VARCHAR(32);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "partner_commission_taxable_cents" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "partner_commission_vat_cents" INTEGER;

CREATE INDEX IF NOT EXISTS "Order_legacy_order_number_idx" ON "Order"("legacy_order_number");
CREATE INDEX IF NOT EXISTS "Order_master_partner_id_idx" ON "Order"("master_partner_id");
CREATE INDEX IF NOT EXISTS "Order_api_credential_id_idx" ON "Order"("api_credential_id");

ALTER TABLE "Order"
  DROP CONSTRAINT IF EXISTS "Order_master_partner_id_fkey";
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_master_partner_id_fkey"
  FOREIGN KEY ("master_partner_id") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  DROP CONSTRAINT IF EXISTS "Order_api_credential_id_fkey";
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_api_credential_id_fkey"
  FOREIGN KEY ("api_credential_id") REFERENCES "partner_api_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Credentials: environment + regeneratedAt
ALTER TABLE "partner_api_credentials"
  ADD COLUMN IF NOT EXISTS "environment" "PartnerApiCredentialEnvironment" NOT NULL DEFAULT 'TEST';
ALTER TABLE "partner_api_credentials"
  ADD COLUMN IF NOT EXISTS "regenerated_at" TIMESTAMP(3);

UPDATE "partner_api_credentials"
SET "environment" = 'TEST'
WHERE "public_id" LIKE 'fmp_test_%';

UPDATE "partner_api_credentials"
SET "environment" = 'LIVE'
WHERE "public_id" LIKE 'fmp_live_%';

CREATE INDEX IF NOT EXISTS "partner_api_credentials_environment_is_active_idx"
  ON "partner_api_credentials"("environment", "is_active");

-- PartnerFeeMonthClose
CREATE TABLE IF NOT EXISTS "partner_fee_month_closes" (
  "id" TEXT NOT NULL,
  "master_partner_id" TEXT NOT NULL,
  "year_month" VARCHAR(7) NOT NULL,
  "matured_cents" INTEGER NOT NULL DEFAULT 0,
  "matured_taxable_cents" INTEGER NOT NULL DEFAULT 0,
  "matured_vat_cents" INTEGER NOT NULL DEFAULT 0,
  "invoice_cents" INTEGER,
  "connect_cents" INTEGER,
  "tolerance_cents" INTEGER NOT NULL DEFAULT 1,
  "status" "PartnerFeeMonthCloseStatus" NOT NULL DEFAULT 'ATTESA',
  "exception_note" TEXT,
  "invoice_received_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_fee_month_closes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_fee_month_closes_master_partner_id_year_month_key"
  ON "partner_fee_month_closes"("master_partner_id", "year_month");
CREATE INDEX IF NOT EXISTS "partner_fee_month_closes_year_month_status_idx"
  ON "partner_fee_month_closes"("year_month", "status");

ALTER TABLE "partner_fee_month_closes"
  DROP CONSTRAINT IF EXISTS "partner_fee_month_closes_master_partner_id_fkey";
ALTER TABLE "partner_fee_month_closes"
  ADD CONSTRAINT "partner_fee_month_closes_master_partner_id_fkey"
  FOREIGN KEY ("master_partner_id") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

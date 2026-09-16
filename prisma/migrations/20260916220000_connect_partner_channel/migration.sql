-- Quarto canale: Stripe Connect partner (account connesso in AF)
CREATE TYPE "ConnectPartnerChargeSource" AS ENUM ('MANUAL', 'API');
CREATE TYPE "ConnectPartnerPayoutStatus" AS ENUM ('PENDING', 'EXPECTED', 'MATCHED', 'CANCELLED');

CREATE TABLE "connect_partner_charges" (
    "id" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" VARCHAR(64) NOT NULL,
    "master_partner_id" TEXT NOT NULL,
    "external_charge_id" VARCHAR(128),
    "accounting_date" TIMESTAMP(3) NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "partner_fee_cents" INTEGER NOT NULL,
    "partner_fee_taxable_cents" INTEGER NOT NULL,
    "partner_fee_vat_cents" INTEGER NOT NULL,
    "stripe_fee_cents" INTEGER NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "external_payout_id" VARCHAR(128),
    "payout_status" "ConnectPartnerPayoutStatus" NOT NULL DEFAULT 'EXPECTED',
    "source" "ConnectPartnerChargeSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connect_partner_charges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connect_partner_charges_order_number_key" ON "connect_partner_charges"("order_number");
CREATE INDEX "connect_partner_charges_master_partner_id_accounting_date_idx" ON "connect_partner_charges"("master_partner_id", "accounting_date");
CREATE INDEX "connect_partner_charges_payout_status_idx" ON "connect_partner_charges"("payout_status");
CREATE INDEX "connect_partner_charges_order_id_idx" ON "connect_partner_charges"("order_id");

ALTER TABLE "connect_partner_charges" ADD CONSTRAINT "connect_partner_charges_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connect_partner_charges" ADD CONSTRAINT "connect_partner_charges_master_partner_id_fkey" FOREIGN KEY ("master_partner_id") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

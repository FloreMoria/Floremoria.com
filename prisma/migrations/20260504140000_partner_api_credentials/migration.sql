-- CreateTable
CREATE TABLE "partner_api_credentials" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "public_id" VARCHAR(80) NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "partner_api_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_api_credentials_public_id_key" ON "partner_api_credentials"("public_id");

-- CreateIndex
CREATE INDEX "partner_api_credentials_partner_id_idx" ON "partner_api_credentials"("partner_id");

-- AddForeignKey
ALTER TABLE "partner_api_credentials" ADD CONSTRAINT "partner_api_credentials_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

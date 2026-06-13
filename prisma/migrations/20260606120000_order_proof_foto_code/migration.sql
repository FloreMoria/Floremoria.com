-- Link corto WhatsApp Proof of Delivery (/f/{code})
ALTER TABLE "Order" ADD COLUMN "proof_foto_code" VARCHAR(10);
ALTER TABLE "Order" ADD COLUMN "proof_foto_expires_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "Order_proof_foto_code_key" ON "Order"("proof_foto_code");

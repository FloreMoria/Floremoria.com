-- CreateTable
CREATE TABLE "memory_garden_opens" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "buyer_email" TEXT,
    "buyer_name" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_garden_opens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memory_garden_opens_order_id_idx" ON "memory_garden_opens"("order_id");

-- AddForeignKey
ALTER TABLE "memory_garden_opens" ADD CONSTRAINT "memory_garden_opens_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

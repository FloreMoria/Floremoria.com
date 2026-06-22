-- CreateTable
CREATE TABLE "phone_blacklist" (
    "id" TEXT NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "phone_blacklist_phone_key" ON "phone_blacklist"("phone");

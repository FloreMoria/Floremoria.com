-- AlterTable
ALTER TABLE "User" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "whatsapp_chat_sessions" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "whatsapp_chat_sessions_is_test_idx" ON "whatsapp_chat_sessions"("is_test");

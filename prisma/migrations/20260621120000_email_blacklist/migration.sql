-- EmailBlacklist: mittenti esclusi dal risponditore assistenza@

CREATE TABLE "email_blacklist" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_blacklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_blacklist_email_key" ON "email_blacklist"("email");

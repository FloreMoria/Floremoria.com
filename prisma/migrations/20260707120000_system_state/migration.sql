-- Stato distribuito per heartbeat POSTMAN (debounce sync IMAP tra istanze serverless).
CREATE TABLE IF NOT EXISTS "system_state" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_state_pkey" PRIMARY KEY ("key")
);

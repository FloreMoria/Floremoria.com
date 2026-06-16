-- Relazioni trilaterali User ↔ Defunto ↔ Fiorista (Partner)
CREATE TABLE IF NOT EXISTS "user_deceased_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "deceased_profile_id" TEXT NOT NULL,
    "relationship" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_deceased_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_deceased_links_user_id_deceased_profile_id_key"
    ON "user_deceased_links"("user_id", "deceased_profile_id");
CREATE INDEX IF NOT EXISTS "user_deceased_links_deceased_profile_id_idx"
    ON "user_deceased_links"("deceased_profile_id");

ALTER TABLE "user_deceased_links"
    ADD CONSTRAINT "user_deceased_links_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_deceased_links"
    ADD CONSTRAINT "user_deceased_links_deceased_profile_id_fkey"
    FOREIGN KEY ("deceased_profile_id") REFERENCES "DeceasedProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "partner_deceased_assignments" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "deceased_profile_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_deceased_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_deceased_assignments_partner_id_deceased_profile_id_key"
    ON "partner_deceased_assignments"("partner_id", "deceased_profile_id");
CREATE INDEX IF NOT EXISTS "partner_deceased_assignments_deceased_profile_id_idx"
    ON "partner_deceased_assignments"("deceased_profile_id");

ALTER TABLE "partner_deceased_assignments"
    ADD CONSTRAINT "partner_deceased_assignments_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partner_deceased_assignments"
    ADD CONSTRAINT "partner_deceased_assignments_deceased_profile_id_fkey"
    FOREIGN KEY ("deceased_profile_id") REFERENCES "DeceasedProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

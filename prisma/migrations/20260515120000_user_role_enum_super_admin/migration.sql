-- Enum ruoli di sistema + colonna systemRole su User (Super Admin solo via script offline).
CREATE TYPE "UserRole" AS ENUM ('USER', 'OPERATOR', 'MARKETING_MANAGER', 'PARTNER_FLORIST', 'SUPER_ADMIN');

ALTER TABLE "User" ADD COLUMN "system_role" "UserRole" NOT NULL DEFAULT 'USER';

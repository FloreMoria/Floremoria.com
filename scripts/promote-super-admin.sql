-- Promozione Super Admin (eseguire DOPO migrate deploy con colonna system_role).
-- Uso sul server:
--   psql "$DATABASE_URL" -f scripts/promote-super-admin.sql
-- oppure sostituire :email con ceo@floremoria.com

INSERT INTO "Role" (id, name, description, "isSystem", permissions, "createdAt", "updatedAt")
SELECT
    'cmlsuperadminrole01',
    'SUPER_ADMIN',
    'Super Admin (solo script/SQL offline)',
    true,
    '{"ALL_PRIVILEGES_GRANTED": true}'::jsonb,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE name = 'SUPER_ADMIN');

UPDATE "Role"
SET "isSystem" = true,
    permissions = '{"ALL_PRIVILEGES_GRANTED": true}'::jsonb
WHERE name = 'SUPER_ADMIN';

INSERT INTO "User" (id, email, name, "system_role", "roleId", "createdAt", "updatedAt")
SELECT
    'cmlsuperadminuser1',
    'ceo@floremoria.com',
    'ceo',
    'SUPER_ADMIN'::"UserRole",
    (SELECT id FROM "Role" WHERE name = 'SUPER_ADMIN' LIMIT 1),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'ceo@floremoria.com');

UPDATE "User"
SET "system_role" = 'SUPER_ADMIN'::"UserRole",
    "roleId" = (SELECT id FROM "Role" WHERE name = 'SUPER_ADMIN' LIMIT 1),
    "roleExpiresAt" = NULL
WHERE email = 'ceo@floremoria.com';

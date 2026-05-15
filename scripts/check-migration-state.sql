-- Diagnostica migrazione fallita (eseguire sul server con psql "$DATABASE_URL" -f scripts/check-migration-state.sql)

SELECT migration_name, finished_at, rolled_back_at, LEFT(logs, 200) AS logs_preview
FROM "_prisma_migrations"
ORDER BY started_at;

SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Order' AND column_name = 'partner_notify_email'
) AS has_partner_notify_email;

SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'partner_handoff_sessions'
) AS has_partner_handoff_table;

SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'system_role'
) AS has_system_role_column;

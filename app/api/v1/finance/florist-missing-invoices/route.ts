/**
 * Alias v1 Contabilità — stessi handler della dashboard admin.
 * Auth: sessione dashboard oppure x-admin-key.
 */
export {
    GET,
    POST,
    PATCH,
    DELETE,
    runtime,
    dynamic,
    maxDuration,
} from '@/app/api/dashboard/finance/florist-missing-invoices/route';

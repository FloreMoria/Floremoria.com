/**
 * Alias operativo: /api/cron/social/pinterest-daily → stesso job di /api/cron/pinterest-daily.
 * Mantiene compatibilità con path documentati nel prompt operativo.
 */
export {
    GET,
    POST,
    runtime,
    dynamic,
    maxDuration,
} from '@/app/api/cron/pinterest-daily/route';

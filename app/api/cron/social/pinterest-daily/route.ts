/**
 * Alias operativo: /api/cron/social/pinterest-daily → stesso job di /api/cron/pinterest-daily.
 * Config segment (runtime/dynamic/maxDuration) dichiarata in loco: Next.js non ammette re-export.
 */
export { GET, POST } from '@/app/api/cron/pinterest-daily/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import prisma from '@/lib/prisma';

const TRIGGER_KEY = 'postman_sync_trigger';

function syncIntervalSeconds(): number {
    const raw = Number(process.env.POSTMAN_SYNC_INTERVAL_SECONDS?.trim() || '90');
    return Number.isFinite(raw) && raw >= 30 ? raw : 90;
}

function postmanSyncUrl(): string | null {
    const base = (
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.VERCEL_URL?.trim() ||
        'https://www.floremoria.com'
    ).replace(/\/$/, '');
    const host = base.startsWith('http') ? base : `https://${base}`;
    return `${host}/api/cron/postman-sync`;
}

function cronSecret(): string | null {
    return (
        process.env.POSTMAN_CRON_SECRET?.trim() ||
        process.env.CRON_SECRET?.trim() ||
        null
    );
}

/**
 * Avvia sync IMAP POSTMAN in background, con debounce globale (default 90s).
 * Usato da traffico sito, dashboard communications e cron esterni.
 */
export async function triggerPostmanBackgroundSync(): Promise<boolean> {
    const secret = cronSecret();
    const url = postmanSyncUrl();
    if (!secret || !url) return false;

    const intervalSec = syncIntervalSeconds();

    try {
        await prisma.$executeRaw`
            INSERT INTO system_state (key, value, updated_at)
            VALUES (${TRIGGER_KEY}, 'idle', NOW() - INTERVAL '1 year')
            ON CONFLICT (key) DO NOTHING
        `;

        const claimed = await prisma.$queryRaw<Array<{ key: string }>>`
            UPDATE system_state
            SET updated_at = NOW(), value = 'pending'
            WHERE key = ${TRIGGER_KEY}
              AND updated_at < NOW() - (${intervalSec} * INTERVAL '1 second')
            RETURNING key
        `;

        if (!claimed.length) return false;

        void fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${secret}` },
            cache: 'no-store',
        })
            .then(async (res) => {
                if (!res.ok) {
                    console.warn(`[postman] Background sync HTTP ${res.status}`);
                }
            })
            .catch((err) => {
                console.warn('[postman] Background sync fetch failed:', err);
            });

        return true;
    } catch (err) {
        console.warn('[postman] Background sync debounce error:', err);
        return false;
    }
}

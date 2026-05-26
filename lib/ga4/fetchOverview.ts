import { getGa4PropertyId } from '@/lib/ga4/config';
import { isGa4ApiConfigured } from '@/lib/ga4/credentials';
import { createGa4DataClient } from '@/lib/ga4/createClient';

export type Ga4OverviewData = {
    isEmpty: boolean;
    totals: {
        users: number;
        sessions: number;
        bounceRate: string;
    };
    dailyTraffic: { date: string; sessions: number }[];
    topPages: {
        path: string;
        title: string;
        views: number;
        avgTime: string;
    }[];
};

export type Ga4OverviewStatus =
    | 'ok'
    | 'auth_error'
    | 'config_missing'
    | 'empty'
    | 'api_error';

export type Ga4OverviewResult = {
    status: Ga4OverviewStatus;
    data: Ga4OverviewData | null;
    lastUpdatedAt: string;
    diagnosticCode: string;
};

const EMPTY: Ga4OverviewData = {
    isEmpty: true,
    totals: { users: 0, sessions: 0, bounceRate: '—' },
    dailyTraffic: [],
    topPages: [],
};

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedResult: Ga4OverviewResult | null = null;
let cacheExpiresAt = 0;

function nowIso(): string {
    return new Date().toISOString();
}

function buildResult(
    status: Ga4OverviewStatus,
    data: Ga4OverviewData | null,
    diagnosticCode: string,
): Ga4OverviewResult {
    return {
        status,
        data,
        diagnosticCode,
        lastUpdatedAt: nowIso(),
    };
}

function classifyGa4Error(error: unknown): {
    status: Extract<Ga4OverviewStatus, 'auth_error' | 'api_error'>;
    diagnosticCode: string;
} {
    const payload = error as
        | { code?: number; details?: string; message?: string }
        | undefined;
    const details = String(payload?.details || '').toLowerCase();
    const message = String(payload?.message || '').toLowerCase();
    const code = payload?.code;

    if (
        details.includes('invalid_grant') ||
        message.includes('invalid_grant') ||
        details.includes('invalid grant') ||
        message.includes('invalid grant')
    ) {
        return { status: 'auth_error', diagnosticCode: 'oauth_invalid_grant' };
    }

    if (code === 401 || details.includes('unauth') || message.includes('unauth')) {
        return { status: 'auth_error', diagnosticCode: 'auth_unauthorized' };
    }

    if (code === 403 || details.includes('permission')) {
        return { status: 'api_error', diagnosticCode: 'permission_denied' };
    }

    if (code === 404 || details.includes('not found') || message.includes('not found')) {
        return { status: 'api_error', diagnosticCode: 'property_not_found' };
    }

    return { status: 'api_error', diagnosticCode: 'api_unknown_error' };
}

export async function fetchGa4OverviewResult(options?: {
    bypassCache?: boolean;
    cacheTtlMs?: number;
}): Promise<Ga4OverviewResult> {
    const ttlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const useCache = !options?.bypassCache;

    if (useCache && cachedResult && Date.now() < cacheExpiresAt) {
        return cachedResult;
    }

    if (!isGa4ApiConfigured()) {
        const result = buildResult('config_missing', null, 'missing_config');
        cachedResult = result;
        cacheExpiresAt = Date.now() + ttlMs;
        return result;
    }

    const propertyId = getGa4PropertyId()!;
    const analyticsDataClient = createGa4DataClient();
    if (!analyticsDataClient) {
        const result = buildResult('config_missing', null, 'client_unavailable');
        cachedResult = result;
        cacheExpiresAt = Date.now() + ttlMs;
        return result;
    }

    try {

        const [trafficReport] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [
                { name: 'totalUsers' },
                { name: 'sessions' },
                { name: 'bounceRate' },
            ],
        });

        const [behaviorReport] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
            metrics: [
                { name: 'screenPageViews' },
                { name: 'averageSessionDuration' },
            ],
            orderBys: [
                { metric: { metricName: 'screenPageViews' }, desc: true },
            ],
            limit: 5,
        });

        let totalUsers = 0;
        let totalSessions = 0;
        let avgBounceRate = 0;
        const dailyTraffic: Ga4OverviewData['dailyTraffic'] = [];

        if (trafficReport.rows) {
            for (const row of trafficReport.rows) {
                const dateRaw = row.dimensionValues?.[0].value || '';
                const dateFormatted = dateRaw
                    ? `${dateRaw.substring(6, 8)}/${dateRaw.substring(4, 6)}`
                    : 'N/A';

                const users = parseInt(row.metricValues?.[0].value || '0', 10);
                const sessions = parseInt(row.metricValues?.[1].value || '0', 10);
                const bounceRate = parseFloat(row.metricValues?.[2].value || '0');

                totalUsers += users;
                totalSessions += sessions;
                avgBounceRate += bounceRate;

                dailyTraffic.push({ date: dateFormatted, sessions });
            }
            avgBounceRate =
                trafficReport.rows.length > 0
                    ? avgBounceRate / trafficReport.rows.length
                    : 0;
            dailyTraffic.sort((a, b) => a.date.localeCompare(b.date));
        }

        const topPages = (behaviorReport.rows || []).map((row) => {
            const pagePath = row.dimensionValues?.[0].value || '/';
            const title = row.dimensionValues?.[1].value || 'Unknown';
            const views = parseInt(row.metricValues?.[0].value || '0', 10);
            const rawTime = parseFloat(row.metricValues?.[1].value || '0');
            const min = Math.floor(rawTime / 60);
            const sec = Math.floor(rawTime % 60);
            const avgTimeFormatted = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
            return { path: pagePath, title, views, avgTime: avgTimeFormatted };
        });

        if (totalSessions === 0 && topPages.length === 0) {
            const result = buildResult(
                'empty',
                { ...EMPTY, isEmpty: true },
                'no_recent_traffic',
            );
            cachedResult = result;
            cacheExpiresAt = Date.now() + ttlMs;
            return result;
        }

        const result = buildResult(
            'ok',
            {
                isEmpty: false,
                totals: {
                    users: totalUsers,
                    sessions: totalSessions,
                    bounceRate: avgBounceRate.toFixed(2),
                },
                dailyTraffic,
                topPages,
            },
            'ok',
        );
        cachedResult = result;
        cacheExpiresAt = Date.now() + ttlMs;
        return result;
    } catch (e) {
        const classified = classifyGa4Error(e);
        console.error('[GA4] fetchOverview failed:', {
            status: classified.status,
            diagnosticCode: classified.diagnosticCode,
            error: e,
        });
        const result = buildResult(
            classified.status,
            null,
            classified.diagnosticCode,
        );
        cachedResult = result;
        cacheExpiresAt = Date.now() + ttlMs;
        return result;
    }
}

export async function fetchGa4Overview(): Promise<Ga4OverviewData | null> {
    const result = await fetchGa4OverviewResult();
    return result.data;
}

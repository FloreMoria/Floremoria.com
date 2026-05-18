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

const EMPTY: Ga4OverviewData = {
    isEmpty: true,
    totals: { users: 0, sessions: 0, bounceRate: '—' },
    dailyTraffic: [],
    topPages: [],
};

export async function fetchGa4Overview(): Promise<Ga4OverviewData | null> {
    if (!isGa4ApiConfigured()) {
        return null;
    }

    const propertyId = getGa4PropertyId()!;
    const analyticsDataClient = createGa4DataClient();
    if (!analyticsDataClient) {
        return null;
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
            return { ...EMPTY, isEmpty: true };
        }

        return {
            isEmpty: false,
            totals: {
                users: totalUsers,
                sessions: totalSessions,
                bounceRate: avgBounceRate.toFixed(2),
            },
            dailyTraffic,
            topPages,
        };
    } catch (e) {
        console.error('[GA4] fetchOverview failed:', e);
        return null;
    }
}

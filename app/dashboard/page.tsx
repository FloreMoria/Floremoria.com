import AnalyticsOverviewClient from './AnalyticsOverviewClient';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import prisma from '@/lib/prisma';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { buildGa4ConsoleUrl } from '@/lib/ga4/config';
import { fetchGa4OverviewResult } from '@/lib/ga4/fetchOverview';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';

export const revalidate = 3600;

function loadCSV() {
    try {
        const csvPath = path.join(process.cwd(), 'Tabella prezzi e margini FloreMoria.csv');
        const fileContent = fs.readFileSync(csvPath, 'utf-8');
        const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
        return parsed.data;
    } catch {
        console.warn('CSV non trovato o errore di parsing. Utilizzo logica di fallback.');
        return [];
    }
}

export default async function AdminOverview() {
    const initialGa4Overview = await fetchGa4OverviewResult({ cacheTtlMs: 5 * 60 * 1000 });
    const ga4ApiConfigured = initialGa4Overview.status !== 'config_missing';
    const ga4ConsoleUrl = buildGa4ConsoleUrl('realtime');

    const ordersResult = await runDashboardQuery('overview/orders', [], () =>
        prisma.order.findMany({
            where: visibleDashboardOrdersWhere(),
            include: {
                items: { include: { product: true } },
                partner: true,
            },
            orderBy: { createdAt: 'desc' },
        })
    );

    const logsResult = await runDashboardQuery('overview/logs', [], () =>
        prisma.floremoriaLog.findMany({
            where: {
                NOT: {
                    OR: [
                        { tag: { contains: 'POSTMAN_ASSISTENZA', mode: 'insensitive' as const } },
                        { tag: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                        { topic: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                        { shortSummary: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                        { keyPrompt: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                        { fullText: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                        { discussedPoints: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    ]
                }
            },
            take: 10,
            orderBy: { sessionDate: 'desc' },
        })
    );

    const dbErrors = [
        !ordersResult.ok ? ordersResult.error : null,
        !logsResult.ok ? logsResult.error : null,
    ].filter(Boolean) as string[];

    const csvData = loadCSV();

    return (
        <>
            <div className="max-w-7xl mx-auto px-6 pt-6">
                <DashboardDbAlert page="Overview" errors={dbErrors} />
            </div>
            <AnalyticsOverviewClient
                initialGa4Overview={initialGa4Overview}
                ga4ApiConfigured={ga4ApiConfigured}
                ga4ConsoleUrl={ga4ConsoleUrl}
                initialOrders={ordersResult.data as any[]}
                csvData={csvData}
                latestLogs={logsResult.data}
            />
        </>
    );
}

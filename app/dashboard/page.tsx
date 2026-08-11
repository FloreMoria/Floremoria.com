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
import { floremoriaLogPublicWhere } from '@/lib/floremoriaLogFilters';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import TestModeOverviewBar from '@/components/dashboard/TestModeOverviewBar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    const testModeActive = await getDashboardTestModeActive();
    const initialGa4Overview = await fetchGa4OverviewResult({ cacheTtlMs: 5 * 60 * 1000 });
    const ga4ApiConfigured = initialGa4Overview.status !== 'config_missing';
    const ga4ConsoleUrl = buildGa4ConsoleUrl('realtime');

    const ordersResult = await runDashboardQuery('overview/orders', [], () =>
        prisma.order.findMany({
            where: visibleDashboardOrdersWhere(testModeActive),
            include: {
                items: { include: { product: true } },
                partner: true,
            },
            orderBy: { createdAt: 'desc' },
        })
    );

    const floristsResult = await runDashboardQuery('overview/florists', [], () =>
        prisma.partner.findMany({
            where: { deletedAt: null, isB2B: false },
            orderBy: { shopName: 'asc' },
            select: { id: true, shopName: true, ownerName: true },
        })
    );

    const productsResult = await runDashboardQuery('overview/products', [], () =>
        prisma.product.findMany({
            where: { deletedAt: null, isActive: true },
            orderBy: { name: 'asc' },
            include: { category: true },
        })
    );

    const usersResult = await runDashboardQuery('overview/users', [], () =>
        prisma.user.findMany({
            where: { deletedAt: null, systemRole: 'USER', isTest: testModeActive },
            take: 300,
            select: { id: true, name: true, email: true, phone: true },
        })
    );

    const deceasedResult = await runDashboardQuery('overview/deceased', [], () =>
        prisma.deceasedProfile.findMany({
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: 300,
            select: {
                id: true,
                fullName: true,
                cemeteryCity: true,
                cemeteryName: true,
                birthDate: true,
                deathDate: true,
                plannedDeliveryDates: true,
            },
        })
    );

    const logsResult = await runDashboardQuery('overview/logs', [], () =>
        prisma.floremoriaLog.findMany({
            where: floremoriaLogPublicWhere(),
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
            <div className="max-w-7xl mx-auto px-6 pt-6 space-y-4">
                <DashboardDbAlert page="Overview" errors={dbErrors} />
                <TestModeOverviewBar initialTestModeActive={testModeActive} />
            </div>
            <AnalyticsOverviewClient
                initialGa4Overview={initialGa4Overview}
                ga4ApiConfigured={ga4ApiConfigured}
                ga4ConsoleUrl={ga4ConsoleUrl}
                initialOrders={ordersResult.data as any[]}
                csvData={csvData}
                latestLogs={logsResult.data}
                florists={floristsResult.data}
                products={productsResult.data}
                users={usersResult.data}
                deceasedProfiles={deceasedResult.data}
                testModeActive={testModeActive}
            />
        </>
    );
}

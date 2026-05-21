import AnalyticsOverviewClient from './AnalyticsOverviewClient';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import prisma from '@/lib/prisma';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { buildGa4ConsoleUrl } from '@/lib/ga4/config';
import { fetchGa4Overview } from '@/lib/ga4/fetchOverview';
import { isGa4ApiConfigured } from '@/lib/ga4/credentials';

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
    const ga4Data = await fetchGa4Overview();
    const ga4ApiConfigured = isGa4ApiConfigured();
    const ga4ConsoleUrl = buildGa4ConsoleUrl('realtime');

    const orders = await prisma.order.findMany({
        where: visibleDashboardOrdersWhere(),
        include: {
            items: { include: { product: true } },
            partner: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    const latestLogs = await prisma.floremoriaLog.findMany({
        take: 10,
        orderBy: { sessionDate: 'desc' },
    });

    const csvData = loadCSV();

    return (
        <AnalyticsOverviewClient
            ga4Data={ga4Data}
            ga4ApiConfigured={ga4ApiConfigured}
            ga4ConsoleUrl={ga4ConsoleUrl}
            initialOrders={orders as any[]}
            csvData={csvData}
            latestLogs={latestLogs}
        />
    );
}

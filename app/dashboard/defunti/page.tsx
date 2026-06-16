import prisma from '@/lib/prisma';
import { listDeceasedLeaderRows } from '@/lib/deceased/listDeceasedLeaderRows';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';
import ClientDeceasedTable from './ClientDeceasedTable';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Defunti | FloreMoria Dashboard',
};

export default async function DefuntiPage() {
    const rowsResult = await runDashboardQuery('defunti/rows', [], listDeceasedLeaderRows);

    const partnersResult = await runDashboardQuery('defunti/partners', [], () =>
        prisma.partner.findMany({
            where: { deletedAt: null, isB2B: false, isActive: true },
            select: { id: true, shopName: true, ownerName: true },
            orderBy: { shopName: 'asc' },
        })
    );

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <DashboardDbAlert
                page="Defunti"
                errors={[
                    ...(!rowsResult.ok ? [rowsResult.error] : []),
                    ...(!partnersResult.ok ? [partnersResult.error] : []),
                ]}
            />
            <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Anagrafica Defunti</h1>
                <p className="text-gray-500 font-medium max-w-3xl">
                    Vista leader su ogni memoria commemorativa: profili registrati e righe orfane da ordini non
                    ancora collegati. Apri la scheda per cronologia ordini, parenti, fiorista custode e prove visive.
                </p>
            </div>

            <ClientDeceasedTable initialRows={rowsResult.data} partners={partnersResult.data} />
        </div>
    );
}

import prisma from '@/lib/prisma';
import { PartnerType } from '@prisma/client';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';
import AgenciesTable, { type AgencyRow, type FloristOption } from './AgenciesTable';

export const dynamic = 'force-dynamic';

export default async function AgenzieFunebriPage() {
    const agenciesResult = await runDashboardQuery('agenzie/list', [], () =>
        prisma.partner.findMany({
            where: { deletedAt: null, partnerType: PartnerType.FUNERAL_AGENCY },
            orderBy: { shopName: 'asc' },
            include: {
                defaultFlorist: {
                    select: { id: true, shopName: true, province: true, coverageArea: true },
                },
                _count: { select: { agencyOrders: true } },
            },
        })
    );

    const floristsResult = await runDashboardQuery('agenzie/florists', [], () =>
        prisma.partner.findMany({
            where: { deletedAt: null, isActive: true, partnerType: PartnerType.FLORIST },
            orderBy: { shopName: 'asc' },
            select: {
                id: true,
                shopName: true,
                ownerName: true,
                province: true,
                coverageArea: true,
                isActive: true,
            },
        })
    );

    const agencies: AgencyRow[] = agenciesResult.data.map((a) => ({
        id: a.id,
        shopName: a.shopName,
        ownerName: a.ownerName,
        province: a.province,
        coverageArea: a.coverageArea,
        address: a.address,
        uniqueCode: a.uniqueCode,
        partnershipChannel: a.partnershipChannel,
        agencyNotificationEmail: a.agencyNotificationEmail,
        aggregatorNotificationEmail: a.aggregatorNotificationEmail,
        email: a.email,
        isActive: a.isActive,
        defaultFloristId: a.defaultFloristId,
        defaultFlorist: a.defaultFlorist,
        ordersCount: a._count.agencyOrders,
    }));

    const florists: FloristOption[] = floristsResult.data;

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <DashboardDbAlert
                page="Agenzie Funebri"
                errors={
                    [
                        !agenciesResult.ok ? agenciesResult.error : null,
                        !floristsResult.ok ? floristsResult.error : null,
                    ].filter(Boolean) as string[]
                }
            />
            <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Agenzie Funebri</h1>
                <p className="text-gray-500 font-medium max-w-3xl">
                    Partnership B2B dirette e tramite aggregatori (es. Annunci Funebri). Associa il fiorista di
                    riferimento predefinito e le email di notifica per ogni agenzia.
                </p>
            </div>

            <AgenciesTable initialAgencies={agencies} florists={florists} />
        </div>
    );
}

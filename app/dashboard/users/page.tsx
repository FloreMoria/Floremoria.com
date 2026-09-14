import prisma from '@/lib/prisma';
import ClientUsersTable from './ClientUsersTable';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import { buildUnifiedUsersList } from '@/lib/users/unifiedUsers';
import UserSalesAnalytics from '@/components/dashboard/users/UserSalesAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Gestione Utenti',
};

export default async function UsersPage() {
    const testModeActive = await getDashboardTestModeActive();

    const [ordersResult, floristsResult, registeredUsersResult] = await Promise.all([
        runDashboardQuery('users/orders', [], () =>
            prisma.order.findMany({
                where: visibleDashboardOrdersWhere(testModeActive),
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
                include: {
                    items: {
                        include: {
                            product: {
                                include: {
                                    category: true,
                                },
                            },
                        },
                    },
                    user: {
                        include: {
                            role: true,
                            partner: true,
                        },
                    },
                    deliveryProof: true,
                },
            })
        ),
        runDashboardQuery('users/florists', [], () =>
            prisma.partner.findMany({
                where: { deletedAt: null, isB2B: false },
                orderBy: { shopName: 'asc' },
                select: { id: true, shopName: true, ownerName: true },
            })
        ),
        runDashboardQuery('users/registered', [], () =>
            prisma.user.findMany({
                where: {
                    deletedAt: null,
                    partner: null,
                    NOT: {
                        role: {
                            name: {
                                in: ['FLORIST', 'PARTNER'],
                            },
                        },
                    },
                    systemRole: {
                        notIn: ['FLORIST', 'PARTNER_FLORIST'],
                    },
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    role: true,
                    partner: true,
                },
            })
        ),
    ]);

    const orders = ordersResult.data || [];
    const registeredUsers = registeredUsersResult.data || [];

    const groupedUsers = buildUnifiedUsersList(registeredUsers, orders);

    const dbErrors: string[] = [];
    if (!ordersResult.ok) dbErrors.push(ordersResult.error);
    if (!floristsResult.ok) dbErrors.push(floristsResult.error);
    if (!registeredUsersResult.ok) dbErrors.push(registeredUsersResult.error);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-12 pb-20 fade-in">
            <DashboardDbAlert page="Utenti" errors={dbErrors} />
            <div className="mb-8 pt-4 sm:pt-6">
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Il Giardino della Memoria</h1>
                <p className="text-gray-500 font-medium">
                    Gestione degli Utenti e dello storico ordini fotografici (Giardino della Memoria Infinita).
                </p>
            </div>

            <ClientUsersTable initialUsers={groupedUsers} florists={floristsResult.data || []} />

            <UserSalesAnalytics users={groupedUsers} orders={orders} />
        </div>
    );
}

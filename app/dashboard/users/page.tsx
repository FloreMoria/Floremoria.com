import prisma from '@/lib/prisma';
import ClientUsersTable from './ClientUsersTable';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
    const ordersResult = await runDashboardQuery('users/orders', [], () =>
        prisma.order.findMany({
            where: visibleDashboardOrdersWhere(),
            orderBy: { createdAt: 'desc' },
            include: {
                items: { include: { product: true } },
                user: true,
                deliveryProof: true,
            },
        })
    );

    const orders = ordersResult.data;

    // Raggruppiamo gli ordini per Utente virtuale o reale
    const usersMap = new Map();

    orders.forEach((order) => {
        const key = order.userId || order.customerPhone || order.buyerFullName || order.id;
        
        if (!usersMap.has(key)) {
            usersMap.set(key, {
                id: order.userId || `virtual_${order.id}`,
                name: order.user?.name || order.buyerFullName || 'Utente Sconosciuto',
                email: order.user?.email || order.buyerEmail || '',
                phone: order.user?.phone || order.customerPhone || 'Non specificato',
                city: order.buyerCity || 'Non specificata',
                profilePicUrl: order.user?.avatarUrl || null,
                orders: [],
                totalSpentCents: 0,
                lastOrderDate: order.createdAt,
            });
        }
        
        const userGroup = usersMap.get(key);
        userGroup.orders.push(order);
        userGroup.totalSpentCents += order.totalPriceCents;
        if (!userGroup.profilePicUrl && order.user?.avatarUrl) {
            userGroup.profilePicUrl = order.user.avatarUrl;
        }
    });

    const groupedUsers = Array.from(usersMap.values());

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <DashboardDbAlert
                page="Utenti"
                errors={!ordersResult.ok ? [ordersResult.error] : []}
            />
            <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Il Giardino della Memoria</h1>
                <p className="text-gray-500 font-medium">
                    Gestione degli Utenti e dello storico ordini fotografici (Scatola della Memoria Infinita).
                </p>
            </div>

            <ClientUsersTable initialUsers={groupedUsers} />
        </div>
    );
}

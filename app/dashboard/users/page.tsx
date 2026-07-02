import prisma from '@/lib/prisma';
import ClientUsersTable from './ClientUsersTable';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';
import { enrichOrderWithShareableLinks } from '@/lib/dashboard/enrichOrderShareableLinks';

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

    const floristsResult = await runDashboardQuery('users/florists', [], () =>
        prisma.partner.findMany({
            where: { deletedAt: null, isB2B: false },
            orderBy: { shopName: 'asc' },
            select: { id: true, shopName: true, ownerName: true },
        })
    );

    const orders = ordersResult.data;
    type UserRow = {
        id: string;
        name: string;
        email: string;
        phone: string;
        city: string;
        profilePicUrl: string | null;
        orders: any[];
        totalSpentCents: number;
        lastOrderDate: Date | string;
    };

    const usersMap = new Map<string, UserRow>();

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

        const userGroup = usersMap.get(key)!;
        userGroup.orders.push(enrichOrderWithShareableLinks(order));
        userGroup.totalSpentCents += order.totalPriceCents;
        if (!userGroup.profilePicUrl && order.user?.avatarUrl) {
            userGroup.profilePicUrl = order.user.avatarUrl;
        }
    });

    const groupedUsers = Array.from(usersMap.values()).filter(
        (u) => u.orders.length > 0 && u.totalSpentCents > 0
    );
    const dbErrors: string[] = [];
    if (!ordersResult.ok) dbErrors.push(ordersResult.error);
    if (!floristsResult.ok) dbErrors.push(floristsResult.error);

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <DashboardDbAlert page="Utenti" errors={dbErrors} />
            <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Il Giardino della Memoria</h1>
                <p className="text-gray-500 font-medium">
                    Gestione degli Utenti e dello storico ordini fotografici (Scatola della Memoria Infinita).
                </p>
            </div>

            <ClientUsersTable initialUsers={groupedUsers} florists={floristsResult.data} />
        </div>
    );
}

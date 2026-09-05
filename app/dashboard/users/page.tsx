import prisma from '@/lib/prisma';
import ClientUsersTable from './ClientUsersTable';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';
import { enrichOrderWithShareableLinks } from '@/lib/dashboard/enrichOrderShareableLinks';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';
import { formatPersonName, compareBySurname } from '@/lib/utils/formatPersonName';

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
                    items: { include: { product: true } },
                    user: true,
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
                where: { deletedAt: null },
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

    type UserRow = {
        id: string;
        name: string;
        email: string;
        phone: string;
        city: string;
        role: 'ADMIN' | 'CUSTOMER' | 'FLORIST';
        status: 'ACTIVE' | 'SUSPENDED';
        createdAt: string;
        profilePicUrl: string | null;
        userType: 'NEW' | 'REGULAR' | 'SUBSCRIBER';
        plannedDeliveryDates: string[];
        orders: any[];
        ordersCount: number;
        totalSpentCents: number;
        lastOrderDate: string;
    };

    const usersMap = new Map<string, UserRow>();

    // 1. Inserisci prima gli utenti registrati a sistema
    registeredUsers.forEach((u) => {
        let role: 'ADMIN' | 'CUSTOMER' | 'FLORIST' = 'CUSTOMER';
        const roleNameUpper = (u.role?.name || '').toUpperCase();
        if (roleNameUpper.includes('ADMIN') || u.systemRole === 'SUPER_ADMIN' || u.systemRole === 'ADMIN') {
            role = 'ADMIN';
        } else if (u.partner || roleNameUpper.includes('FLORIST') || roleNameUpper.includes('PARTNER')) {
            role = 'FLORIST';
        }

        const status: 'ACTIVE' | 'SUSPENDED' = u.deletedAt || u.isActive === false ? 'SUSPENDED' : 'ACTIVE';

        const cleanName = formatPersonName(u.name || '');

        usersMap.set(u.id, {
            id: u.id,
            name: cleanName || (u.email ? u.email.split('@')[0] : 'Utente senza nome'),
            email: u.email || '',
            phone: u.phone || 'Non specificato',
            city: u.city || 'Non specificata',
            role,
            status,
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
            profilePicUrl: u.avatarUrl || null,
            userType: u.userType || 'NEW',
            plannedDeliveryDates: u.plannedDeliveryDates || [],
            orders: [],
            ordersCount: 0,
            totalSpentCents: 0,
            lastOrderDate: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
        });
    });

    // 2. Associa/integra gli ordini registrati
    orders.forEach((order) => {
        const key = order.userId || (order.user?.id) || order.customerPhone || order.buyerEmail || order.buyerFullName || order.id;

        if (!usersMap.has(key)) {
            const cleanName = formatPersonName(order.user?.name || order.buyerFullName || '');
            usersMap.set(key, {
                id: order.userId || `virtual_${order.id}`,
                name: cleanName || (order.buyerEmail ? order.buyerEmail.split('@')[0] : 'Utente senza nome'),
                email: order.user?.email || order.buyerEmail || '',
                phone: order.user?.phone || order.customerPhone || 'Non specificato',
                city: order.buyerCity || 'Non specificata',
                role: 'CUSTOMER',
                status: 'ACTIVE',
                createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
                profilePicUrl: order.user?.avatarUrl || null,
                userType: order.user?.userType || 'NEW',
                plannedDeliveryDates: order.user?.plannedDeliveryDates || [],
                orders: [],
                ordersCount: 0,
                totalSpentCents: 0,
                lastOrderDate: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
            });
        }

        const userGroup = usersMap.get(key)!;
        userGroup.orders.push(enrichOrderWithShareableLinks(order));
        userGroup.ordersCount = userGroup.orders.length;
        userGroup.totalSpentCents += order.totalPriceCents;
        if (!userGroup.profilePicUrl && order.user?.avatarUrl) {
            userGroup.profilePicUrl = order.user.avatarUrl;
        }

        const orderTime = new Date(order.createdAt).getTime();
        const lastTime = new Date(userGroup.lastOrderDate).getTime();
        if (orderTime > lastTime) {
            userGroup.lastOrderDate = new Date(order.createdAt).toISOString();
        }
    });

    // Ordinamento alfabetico tassativo per COGNOME (A-Z)
    const groupedUsers = Array.from(usersMap.values()).sort((a, b) =>
        compareBySurname(a.name, b.name)
    );

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
        </div>
    );
}

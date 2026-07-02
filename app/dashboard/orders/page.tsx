import React from 'react';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import ClientOrdersTable from './ClientOrdersTable';
import { visibleDashboardOrdersWhere, ordersListPageWhere } from '@/lib/dashboardOrdersFilter';
import { enrichOrderWithShareableLinks } from '@/lib/dashboard/enrichOrderShareableLinks';
import { compareBySurname } from '@/lib/dashboard/sortDashboardLists';
import { canEditOrderStatus, hasGlobalOrdersView } from '@/lib/dashboardOrderAccess';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';

// MOCK: ID dell'utente loggato, per test fiorista (sostituire in produzione con session.user.id)
const MOCK_FLORIST_ID = 'mock-florist-id';

export const metadata = {
    title: 'Gestione Ordini - FloreMoria Dashboard',
};

export default async function OrdersPage() {
    const cookieStore = await cookies();
    const roleName = cookieStore.get('fm_user_role')?.value || 'USER';
    const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

    const isGlobalAdmin = hasGlobalOrdersView(roleName);
    let canChangeStatus = canEditOrderStatus(roleName);

    // Permessi granulari da tabella Role (override per ruoli custom non elevati).
    if (hasDatabaseUrl && !canChangeStatus) {
        try {
            const role = await prisma.role.findUnique({ where: { name: roleName } });
            if (role && typeof role.permissions === 'object' && role.permissions !== null) {
                const perms = role.permissions as Record<string, boolean>;
                canChangeStatus = !!perms['change_status'] || !!perms['edit_order_status'];
            }
        } catch {
            if (process.env.NODE_ENV === 'development') {
                console.warn(
                    '[FloreMoria] Dashboard Orders: RBAC DB non raggiungibile, applico permessi minimi locali.'
                );
            }
        }
    }

    // Query ordini: consegne reali + annullati (evidenziati in tabella); no carrelli abbandonati.
    const ordersQuery: { where: Record<string, unknown> } = {
        where: ordersListPageWhere() as Record<string, unknown>,
    };
    if (!isGlobalAdmin) {
        // Partner B2B: solo ordini assegnati al proprio account.
        ordersQuery.where = { ...ordersQuery.where, userId: MOCK_FLORIST_ID };
    }

    let ordersData: any[] = [];
    let florists: Array<{ id: string; shopName: string; ownerName: string | null }> = [];
    let products: any[] = [];
    let dashboardUsers: any[] = [];
    let deceasedProfiles: any[] = [];
    const dbErrors: string[] = [];

    if (hasDatabaseUrl) {
        const ordersResult = await runDashboardQuery('orders/list', [], () =>
            prisma.order.findMany({
                ...ordersQuery,
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
                include: {
                    user: true,
                    partner: true,
                    deliveryProof: true,
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            })
        );
        ordersData = ordersResult.data;
        if (!ordersResult.ok) dbErrors.push(ordersResult.error);

        const floristsResult = await runDashboardQuery('orders/florists', [], () =>
            prisma.partner.findMany({
                where: { deletedAt: null, isB2B: false },
                orderBy: { shopName: 'asc' },
                select: { id: true, shopName: true, ownerName: true },
            })
        );
        florists = floristsResult.data;
        if (!floristsResult.ok) dbErrors.push(floristsResult.error);

        const productsResult = await runDashboardQuery('orders/products', [], () =>
            prisma.product.findMany({
                where: { deletedAt: null, isActive: true },
                orderBy: { name: 'asc' },
                include: { category: true },
            })
        );
        products = productsResult.data;
        if (!productsResult.ok) dbErrors.push(productsResult.error);

        const usersResult = await runDashboardQuery('orders/users', [], () =>
            prisma.user.findMany({
                where: { deletedAt: null, systemRole: 'USER' },
                take: 300,
                select: { id: true, name: true, email: true, phone: true, createdAt: true, updatedAt: true },
            })
        );
        dashboardUsers = [...usersResult.data].sort((a, b) => compareBySurname(a.name, b.name));
        if (!usersResult.ok) dbErrors.push(usersResult.error);

        const deceasedResult = await runDashboardQuery('orders/deceased', [], () =>
            prisma.deceasedProfile.findMany({
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
                take: 300,
                select: {
                    id: true,
                    fullName: true,
                    cemeteryCity: true,
                    cemeteryName: true,
                    createdAt: true,
                    updatedAt: true,
                },
            })
        );
        deceasedProfiles = deceasedResult.data;
        if (!deceasedResult.ok) dbErrors.push(deceasedResult.error);
    }

    const displayOrders = ordersData.map((o) =>
        enrichOrderWithShareableLinks({
            ...o,
            specialNotes: o.additionalInstructions || '',
        })
    );

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <DashboardDbAlert page="Ordini" errors={dbErrors} />
            <ClientOrdersTable
                orders={displayOrders}
                florists={florists}
                products={products}
                users={dashboardUsers}
                deceasedProfiles={deceasedProfiles}
                canChangeStatus={canChangeStatus}
                isGlobalAdmin={isGlobalAdmin}
            />
        </div>
    );
}

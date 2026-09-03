import React, { Suspense } from 'react';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import ClientOrdersTable from './ClientOrdersTable';
import { visibleDashboardOrdersWhere, ordersListPageWhere, abandonedDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { enrichOrderWithShareableLinks } from '@/lib/dashboard/enrichOrderShareableLinks';
import { compareBySurname } from '@/lib/dashboard/sortDashboardLists';
import { canEditOrderStatus, hasGlobalOrdersView } from '@/lib/dashboardOrderAccess';
import { runDashboardQuery } from '@/lib/dashboardSafeQuery';
import DashboardDbAlert from '@/components/dashboard/DashboardDbAlert';
import TestModeOverviewBar from '@/components/dashboard/TestModeOverviewBar';
import { getDashboardTestModeActive } from '@/lib/dashboard/testMode';

// MOCK: ID dell'utente loggato, per test fiorista (sostituire in produzione con session.user.id)
const MOCK_FLORIST_ID = 'mock-florist-id';

export const metadata = {
    title: 'Ordini',
};

export default async function OrdersPage({
    searchParams,
}: {
    searchParams: Promise<{ agencyId?: string; partnerId?: string }>;
}) {
    const sp = await searchParams;
    const filterAgencyId = sp.agencyId?.trim() || '';
    const filterPartnerId = sp.partnerId?.trim() || '';

    const cookieStore = await cookies();
    const roleName = cookieStore.get('fm_user_role')?.value || 'USER';
    const testModeActive = await getDashboardTestModeActive();
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

    // Query ordini: consegne reali con pagamento confermato / ordini da evadere.
    const ordersQuery: { where: Record<string, unknown> } = {
        where: ordersListPageWhere(testModeActive) as Record<string, unknown>,
    };
    if (filterAgencyId) {
        ordersQuery.where = { ...ordersQuery.where, agencyId: filterAgencyId };
    }
    if (filterPartnerId) {
        ordersQuery.where = {
            ...ordersQuery.where,
            OR: [{ partnerId: filterPartnerId }, { referralPartnerId: filterPartnerId }],
        };
    }
    if (!isGlobalAdmin) {
        // Partner B2B: solo ordini assegnati al proprio account.
        ordersQuery.where = { ...ordersQuery.where, userId: MOCK_FLORIST_ID };
    }

    let ordersData: any[] = [];
    let abandonedOrdersData: any[] = [];
    let florists: Array<{ id: string; shopName: string; ownerName: string | null }> = [];
    let products: any[] = [];
    let dashboardUsers: any[] = [];
    let deceasedProfiles: any[] = [];
    const dbErrors: string[] = [];

    if (hasDatabaseUrl) {
        const ordersResult = await runDashboardQuery('orders/list', [], () =>
            prisma.order.findMany({
                ...ordersQuery,
                orderBy: [{ deliveryDate: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
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

        if (isGlobalAdmin) {
            const abandonedResult = await runDashboardQuery('orders/abandoned', [], () =>
                prisma.order.findMany({
                    where: abandonedDashboardOrdersWhere(testModeActive) as Record<string, unknown>,
                    orderBy: [{ createdAt: 'desc' }],
                    take: 100,
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
            abandonedOrdersData = abandonedResult.data;
        }

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
                where: { deletedAt: null, systemRole: 'USER', isTest: testModeActive },
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

    const displayAbandonedOrders = abandonedOrdersData.map((o) =>
        enrichOrderWithShareableLinks({
            ...o,
            specialNotes: o.additionalInstructions || '',
        })
    );

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <DashboardDbAlert page="Ordini" errors={dbErrors} />
            {isGlobalAdmin ? <TestModeOverviewBar initialTestModeActive={testModeActive} /> : null}
            <Suspense fallback={<div className="p-8 text-sm text-slate-500">Caricamento ordini…</div>}>
                <ClientOrdersTable
                    orders={displayOrders}
                    abandonedOrders={displayAbandonedOrders}
                    florists={florists}
                    products={products}
                    users={dashboardUsers}
                    deceasedProfiles={deceasedProfiles}
                    canChangeStatus={canChangeStatus}
                    isGlobalAdmin={isGlobalAdmin}
                    testModeActive={testModeActive}
                />
            </Suspense>
        </div>
    );
}

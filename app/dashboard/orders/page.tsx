import React from 'react';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import ClientOrdersTable from './ClientOrdersTable';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';
import { canEditOrderStatus, hasGlobalOrdersView } from '@/lib/dashboardOrderAccess';

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

    // Query ordini: solo consegne reali (no carrelli abbandonati, no CANCELLED).
    const ordersQuery: { where: Record<string, unknown> } = {
        where: visibleDashboardOrdersWhere() as Record<string, unknown>,
    };
    if (!isGlobalAdmin) {
        // Partner B2B: solo ordini assegnati al proprio account.
        ordersQuery.where = { ...ordersQuery.where, userId: MOCK_FLORIST_ID };
    }

    let ordersData: any[] = [];
    let florists: Array<{ id: string; shopName: string; ownerName: string | null }> = [];

    if (hasDatabaseUrl) {
        try {
            ordersData = await prisma.order.findMany({
                ...ordersQuery,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: true,
                    partner: true,
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            });

            florists = await prisma.partner.findMany({
                where: { deletedAt: null, isB2B: false },
                orderBy: { shopName: 'asc' },
                select: { id: true, shopName: true, ownerName: true },
            });
        } catch {
            if (process.env.NODE_ENV === 'development') {
                console.warn(
                    '[FloreMoria] Dashboard Orders: DB non raggiungibile, renderizzo tabella vuota senza crash.'
                );
            }
        }
    }

    const displayOrders = ordersData.map((o) => ({
        ...o,
        specialNotes: o.additionalInstructions || '',
    }));

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ClientOrdersTable
                orders={displayOrders}
                florists={florists}
                canChangeStatus={canChangeStatus}
                isGlobalAdmin={isGlobalAdmin}
            />
        </div>
    );
}

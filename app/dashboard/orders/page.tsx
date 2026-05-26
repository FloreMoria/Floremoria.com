import React from 'react';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import ClientOrdersTable from './ClientOrdersTable';
import { visibleDashboardOrdersWhere } from '@/lib/dashboardOrdersFilter';

// MOCK: ID dell'utente loggato, per test fiorista (sostituire in produzione con session.user.id)
const MOCK_FLORIST_ID = "mock-florist-id";

export const metadata = {
    title: 'Gestione Ordini - FloreMoria Dashboard',
};

export default async function OrdersPage() {
    const cookieStore = await cookies();
    const roleName = cookieStore.get('fm_user_role')?.value || 'USER';
    const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

    // 1. Risolvi RBAC per vedere se può cambiare stato
    let canChangeStatus = false;
    let isGlobalAdmin = false;

    if (roleName === 'SUPER_ADMIN') {
        canChangeStatus = true;
        isGlobalAdmin = true;
    } else if (hasDatabaseUrl) {
        try {
            const role = await prisma.role.findUnique({ where: { name: roleName } });
            if (role && typeof role.permissions === 'object' && role.permissions !== null) {
                const perms = role.permissions as Record<string, boolean>;
                canChangeStatus = !!perms['change_status'];
            }
        } catch {
            if (process.env.NODE_ENV === 'development') {
                console.warn(
                    '[FloreMoria] Dashboard Orders: RBAC DB non raggiungibile, applico permessi minimi locali.'
                );
            }
        }
        if (roleName === 'OPERATOR') isGlobalAdmin = true;
    } else if (roleName === 'OPERATOR') {
        isGlobalAdmin = true;
    }

    // 2. Query Ordini: solo consegne reali (no carrelli abbandonati, no CANCELLED)
    const ordersQuery: any = {
        where: visibleDashboardOrdersWhere(),
    };
    if (!isGlobalAdmin) {
        // Se è un partner, filtra solo i suoi ordini
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
                    partner: true, // Fiorista Assegnato reale
                    items: {
                        include: {
                            product: true // Serve per Nome e Immagine
                        }
                    }
                }
            });

            florists = await prisma.partner.findMany({
                where: { deletedAt: null, isB2B: false },
                orderBy: { shopName: 'asc' },
                select: { id: true, shopName: true, ownerName: true }
            });
        } catch {
            if (process.env.NODE_ENV === 'development') {
                console.warn(
                    '[FloreMoria] Dashboard Orders: DB non raggiungibile, renderizzo tabella vuota senza crash.'
                );
            }
        }
    }

    const displayOrders = ordersData.map(o => ({
        ...o,
        specialNotes: o.additionalInstructions || ''
    }));

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Interactive Client Component */}
            <ClientOrdersTable orders={displayOrders} florists={florists} canChangeStatus={canChangeStatus} isGlobalAdmin={isGlobalAdmin} />
        </div>
    );
}

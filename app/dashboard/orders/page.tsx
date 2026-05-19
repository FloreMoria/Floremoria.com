import React from 'react';
import { Download } from 'lucide-react';
import { cookies } from 'next/headers';
import { PrismaClient } from '@prisma/client';
import ClientOrdersTable from './ClientOrdersTable';

const prisma = new PrismaClient();

// MOCK: ID dell'utente loggato, per test fiorista (sostituire in produzione con session.user.id)
const MOCK_FLORIST_ID = "mock-florist-id";

export const metadata = {
    title: 'Gestione Ordini - FloreMoria Dashboard',
};

export default async function OrdersPage() {
    const cookieStore = await cookies();
    const roleName = cookieStore.get('fm_user_role')?.value || 'USER';

    // 1. Risolvi RBAC per vedere se può cambiare stato
    let canChangeStatus = false;
    let isGlobalAdmin = false;

    if (roleName === 'SUPER_ADMIN') {
        canChangeStatus = true;
        isGlobalAdmin = true;
    } else {
        const role = await prisma.role.findUnique({ where: { name: roleName } });
        if (role && typeof role.permissions === 'object' && role.permissions !== null) {
            const perms = role.permissions as Record<string, boolean>;
            canChangeStatus = !!perms['change_status'];
        }
        if (roleName === 'OPERATOR') isGlobalAdmin = true;
    }

    // 2. Query Ordini con filtro basato su Ruolo (Domain Isolation) e Soft Deletes
    let ordersQuery: any = { where: { deletedAt: null } };
    if (!isGlobalAdmin) {
        // Se è un partner, filtra solo i suoi ordini
        ordersQuery.where = { ...ordersQuery.where, userId: MOCK_FLORIST_ID };
    }

    const ordersData = await prisma.order.findMany({
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

    const florists = await prisma.partner.findMany({
        where: { deletedAt: null, isB2B: false },
        orderBy: { shopName: 'asc' },
        select: { id: true, shopName: true, ownerName: true }
    });

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

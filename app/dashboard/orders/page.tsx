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
            user: true, // Fiorista Assegnato
            items: {
                include: {
                    product: true // Serve per Nome e Immagine
                }
            }
        }
    });

    const displayOrders = ordersData; // La logica del mock-up fallback è stata staccata come richiesto.

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Interactive Client Component */}
            <ClientOrdersTable orders={displayOrders} canChangeStatus={canChangeStatus} isGlobalAdmin={isGlobalAdmin} />
        </div>
    );
}

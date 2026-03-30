import prisma from '@/lib/prisma';
import ClientUsersTable from './ClientUsersTable';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
    // Recupero tutti gli ordini per costruire gli account utente (Poiché non c'è ancora registrazione esplicita)
    const orders = await prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            items: { include: { product: true } },
            user: true,
        }
    });

    // Raggruppiamo gli ordini per Utente virtuale o reale
    const usersMap = new Map();

    orders.forEach((order) => {
        const key = order.userId || order.customerPhone || order.buyerFullName || order.id;
        
        if (!usersMap.has(key)) {
            usersMap.set(key, {
                id: order.userId || `virtual_${order.id}`,
                name: order.user?.name || order.buyerFullName || 'Utente Sconosciuto',
                phone: order.user?.phone || order.customerPhone || 'Non specificato',
                city: order.buyerCity || 'Non specificata',
                orders: [],
                totalSpentCents: 0,
                lastOrderDate: order.createdAt,
            });
        }
        
        const userGroup = usersMap.get(key);
        userGroup.orders.push(order);
        userGroup.totalSpentCents += order.totalPriceCents;
    });

    const groupedUsers = Array.from(usersMap.values());

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
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

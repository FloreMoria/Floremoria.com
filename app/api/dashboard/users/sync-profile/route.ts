import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { orderIds, name, phone, city } = body;

        if (!orderIds || !Array.isArray(orderIds)) {
            return NextResponse.json({ error: 'Missing orderIds' }, { status: 400 });
        }

        // Eseguiamo un mass-update su tutti gli ordini associati a questo profilo virtuale
        await prisma.order.updateMany({
            where: {
                id: { in: orderIds }
            },
            data: {
                buyerFullName: name,
                customerPhone: phone,
                buyerCity: city
            }
        });

        // Se uno di questi ordini appartiene a un utente registrato, aggiorniamo anche il profilo utente vero,
        // altrimenti Next.js HMR ripesca 'User.name' invece del 'buyerFullName' all'aggiornamento della pagina.
        const affectedOrders = await prisma.order.findMany({
            where: { id: { in: orderIds }, userId: { not: null } },
            select: { userId: true }
        });
        
        const userIds = affectedOrders.map(o => o.userId).filter(Boolean) as string[];
        
        if (userIds.length > 0) {
            await prisma.user.updateMany({
                where: { id: { in: userIds } },
                data: {
                    name: name,
                    phone: phone
                }
            });
        }

        return NextResponse.json({ success: true, message: 'Dettagli Utente Sincronizzati' });

    } catch (e) {
        return NextResponse.json({ error: 'Errore interno' }, { status: 500 });
    }
}

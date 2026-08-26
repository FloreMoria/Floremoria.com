import prisma from './lib/prisma';

async function main() {
    console.log('=== TEST AGGIORNAMENTO STATO ORDINE DB ===');
    const order = await prisma.order.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' }
    });

    if (!order) {
        console.log('Nessun ordine trovato');
        return;
    }

    console.log(`Ordine di prova trovato: ID=${order.id}, N°=${order.orderNumber}, Status Attuale=${order.status}`);

    const newStatus = 'COMPLETED';
    console.log(`Tentativo di aggiornare lo stato a '${newStatus}'...`);

    try {
        const updated = await prisma.order.update({
            where: { id: order.id },
            data: { status: newStatus }
        });
        console.log('✅ Aggiornamento riuscito! Nuovo stato:', updated.status);

        // Riporta allo stato precedente
        await prisma.order.update({
            where: { id: order.id },
            data: { status: order.status }
        });
        console.log('Ripristinato stato originale:', order.status);
    } catch (err: any) {
        console.error('❌ ERRORE AGGIORNAMENTO STATO PRISMA:', err);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());

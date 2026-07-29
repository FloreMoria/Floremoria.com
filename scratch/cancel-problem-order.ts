const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const order = await prisma.order.findFirst({
            where: {
                orderNumber: 'FT-PA-26-006'
            }
        });

        if (!order) {
            console.error("Ordine FT-PA-26-006 non trovato.");
            return;
        }

        console.log("Stato attuale dell'ordine:", order.status, "partnerPaymentStatus:", order.partnerPaymentStatus);

        const updated = await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'CANCELLED',
                deletedAt: new Date()
            }
        });

        console.log("Ordine aggiornato con successo a CANCELLED e soft-deleted:", updated.status, "deletedAt:", updated.deletedAt);
    } catch (e) {
        console.error("Errore:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_ORDER_CODES = [
    'FT-PA-26-001',
    'FT-CN-26-002',
    'FT-MI-26-001',
    'FA-BG-26-001',
    'FT-RA-26-001',
    'PT-PN-26-002',
    'PT-UD-26-001',
    'FT-CN-26-001',
    'FT-CO-26-001',
    'FT-CO-26-002',
    'PT-PN-26-003',
    'PT-PN-26-001',
    'FT-CO-26-003',
    'FT-CO-26-TEST1635',
    'FT-CO-26-005',
    'PT-UD-26-002',
    'FF-PD-26-001',
];

async function main() {
    console.log(`🔍 Ricerca ordini da eliminare (${TARGET_ORDER_CODES.length} codici in lista)...`);

    // Trova tutti gli ordini per orderNumber oppure per ID
    const targetOrders = await prisma.order.findMany({
        where: {
            OR: [
                { orderNumber: { in: TARGET_ORDER_CODES } },
                { id: { in: TARGET_ORDER_CODES } },
            ],
        },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            deceasedName: true,
        },
    });

    console.log(`📌 Trovati ${targetOrders.length} ordini corrispondenti nel DB Neon:`);
    targetOrders.forEach((o) => {
        console.log(`   - ID: ${o.id} | Codice: ${o.orderNumber || 'N/D'} | Stato: ${o.status} | Defunto: ${o.deceasedName}`);
    });

    if (targetOrders.length === 0) {
        console.log('⚠️ Nessun ordine trovato per i codici specificati. Operazione completata.');
        return;
    }

    const orderIds = targetOrders.map((o) => o.id);
    const orderNumbers = targetOrders.map((o) => o.orderNumber).filter(Boolean) as string[];

    console.log('\n🧹 Avvio pulizia entità collegate a cascata...');

    // 1. CustomerOrderReceipt
    const deletedReceipts = await prisma.customerOrderReceipt.deleteMany({
        where: {
            OR: [
                { orderId: { in: orderIds } },
                { orderNumber: { in: orderNumbers } },
            ],
        },
    });
    console.log(`   ✓ Eliminate ${deletedReceipts.count} ricevute clienti (CustomerOrderReceipt).`);

    // 2. DeliveryProof
    const deletedProofs = await prisma.deliveryProof.deleteMany({
        where: { orderId: { in: orderIds } },
    });
    console.log(`   ✓ Eliminate ${deletedProofs.count} prove di posa (DeliveryProof).`);

    // 3. OrderItem
    const deletedItems = await prisma.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
    });
    console.log(`   ✓ Eliminati ${deletedItems.count} righe prodotti (OrderItem).`);

    // 4. OfferRedemption
    const deletedOffers = await prisma.offerRedemption.deleteMany({
        where: { orderId: { in: orderIds } },
    });
    console.log(`   ✓ Eliminate ${deletedOffers.count} offerte/riscatti (OfferRedemption).`);

    // 5. MemoryGardenOpen
    const deletedOpens = await prisma.memoryGardenOpen.deleteMany({
        where: { orderId: { in: orderIds } },
    });
    console.log(`   ✓ Eliminate ${deletedOpens.count} aperture giardino memoria (MemoryGardenOpen).`);

    // 6. StripeFinanceMovement
    const deletedStripeMovs = await prisma.stripeFinanceMovement.deleteMany({
        where: { orderId: { in: orderIds } },
    });
    console.log(`   ✓ Eliminati ${deletedStripeMovs.count} movimenti Stripe (StripeFinanceMovement).`);

    // 7. WhatsAppChatMessage e Session se collegate tramite metadata o body
    for (const code of [...orderNumbers, ...orderIds]) {
        await prisma.whatsAppChatMessage.deleteMany({
            where: {
                body: { contains: code },
            },
        });
    }
    console.log(`   ✓ Puliti eventuali log/messaggi WhatsApp correlati.`);

    // 8. Cancellazione finale dei record principali dalla tabella Order
    const deletedOrders = await prisma.order.deleteMany({
        where: { id: { in: orderIds } },
    });

    console.log(`\n✅ COMPLETATO: Rimosse definitivamente ${deletedOrders.count} entità Order dal database Neon.`);
}

main()
    .catch((err) => {
        console.error('❌ Errore durante l\'esecuzione dello script di pulizia:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

import prisma from './lib/prisma';

async function main() {
    const targetId = 'cmt79j1uc0000l704ec2lrofy';
    console.log(`=== RICERCA ENTITÀ '${targetId}' NEL DATABASE ===`);

    const orderById = await prisma.order.findUnique({
        where: { id: targetId },
        include: { user: true, deceasedProfile: true }
    });
    console.log('Order by ID:', orderById ? {
        id: orderById.id,
        orderNumber: orderById.orderNumber,
        buyerFullName: orderById.buyerFullName,
        buyerEmail: orderById.buyerEmail,
        customerPhone: orderById.customerPhone,
        userId: orderById.userId,
        userUniqueCode: orderById.user?.uniqueCode,
        deceasedName: orderById.deceasedName,
        deceasedProfileId: orderById.deceasedProfileId
    } : null);

    const userById = await prisma.user.findFirst({
        where: { OR: [{ id: targetId }, { uniqueCode: targetId }] }
    });
    console.log('User by ID/Code:', userById);

    const deceasedById = await prisma.deceasedProfile.findFirst({
        where: { OR: [{ id: targetId }, { uniqueCode: targetId }] }
    });
    console.log('DeceasedProfile by ID/Code:', deceasedById);

    const orderByProofCode = await prisma.order.findFirst({
        where: { proofFotoCode: targetId }
    });
    console.log('Order by proofFotoCode:', orderByProofCode ? { id: orderByProofCode.id, orderNumber: orderByProofCode.orderNumber } : null);

    // Cerca ordini di questo indirizzo email o nome se trovati
    if (orderById) {
        console.log('\n--- DETTAGLI DELL\'ORDINE TROVATO ---');
        console.log('buyerEmail:', orderById.buyerEmail);
        console.log('userId:', orderById.userId);
        if (orderById.userId) {
            const linkedUser = await prisma.user.findUnique({ where: { id: orderById.userId } });
            console.log('Utente collegato all\'ordine:', linkedUser);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());

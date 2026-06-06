/**
 * Utility una tantum: crea/aggancia account USER per i clienti storici.
 *
 * Per ogni ordine "orfano" (senza userId) che ha email o telefono, cerca un utente
 * esistente; se non c'è, crea un account USER attivo e gli aggancia lo storico ordini.
 * Idempotente: rieseguibile senza creare duplicati né toccare gli ordini già agganciati.
 *
 * Uso:  npx tsx scripts/backfill-users-from-orders.ts
 */
import { loadEnvFiles, printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';

loadEnvFiles();

import prisma from '../lib/prisma';
import {
    findUserByEmail,
    findUserByPhone,
    createUserFromOrder,
    linkHistoricalOrders,
} from '../lib/auth/identity';

async function main() {
    const orphanOrders = await prisma.order.findMany({
        where: {
            userId: null,
            deletedAt: null,
            OR: [
                { buyerEmail: { not: null } },
                { customerPhone: { not: null } },
            ],
        },
        orderBy: { createdAt: 'asc' },
    });

    console.log(`→ Ordini orfani da analizzare: ${orphanOrders.length}`);

    let createdUsers = 0;
    let matchedUsers = 0;
    let linkedOrders = 0;
    let skipped = 0;
    let errors = 0;

    for (const order of orphanOrders) {
        try {
            let user = order.buyerEmail ? await findUserByEmail(order.buyerEmail) : null;
            if (!user && order.customerPhone) {
                user = await findUserByPhone(order.customerPhone);
            }

            if (user) {
                const n = await linkHistoricalOrders(user);
                linkedOrders += n;
                matchedUsers += 1;
            } else {
                const created = await createUserFromOrder(order);
                if (created) {
                    createdUsers += 1;
                } else {
                    skipped += 1;
                }
            }
        } catch (err) {
            errors += 1;
            console.error(`  ✗ Errore sull'ordine ${order.id}:`, err instanceof Error ? err.message : err);
        }
    }

    console.log('—'.repeat(40));
    console.log(`Account USER creati:        ${createdUsers}`);
    console.log(`Utenti esistenti agganciati: ${matchedUsers}`);
    console.log(`Ordini storici collegati:    ${linkedOrders}`);
    console.log(`Ordini saltati (no dati):    ${skipped}`);
    console.log(`Errori:                      ${errors}`);
    console.log('OK: backfill completato.');

    if (errors > 0) process.exitCode = 1;
}

main()
    .catch((err) => {
        console.error('Backfill fallito:', err);
        printDatabaseReachabilityHelp();
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

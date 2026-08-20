/**
 * Script per la pulizia ed eliminazione degli utenti in stato "Orfano" (senza ordini, senza defunti e senza ruolo admin/fiorista).
 *
 * CRITERI DI RIMOZIONE:
 * 1. Nessun ordine effettuato (0 ordini diretti e 0 ordini associati via email).
 * 2. Nessun profilo defunto collegato (deceasedLinks.length == 0).
 * 3. Nessuna attività di acquisto o storia commemorativa.
 *
 * ECCEZIONI PRESERVATE (MAI ELIMINARE):
 * 1. Account Amministratori (systemRole ADMIN/SUPER_ADMIN o role.name "ADMIN").
 * 2. Account Fioristi / Partner (partner != null o role.name "FLORIST"/"PARTNER").
 *
 * ESECUZIONE:
 * npx tsx scripts/cleanup-orphan-users.ts [--execute]
 */
import prisma from '../lib/prisma';
import { revalidatePath } from 'next/cache';

async function runCleanupOrphanUsers() {
    const isExecuteMode = process.argv.includes('--execute');

    console.info('=== INIZIO SCANSIONE E PULIZIA UTENTI ORFANI ===');
    if (!isExecuteMode) {
        console.info('ℹ️  MODALITÀ DRY-RUN (nessun dato verrà modificato nel DB). Per eseguire: npx tsx scripts/cleanup-orphan-users.ts --execute');
    } else {
        console.info('⚡ MODALITÀ ESECUZIONE ATTIVA');
    }

    const allUsers = await prisma.user.findMany({
        where: { deletedAt: null },
        include: {
            role: true,
            partner: true,
            orders: { select: { id: true } },
            deceasedLinks: { select: { id: true } },
        },
    });

    console.info(`Trovati ${allUsers.length} utenti attivi registrati a sistema.`);

    const orphanUsers: typeof allUsers = [];

    for (const u of allUsers) {
        // 1. Eccettua Amministratori e Partner/Fioristi
        const roleNameUpper = (u.role?.name || '').toUpperCase();
        const isAdmin =
            u.systemRole === 'ADMIN' ||
            u.systemRole === 'SUPER_ADMIN' ||
            roleNameUpper.includes('ADMIN');
        const isPartner =
            Boolean(u.partner) ||
            roleNameUpper.includes('FLORIST') ||
            roleNameUpper.includes('PARTNER');

        if (isAdmin || isPartner) {
            continue;
        }

        // 2. Controlla Ordini (diretti ed email)
        const directOrdersCount = u.orders.length;
        let emailOrdersCount = 0;
        if (u.email && u.email.trim()) {
            emailOrdersCount = await prisma.order.count({
                where: {
                    buyerEmail: u.email.trim(),
                    deletedAt: null,
                },
            });
        }
        const totalOrders = directOrdersCount + emailOrdersCount;

        // 3. Controlla Link Defunti
        const deceasedLinksCount = u.deceasedLinks.length;

        // Un utente è orfano se non ha né ordini né defunti ed è un profilo standard senza ruoli speciali
        if (totalOrders === 0 && deceasedLinksCount === 0) {
            orphanUsers.push(u);
        }
    }

    console.info(`\n📊 RISULTATI SCANSIONE ORFANI:`);
    console.info(`- Utenti totali nel DB: ${allUsers.length}`);
    console.info(`- Utenti orfani senza ordini né defunti individuati: ${orphanUsers.length}`);

    if (orphanUsers.length === 0) {
        console.info('🎉 Nessun utente orfano trovato da pulire.');
        process.exit(0);
    }

    console.info('\nELENCO ACCOUNT ORFANI CANDIDATI ALLA PULIZIA:');
    orphanUsers.forEach((u, i) => {
        console.info(
            `  ${i + 1}. ID: ${u.id} | Nome: "${u.name || '—'}" | Email: ${u.email || '—'} | Phone: ${u.phone || '—'} | Created: ${u.createdAt.toISOString().split('T')[0]}`
        );
    });

    if (!isExecuteMode) {
        console.info('\n💡 Per confermare ed applicare la pulizia/soft-delete nel DB Neon PG, esegui:');
        console.info('npx tsx scripts/cleanup-orphan-users.ts --execute');
        process.exit(0);
    }

    console.info('\n🚀 Archiviazione soft-delete utenti orfani in corso...');
    let cleanedCount = 0;

    for (const u of orphanUsers) {
        try {
            await prisma.user.update({
                where: { id: u.id },
                data: {
                    deletedAt: new Date(),
                    isActive: false,
                },
            });
            cleanedCount++;
        } catch (err) {
            console.error(`❌ Errore durante l'archiviazione dell'utente orfano ${u.id}:`, err);
        }
    }

    console.info(`\n✅ PULIZIA COMPLETATA: ${cleanedCount} account orfani archiviati con soft-delete.`);

    try {
        revalidatePath('/dashboard/users');
    } catch {
        // contestualizzazione Next.js
    }

    process.exit(0);
}

runCleanupOrphanUsers().catch((err) => {
    console.error('Errore fatale nello script di pulizia utenti orfani:', err);
    process.exit(1);
});

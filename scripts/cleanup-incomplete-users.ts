/**
 * Script per la pulizia sicura degli utenti incompleti / anonimi nel database Neon PG.
 *
 * CRITERI DI RIMOZIONE:
 * 1. Nome e/o Cognome non validi (name è null, stringa vuota, solo spazi o "Utente Registrato").
 * 2. Nessun ordine effettuato (conteggio ordini associati == 0, sia tramite userId sia tramite buyerEmail).
 *
 * ECCEZIONI PRESERVATE (MAI ELIMINARE):
 * 1. Account Amministratori (systemRole ADMIN/SUPER_ADMIN o role.name "ADMIN").
 * 2. Account Fioristi / Partner (partner != null o role.name "FLORIST"/"PARTNER").
 *
 * ESECUZIONE:
 * npx tsx scripts/cleanup-incomplete-users.ts [--execute]
 */
import prisma from '../lib/prisma';
import { revalidatePath } from 'next/cache';

async function runCleanupIncompleteUsers() {
    const isExecuteMode = process.argv.includes('--execute');

    console.info('=== INIZIO SCANSIONE E PULIZIA UTENTI INCOMPLETI ===');
    if (!isExecuteMode) {
        console.info('ℹ️  MODALITÀ DRY-RUN (nessun dato verrà modificato nel DB). Per eseguire: npx tsx scripts/cleanup-incomplete-users.ts --execute');
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

    const targetUsers: typeof allUsers = [];

    for (const u of allUsers) {
        // 1. Controlla ECCEZIONI CRITICHE (MAI ELIMINARE)
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

        // 2. Controlla Validità Nome
        const rawName = u.name ? u.name.trim() : '';
        const isNameInvalid =
            !rawName ||
            rawName === '' ||
            rawName.toLowerCase() === 'utente registrato' ||
            rawName.toLowerCase() === 'utente sconosciuto';

        // 3. Controlla Ordini (sia via userId che via buyerEmail)
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

        if (isNameInvalid && totalOrders === 0) {
            targetUsers.push(u);
        }
    }

    console.info(`\n📊 RISULTATI SCANSIONE:`);
    console.info(`- Utenti totali nel DB: ${allUsers.length}`);
    console.info(`- Utenti anonimi incompleti senza ordini individuati: ${targetUsers.length}`);

    if (targetUsers.length === 0) {
        console.info('🎉 Nessun utente incompleto trovato da pulire.');
        process.exit(0);
    }

    console.info('\nELENCO ACCOUNT CANDIDATI ALLA PULIZIA:');
    targetUsers.slice(0, 20).forEach((u, i) => {
        console.info(
            `  ${i + 1}. ID: ${u.id} | Email: ${u.email || '—'} | Phone: ${u.phone || '—'} | Created: ${u.createdAt.toISOString().split('T')[0]}`
        );
    });
    if (targetUsers.length > 20) {
        console.info(`  ... e altri ${targetUsers.length - 20} utenti.`);
    }

    if (!isExecuteMode) {
        console.info('\n💡 Per confermare ed applicare il soft-delete/pulizia nel DB Neon PG, esegui:');
        console.info('npx tsx scripts/cleanup-incomplete-users.ts --execute');
        process.exit(0);
    }

    console.info('\n🚀 Esecuzione soft-delete e pulizia utenti in corso...');
    let cleanedCount = 0;

    for (const u of targetUsers) {
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
            console.error(`❌ Errore durante l'archiviazione dell'utente ${u.id}:`, err);
        }
    }

    console.info(`\n✅ PULIZIA COMPLETATA: ${cleanedCount} account anonimi archiviati con soft-delete.`);

    try {
        revalidatePath('/dashboard/users');
    } catch {
        // contestualizzazione Next.js server
    }

    process.exit(0);
}

runCleanupIncompleteUsers().catch((err) => {
    console.error('Errore fatale nello script di pulizia utenti:', err);
    process.exit(1);
});

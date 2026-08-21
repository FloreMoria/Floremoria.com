/**
 * Script per l'eliminazione dei defunti orfani e degli utenti test specificati (Salvo Marsi e "a a").
 *
 * ESECUZIONE:
 * npx tsx scripts/cleanup-orphan-deceased-and-test-users.ts [--execute]
 */
import prisma from '../lib/prisma';
import { listDeceasedLeaderRows } from '../lib/deceased/listDeceasedLeaderRows';

async function runCleanup() {
    const isExecuteMode = process.argv.includes('--execute');

    console.info('=== SCANSIONE E PULIZIA DEFUNTI ORFANI ED UTENTI TEST ===');
    if (!isExecuteMode) {
        console.info('ℹ️  MODALITÀ DRY-RUN. Per applicare nel DB Neon PG: npx tsx scripts/cleanup-orphan-deceased-and-test-users.ts --execute');
    } else {
        console.info('⚡ MODALITÀ ESECUZIONE ATTIVA');
    }

    // 1. Ispezione Defunti Orfani
    const rows = await listDeceasedLeaderRows();
    const orphanRows = rows.filter((r) => r.isOrphan);

    console.info(`Trovate ${orphanRows.length} righe defunti orfane nella dashboard:`);
    orphanRows.forEach((r, i) => {
        console.info(`  ${i + 1}. Nome: "${r.fullName}" | Seed Order: ${r.orphanSeedOrderId || '—'} | Cimitero: ${r.cemeteryName || '—'}`);
    });

    // 2. Ispezione Utenti da Eliminare
    const targetUserIds = ['cmq23nx9b0001l704523b0l8r', 'cmsxagaau0000l604jmowow8l'];
    const targetUsers = await prisma.user.findMany({
        where: { id: { in: targetUserIds } },
        select: { id: true, name: true, email: true, deletedAt: true },
    });

    console.info(`\nTrovati ${targetUsers.length} utenti test da eliminare dal DB:`);
    targetUsers.forEach((u, i) => {
        console.info(`  ${i + 1}. ID: ${u.id} | Nome: "${u.name || '—'}" | Email: ${u.email || '—'}`);
    });

    if (!isExecuteMode) {
        console.info('\n💡 Per confermare ed applicare la pulizia nel DB Neon PG, esegui:');
        console.info('npx tsx scripts/cleanup-orphan-deceased-and-test-users.ts --execute');
        process.exit(0);
    }

    console.info('\n🚀 Esecuzione pulizia nel DB in corso...');

    // A) Soft-delete utenti test
    for (const userId of targetUserIds) {
        try {
            await prisma.user.update({
                where: { id: userId },
                data: { deletedAt: new Date(), isActive: false },
            });
            console.info(`✅ Utente ${userId} soft-deleted.`);
        } catch (err) {
            console.error(`❌ Impossibile aggiornare utente ${userId}:`, err);
        }
    }

    // B) Risoluzione righe defunti orfane:
    // Order 1: "aa" (test order cmsxagapg0002l604pn3kip1m) -> Soft delete ordine test
    try {
        await prisma.order.update({
            where: { id: 'cmsxagapg0002l604pn3kip1m' },
            data: { deletedAt: new Date(), status: 'CANCELLED' },
        });
        console.info('✅ Ordine test "aa" (cmsxagapg0002l604pn3kip1m) annullato e archiviato.');
    } catch {}

    // Order 2: "ERMELINDA MMMI'" (cmsx9hwv00001k104uoepnd89) -> Collega al profilo reale "Ermelinda Mammì" (cmqh752vq000ajp043uzsmp0r)
    try {
        await prisma.order.update({
            where: { id: 'cmsx9hwv00001k104uoepnd89' },
            data: { deceasedProfileId: 'cmqh752vq000ajp043uzsmp0r' },
        });
        console.info('✅ Ordine "ERMELINDA MMMI\'" collegato al profilo principale Ermelinda Mammì.');
    } catch {}

    // Order 3: "ALDA E LUGI RAMPOLDI" (cmpi3vzfm0001k604jn1zpcz1) -> Crea/collega DeceasedProfile dedicato
    try {
        let rampoldiProfile = await prisma.deceasedProfile.findFirst({
            where: { fullName: { contains: 'RAMPOLDI', mode: 'insensitive' } },
        });
        if (!rampoldiProfile) {
            rampoldiProfile = await prisma.deceasedProfile.create({
                data: {
                    fullName: 'Alda e Luigi Rampoldi',
                    cemeteryCity: 'Dongo',
                    cemeteryName: 'Cimitero di Dongo',
                },
            });
        }
        await prisma.order.update({
            where: { id: 'cmpi3vzfm0001k604jn1zpcz1' },
            data: { deceasedProfileId: rampoldiProfile.id },
        });
        console.info('✅ Ordine "ALDA E LUGI RAMPOLDI" collegato al profilo DeceasedProfile dedicato.');
    } catch (err) {
        console.error('Errore collegamento Rampoldi:', err);
    }

    // C) Verifica Finale
    const finalRows = await listDeceasedLeaderRows();
    const remainingOrphans = finalRows.filter((r) => r.isOrphan);
    console.info(`\n🔍 VERIFICA FINALE DEFUNTI ORFANI: ${remainingOrphans.length} orfani rimanenti.`);

    process.exit(0);
}

runCleanup().catch((err) => {
    console.error('Errore fatale nello script di pulizia:', err);
    process.exit(1);
});

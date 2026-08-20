/**
 * Script di deduplicazione immediata per i profili defunto e ordini duplicati.
 * Esegue la scansione dei profili omonimi (inclusi "Santo Sancono", "Tusa Salvatore", etc.)
 * e li fonde nel profilo Master senza perdita di dati.
 *
 * Esecuzione:
 *   npx tsx scripts/merge-duplicate-deceased.ts
 */
import prisma from '../lib/prisma';
import { mergeDeceasedProfiles, areNamesEquivalent } from '../lib/deceased/mergeDeceasedProfiles';

async function main() {
    console.log('🚀 Avvio scansione e unione profili defunto duplicati...');

    const allProfiles = await prisma.deceasedProfile.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
    });

    console.log(`🔍 Trovati ${allProfiles.length} profili defunto attivi.`);

    const processedIds = new Set<string>();
    let totalMergedClusters = 0;

    for (let i = 0; i < allProfiles.length; i++) {
        const master = allProfiles[i];
        if (processedIds.has(master.id)) continue;

        const duplicates: string[] = [];

        for (let j = i + 1; j < allProfiles.length; j++) {
            const candidate = allProfiles[j];
            if (processedIds.has(candidate.id)) continue;

            if (areNamesEquivalent(master.fullName, candidate.fullName)) {
                duplicates.push(candidate.id);
                processedIds.add(candidate.id);
            }
        }

        if (duplicates.length > 0) {
            processedIds.add(master.id);
            console.log(`\n📌 Trovato cluster per "${master.fullName}" (ID Master: ${master.id})`);
            console.log(`   Duplicati da unire (${duplicates.length}): ${duplicates.join(', ')}`);

            const result = await mergeDeceasedProfiles(master.id, duplicates);

            if (result.ok) {
                totalMergedClusters++;
                console.log(`   ✅ Merge completato per "${result.masterFullName}"!`);
                console.log(`      - Ordini riassegnati: ${result.reassignedOrdersCount}`);
                console.log(`      - Ordini duplicati accorpati: ${result.mergedOrdersCount}`);
            } else {
                console.error(`   ❌ Errore durante il merge per "${master.fullName}": ${result.error}`);
            }
        }
    }

    console.log(`\n🎉 Operazione completata! Totale cluster omonimi uniti: ${totalMergedClusters}`);
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error('💥 Errore fatale nello script di merge:', err);
    prisma.$disconnect();
    process.exit(1);
});

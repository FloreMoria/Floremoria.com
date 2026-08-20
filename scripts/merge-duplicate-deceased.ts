/**
 * Script di pulizia, collegamento ordini pendenti e unione automatica dei profili defunto duplicati.
 *
 * Esecuzione:
 * npx tsx scripts/merge-duplicate-deceased.ts
 */
import prisma from '../lib/prisma';
import { mergeDeceasedProfiles, areNamesEquivalent } from '../lib/deceased/mergeDeceasedProfiles';

async function runMergeDuplicatesScript() {
    console.info('=== INIZIO SCANSIONE, COLLEGAMENTO ORDINI E MERGE DEFUNTI DUPLICATI ===');

    // 1. Collega ordini con deceasedProfileId == null ai relativi DeceasedProfile se il nome corrisponde
    const unlinkedOrders = await prisma.order.findMany({
        where: {
            deceasedProfileId: null,
            deletedAt: null,
        },
    });

    console.info(`Trovati ${unlinkedOrders.length} ordini non collegati a un profilo defunto.`);

    const allProfiles = await prisma.deceasedProfile.findMany({
        where: { deletedAt: null },
    });

    let autoLinkedCount = 0;
    for (const ord of unlinkedOrders) {
        if (!ord.deceasedName) continue;
        const match = allProfiles.find((p) => areNamesEquivalent(p.fullName, ord.deceasedName));

        if (match) {
            await prisma.order.update({
                where: { id: ord.id },
                data: { deceasedProfileId: match.id },
            });
            autoLinkedCount++;
            console.info(
                `🔗 Collegato ordine #${ord.orderNumber || ord.id} ("${ord.deceasedName}") al profilo defunto "${match.fullName}" (${match.id}).`
            );
        }
    }

    console.info(`Collegati ${autoLinkedCount} ordini storici a profili defunti esistenti.`);

    // 2. Raggruppa i profili defunti per nome omologo
    const freshProfiles = await prisma.deceasedProfile.findMany({
        where: { deletedAt: null },
        include: {
            orders: { select: { id: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const clusters: typeof freshProfiles[] = [];

    for (const prof of freshProfiles) {
        let foundCluster = false;
        for (const cluster of clusters) {
            if (areNamesEquivalent(cluster[0].fullName, prof.fullName)) {
                cluster.push(prof);
                foundCluster = true;
                break;
            }
        }
        if (!foundCluster) {
            clusters.push([prof]);
        }
    }

    let totalMergedGroups = 0;

    for (const group of clusters) {
        if (group.length > 1) {
            console.info(`\n[Trovati Duplicati per "${group[0].fullName}"] (${group.length} profili):`);
            group.forEach((p) => {
                console.info(
                    `  - ID: ${p.id} | Nome: "${p.fullName}" | Città: "${p.cemeteryCity}" | Ordini: ${p.orders.length} | Foto: ${p.deliveryPhotoUrls.length}`
                );
            });

            const sortedGroup = [...group].sort((a, b) => {
                const scoreA = (a.orders?.length || 0) * 10 + (a.deliveryPhotoUrls?.length || 0);
                const scoreB = (b.orders?.length || 0) * 10 + (b.deliveryPhotoUrls?.length || 0);
                if (scoreB !== scoreA) return scoreB - scoreA;
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            });

            const master = sortedGroup[0];
            const duplicateIds = sortedGroup.slice(1).map((p) => p.id);

            try {
                const res = await mergeDeceasedProfiles(master.id, duplicateIds);
                console.info(`✅ Merge completato per "${master.fullName}":`, res);
                totalMergedGroups++;
            } catch (err) {
                console.error(`❌ Errore durante il merge del gruppo "${master.fullName}":`, err);
            }
        }
    }

    console.info(`\n=== SCANSIONE COMPLETATA: ${totalMergedGroups} gruppi di duplicati uniti ===`);
    process.exit(0);
}

runMergeDuplicatesScript().catch((err) => {
    console.error('Errore fatale nello script di merge:', err);
    process.exit(1);
});

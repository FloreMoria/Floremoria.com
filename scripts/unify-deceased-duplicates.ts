/**
 * Utility una tantum: unifica profili defunto duplicati (nome + comune cimitero).
 *
 * Default: unifica i casi noti SALVATORE TUSA ed Ermelinda MAMMI'.
 * Con --all: unifica tutti i gruppi duplicati rilevati nel database.
 *
 * Uso:
 *   npx tsx scripts/unify-deceased-duplicates.ts
 *   npx tsx scripts/unify-deceased-duplicates.ts --all
 */
import { loadEnvFiles, printDatabaseReachabilityHelp } from '../lib/loadEnvFiles';

loadEnvFiles();

import {
    filterDuplicateGroupsByDeceasedName,
    findDuplicateDeceasedProfileGroups,
    unifyDeceasedDuplicateGroup,
} from '../lib/deceased/unifyDuplicateProfiles';

const TARGET_DECEASED_NAMES = ['SALVATORE TUSA', "Ermelinda MAMMI'", 'Ermelinda MAMMI'];

async function main() {
    const unifyAll = process.argv.includes('--all');

    const allGroups = await findDuplicateDeceasedProfileGroups();
    const groups = unifyAll
        ? allGroups
        : filterDuplicateGroupsByDeceasedName(allGroups, TARGET_DECEASED_NAMES);

    if (groups.length === 0) {
        console.log('→ Nessun gruppo duplicato da unificare.');
        return;
    }

    console.log(`→ Gruppi duplicati da unificare: ${groups.length}`);

    for (const group of groups) {
        const label = group.profiles[0]?.fullName ?? group.identityKey;
        console.log(
            `\n• ${label} (${group.profiles.length} profili) — chiave: ${group.identityKey}`
        );
        for (const profile of group.profiles) {
            console.log(
                `   - ${profile.id} | ordini=${profile.orderCount} | creato=${profile.createdAt.toISOString()}`
            );
        }

        const result = await unifyDeceasedDuplicateGroup(group);
        console.log(
            `   ✓ Canonico: ${result.canonicalId} | duplicati rimossi: ${result.mergedDuplicateIds.length} | ordini spostati: ${result.movedOrders}`
        );
    }

    console.log('\n→ Unificazione completata.');
}

main()
    .catch((error) => {
        console.error('Unificazione fallita:', error);
        printDatabaseReachabilityHelp();
        process.exit(1);
    })
    .finally(async () => {
        const { default: prisma } = await import('../lib/prisma');
        await prisma.$disconnect();
    });

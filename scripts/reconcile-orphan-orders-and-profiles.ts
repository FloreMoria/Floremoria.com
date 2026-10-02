/**
 * Script di bonifica atomica: collegamento ordini orfani storici ai profili DeceasedProfile
 * e rimozione definitiva delle righe orfane virtuali dalla Dashboard FloreMoria.
 *
 * Esecuzione:
 * npx tsx scripts/reconcile-orphan-orders-and-profiles.ts
 */
import prisma from '../lib/prisma';
import { canProfilesBeMerged, areNamesEquivalent } from '../lib/deceased/mergeDeceasedProfiles';
import { formatDeceasedIdentityField } from '../lib/deceased/deceasedProfileIdentity';
import { visibleDashboardOrdersWhere } from '../lib/dashboardOrdersFilter';
import { listDeceasedLeaderRows } from '../lib/deceased/listDeceasedLeaderRows';

async function main() {
    console.info('=== 1. PRE-VERIFICA TABELLA LEADER DEFUNTI ===');
    const initialRows = await listDeceasedLeaderRows();
    const initialRegistered = initialRows.filter((r) => !r.isOrphan);
    const initialOrphans = initialRows.filter((r) => r.isOrphan);
    console.info(`Righe iniziali totali: ${initialRows.length}`);
    console.info(`Righe registrate: ${initialRegistered.length}`);
    console.info(`Righe orfane: ${initialOrphans.length}`);

    const tusaMasterId = 'cmqh74x450005jp04qoffjwam'; // Salvatore Tusa
    const mammiMasterId = 'cmqh752vq000ajp043uzsmp0r'; // Ermelinda Mammì

    console.info('\n=== 2. ESECUZIONE BONIFICA IN TRANSAZIONE ATOMICA PRISMA ===');

    const result = await prisma.$transaction(
        async (tx) => {
            const activeProfiles = await tx.deceasedProfile.findMany({
                where: { deletedAt: null },
            });

            const orphanOrders = await tx.order.findMany({
                where: {
                    deceasedProfileId: null,
                    ...visibleDashboardOrdersWhere(),
                },
                orderBy: { createdAt: 'asc' },
            });

            console.info(`Ordini orfani validi identificati nel DB: ${orphanOrders.length}`);
            const logs: string[] = [];

            for (const order of orphanOrders) {
                let targetProfileId: string | null = null;
                let actionType = '';

                // A. Caso Particolare: Ermelinda Mammi' / Salvatore Tusa
                if (
                    order.id === 'cmtvn3hrv00266dtph8yygy34' ||
                    areNamesEquivalent(order.deceasedName, "Ermelinda Mammi' / Salvatore Tusa")
                ) {
                    targetProfileId = tusaMasterId;
                    actionType = `ASSEGNATO A PROFILO MASTER SALVATORE TUSA (${tusaMasterId})`;
                } else {
                    // B. Cerca match tra i profili registrati attivi
                    const match = activeProfiles.find((p) =>
                        canProfilesBeMerged(
                            p,
                            {
                                fullName: order.deceasedName,
                                birthDate: order.deceasedBirthDate,
                                deathDate: order.deceasedDeathDate,
                                cemeteryCity: order.cemeteryCity,
                            },
                            { checkCity: false }
                        ).canMerge
                    );

                    if (match) {
                        targetProfileId = match.id;
                        actionType = `COLLEGATO AD ANAGRAFICA ESISTENTE ("${match.fullName}" - ${match.id})`;
                    } else {
                        // C. Crea nuovo profilo DeceasedProfile canonico
                        const newProfile = await tx.deceasedProfile.create({
                            data: {
                                fullName: formatDeceasedIdentityField(order.deceasedName),
                                cemeteryCity: formatDeceasedIdentityField(order.cemeteryCity || 'Italia'),
                                cemeteryName: order.cemeteryName ? formatDeceasedIdentityField(order.cemeteryName) : null,
                                birthDate: order.deceasedBirthDate || null,
                                deathDate: order.deceasedDeathDate || null,
                            },
                        });
                        targetProfileId = newProfile.id;
                        activeProfiles.push(newProfile);
                        actionType = `CREATO NUOVO DECEASED PROFILE ("${newProfile.fullName}" - ${newProfile.id})`;
                    }
                }

                // Aggiorna l'ordine
                await tx.order.update({
                    where: { id: order.id },
                    data: { deceasedProfileId: targetProfileId },
                });

                // User Link se l'ordine ha un utente associato
                if (order.userId && targetProfileId) {
                    const existingLink = await tx.userDeceasedLink.findUnique({
                        where: {
                            userId_deceasedProfileId: {
                                userId: order.userId,
                                deceasedProfileId: targetProfileId,
                            },
                        },
                    });
                    if (!existingLink) {
                        await tx.userDeceasedLink.create({
                            data: {
                                userId: order.userId,
                                deceasedProfileId: targetProfileId,
                                relationship: 'Acquirente ordine storico',
                            },
                        });
                    }
                }

                // Partner Link se l'ordine ha un fiorista associato
                if (order.partnerId && targetProfileId) {
                    const existingPartnerLink = await tx.partnerDeceasedAssignment.findUnique({
                        where: {
                            partnerId_deceasedProfileId: {
                                partnerId: order.partnerId,
                                deceasedProfileId: targetProfileId,
                            },
                        },
                    });
                    if (!existingPartnerLink) {
                        await tx.partnerDeceasedAssignment.create({
                            data: {
                                partnerId: order.partnerId,
                                deceasedProfileId: targetProfileId,
                                isPrimary: true,
                            },
                        });
                    }
                }

                // Audit Log
                await tx.adminFieldChangeLog.create({
                    data: {
                        actorUserId: 'system-migration',
                        actorRole: 'SUPER_ADMIN',
                        entityType: 'Order',
                        entityId: order.id,
                        field: 'deceasedProfileId',
                        beforeJson: null,
                        afterJson: JSON.stringify({ deceasedProfileId: targetProfileId }),
                    },
                });

                logs.push(`Ordine #${order.orderNumber || order.id} ("${order.deceasedName}") -> ${actionType}`);
            }

            return { logs, count: orphanOrders.length };
        },
        { timeout: 30000 }
    );

    console.info('\n=== 3. REPORT OPERAZIONI ESEGUITE IN TRANSAZIONE ===');
    result.logs.forEach((log, index) => {
        console.info(`  ${index + 1}. ${log}`);
    });

    console.info('\n=== 4. POST-VERIFICA FINALE TABELLA LEADER DEFUNTI ===');
    const finalRows = await listDeceasedLeaderRows();
    const finalRegistered = finalRows.filter((r) => !r.isOrphan);
    const finalOrphans = finalRows.filter((r) => r.isOrphan);

    console.info(`Righe totali finali: ${finalRows.length}`);
    console.info(`Righe registrate attive: ${finalRegistered.length}`);
    console.info(`Righe orfane rimanenti: ${finalOrphans.length}`);

    if (finalOrphans.length === 0) {
        console.info('\n🎉 SUCCESSO: Tutte le righe orfane sono state bonificate e convertite in anagrafiche registrate pulite!');
    } else {
        console.warn(`\n⚠️ ATTENZIONE: Rimangono ${finalOrphans.length} righe orfane.`);
    }
}

main()
    .catch((err) => {
        console.error('Errore durante la bonifica ordini orfani:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

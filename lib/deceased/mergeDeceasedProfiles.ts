/**
 * Core Service per l'unione (deduplicazione e merge) dei profili defunto
 * e dei relativi ordini nella Dashboard FloreMoria.
 *
 * REGOLE TASSATIVE:
 * 1. Identificazione duplicati & Omonimie:
 *    - Stesso Nome e Cognome (case-insensitive, trimming, ordine token ignorato).
 *    - Date DIVERSE valorizzate su entrambi i record -> Omonimi distinti (NON unire).
 *    - Date UGUALI valorizzate -> Duplicati certi da unire.
 *    - Date NULLE/VUOTE su uno o entrambi -> Bypass controllo date ed ereditarietà della data presente.
 * 2. Transazione Atomica Prisma ($transaction):
 *    - Tutte le modifiche avvengono all'interno di una singola transazione atomica.
 * 3. Gestione Ordini & Asset:
 *    - Tutti gli ordini attivi dei duplicati vengono riassegnati al profilo Master (order.deceasedProfileId = master.id).
 *    - Ordini gemelli (stesso orderNumber o medesima transazione) vengono fusi trasferendo le foto di posa.
 * 4. Deduplicazione Tabelle Pivot:
 *    - UserDeceasedLink [userId, deceasedProfileId] e PartnerDeceasedAssignment [partnerId, deceasedProfileId]
 *      vengono deduplicate in sicurezza prima del riassegnamento.
 * 5. Soft-Delete Coerente:
 *    - I profili e gli ordini secondari accorpati vengono archiviati con deletedAt = new Date() e mergedIntoId = masterId.
 */
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { uniqueAppendPhotoUrls } from '@/lib/deliveryProof/uniqueAppendPhotoUrls';

export type MergeDeceasedResult = {
    ok: boolean;
    masterProfileId: string;
    masterFullName: string;
    mergedProfileIds: string[];
    mergedOrdersCount: number;
    reassignedOrdersCount: number;
    error?: string;
    warning?: string;
};

/**
 * Normalizza stringhe per confronti tolleranti (rimuove accenti e caratteri speciali).
 */
export function normalizeName(str?: string | null): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calcola l'equivalenza dei nomi ignorando l'ordine (es. "Santo Sancono" == "Sancono Santo").
 */
export function areNamesEquivalent(nameA?: string | null, nameB?: string | null): boolean {
    const normA = normalizeName(nameA);
    const normB = normalizeName(nameB);
    if (!normA || !normB) return false;
    if (normA === normB) return true;

    const tokensA = normA.split(' ').sort().join(' ');
    const tokensB = normB.split(' ').sort().join(' ');
    return tokensA === tokensB;
}

/**
 * Estrae la data in formato stringa 'YYYY-MM-DD' per confronti indipendenti dall'orario/fuso.
 */
export function normalizeDateString(d?: Date | string | null): string | null {
    if (!d) return null;
    if (d instanceof Date) {
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
    }
    const str = String(d).trim();
    if (!str || str === 'null' || str === 'undefined') return null;
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
}

/**
 * Normalizza il nome del comune/cimitero rimuovendo sigle di provincia es. "(RC)", "(PA)".
 */
export function normalizeCity(city?: string | null): string {
    if (!city) return '';
    const norm = normalizeName(city.replace(/\([a-zA-Z]{2}\)/g, ''));
    if (['non specificato', 'non specificata', 'italia', 'nd', 'n d', 'sconosciuto', 'comune'].includes(norm)) {
        return '';
    }
    return norm;
}

/**
 * Verifica se due comuni sono compatibili (almeno uno non specificato oppure identici/contenuti).
 */
export function areCitiesCompatible(cityA?: string | null, cityB?: string | null): boolean {
    const normA = normalizeCity(cityA);
    const normB = normalizeCity(cityB);
    if (!normA || !normB) return true;
    return normA === normB || normA.includes(normB) || normB.includes(normA);
}

/**
 * Verifica se due date sono in conflitto (entrambe valorizzate e DIVERSE).
 * Ritorna true se c'è CONFLITTO (quindi sono omonimi distinti).
 */
export function areDatesConflicting(
    dateA?: Date | string | null,
    dateB?: Date | string | null
): boolean {
    const strA = normalizeDateString(dateA);
    const strB = normalizeDateString(dateB);
    if (!strA || !strB) return false; // Almeno una non è valorizzata -> nessun conflitto
    return strA !== strB;
}

/**
 * Verifica se due profili defunto sono candidati all'unione secondo le regole di omonimia.
 */
export function canProfilesBeMerged(
    profileA: {
        fullName?: string | null;
        birthDate?: Date | string | null;
        deathDate?: Date | string | null;
        cemeteryCity?: string | null;
    },
    profileB: {
        fullName?: string | null;
        birthDate?: Date | string | null;
        deathDate?: Date | string | null;
        cemeteryCity?: string | null;
    },
    options: { checkCity?: boolean } = {}
): { canMerge: boolean; reason?: string } {
    if (!areNamesEquivalent(profileA.fullName, profileB.fullName)) {
        return { canMerge: false, reason: 'I nomi anagrafici non corrispondono.' };
    }

    // Regola Omonimie Nascita
    if (areDatesConflicting(profileA.birthDate, profileB.birthDate)) {
        return {
            canMerge: false,
            reason: `Date di nascita discordanti (${normalizeDateString(profileA.birthDate)} vs ${normalizeDateString(profileB.birthDate)}): trattasi di omonimi distinti.`,
        };
    }

    // Regola Omonimie Morte
    if (areDatesConflicting(profileA.deathDate, profileB.deathDate)) {
        return {
            canMerge: false,
            reason: `Date di morte discordanti (${normalizeDateString(profileA.deathDate)} vs ${normalizeDateString(profileB.deathDate)}): trattasi di omonimi distinti.`,
        };
    }

    // Controllo opzionale di sicurezza Comune
    if (options.checkCity && !areCitiesCompatible(profileA.cemeteryCity, profileB.cemeteryCity)) {
        return {
            canMerge: false,
            reason: `Comuni discordanti (${profileA.cemeteryCity} vs ${profileB.cemeteryCity}).`,
        };
    }

    return { canMerge: true };
}

/**
 * Punteggio di completezza per selezionare il profilo Master nel cluster duplicati.
 */
export function calculateMasterProfileScore(profile: any): number {
    let score = 0;
    const ordersCount = Array.isArray(profile.orders) ? profile.orders.length : 0;
    score += ordersCount * 20;

    const photosCount = Array.isArray(profile.deliveryPhotoUrls) ? profile.deliveryPhotoUrls.length : 0;
    score += photosCount * 10;

    if (profile.birthDate) score += 5;
    if (profile.deathDate) score += 5;
    if (profile.cemeteryName) score += 5;
    if (profile.verifiedNotes) score += 5;
    if (profile.photoUrl) score += 5;
    if (profile.coverUrl) score += 3;
    if (profile.phone) score += 2;
    if (profile.cemeteryCity && normalizeCity(profile.cemeteryCity)) score += 3;

    return score;
}

/**
 * Punteggio dell'ordine per selezionare l'ordine Master in caso di duplicati gemelli.
 */
function calculateOrderCompletenessScore(order: any): number {
    let score = 0;
    if (order.status === 'COMPLETED') score += 50;
    else if (order.status === 'IN_PROGRESS' || order.status === 'DELIVERING') score += 30;
    else if (order.status === 'ACCEPTED') score += 20;

    const photosCount = (order.photos || []).length;
    const proofAfterCount = (order.deliveryProof?.photosAfterUrls || []).length;
    score += (photosCount + proofAfterCount) * 10;

    if (order.deliveryProof?.photoAfterUrl) score += 15;
    if (order.additionalInstructions) score += 5;
    if (order.ticketMessage) score += 5;

    return score;
}

/**
 * Esegue l'unione transazionale atomica di uno o più profili duplicati verso un profilo Master.
 */
export async function mergeDeceasedProfiles(
    masterId: string,
    rawDuplicateIds: string[],
    options: { bypassDateSafetyCheck?: boolean } = {}
): Promise<MergeDeceasedResult> {
    const masterProfileId = masterId?.trim();
    const duplicateIds = Array.from(
        new Set((rawDuplicateIds || []).map((id) => id?.trim()).filter(Boolean))
    ).filter((id) => id !== masterProfileId);

    if (!masterProfileId) {
        return {
            ok: false,
            masterProfileId: '',
            masterFullName: '',
            mergedProfileIds: [],
            mergedOrdersCount: 0,
            reassignedOrdersCount: 0,
            error: 'ID profilo Master non specificato.',
        };
    }

    if (duplicateIds.length === 0) {
        return {
            ok: false,
            masterProfileId,
            masterFullName: '',
            mergedProfileIds: [],
            mergedOrdersCount: 0,
            reassignedOrdersCount: 0,
            error: 'Nessun ID profilo duplicato valido specificato per l\'unione.',
        };
    }

    try {
        // 1. Carica master e duplicati per validazione e preparazione dati
        const masterProfile = await prisma.deceasedProfile.findUnique({
            where: { id: masterProfileId },
        });

        if (!masterProfile) {
            return {
                ok: false,
                masterProfileId,
                masterFullName: '',
                mergedProfileIds: [],
                mergedOrdersCount: 0,
                reassignedOrdersCount: 0,
                error: `Profilo Master con ID "${masterProfileId}" non trovato nel database.`,
            };
        }

        const duplicateProfiles = await prisma.deceasedProfile.findMany({
            where: { id: { in: duplicateIds } },
        });

        if (duplicateProfiles.length === 0) {
            return {
                ok: false,
                masterProfileId,
                masterFullName: masterProfile.fullName,
                mergedProfileIds: [],
                mergedOrdersCount: 0,
                reassignedOrdersCount: 0,
                error: 'Nessuno dei profili duplicati specificati è stato trovato nel database.',
            };
        }

        // 2. Controllo Omonimie e Date di sicurezza
        const validDuplicatesToMerge: typeof duplicateProfiles = [];
        const skippedReasons: string[] = [];

        for (const dup of duplicateProfiles) {
            if (options.bypassDateSafetyCheck) {
                validDuplicatesToMerge.push(dup);
                continue;
            }

            const check = canProfilesBeMerged(masterProfile, dup, { checkCity: false });
            if (!check.canMerge) {
                skippedReasons.push(`Profilo "${dup.fullName}" (${dup.id}): ${check.reason}`);
            } else {
                validDuplicatesToMerge.push(dup);
            }
        }

        if (validDuplicatesToMerge.length === 0) {
            return {
                ok: false,
                masterProfileId,
                masterFullName: masterProfile.fullName,
                mergedProfileIds: [],
                mergedOrdersCount: 0,
                reassignedOrdersCount: 0,
                error: `Impossibile completare l'unione: tutti i profili selezionati presentano conflitti di omonimia o date discordanti. (${skippedReasons.join('; ')})`,
            };
        }

        const validDuplicateIds = validDuplicatesToMerge.map((p) => p.id);

        // 3. Calcolo dell'arricchimento dati anagrafici per il Master
        let updatedCemeteryName = masterProfile.cemeteryName;
        let updatedCemeteryCity = masterProfile.cemeteryCity;
        let updatedVerifiedNotes = masterProfile.verifiedNotes;
        let updatedBirthDate = masterProfile.birthDate;
        let updatedDeathDate = masterProfile.deathDate;
        let updatedPhone = masterProfile.phone;
        let updatedPhotoUrl = masterProfile.photoUrl;
        let updatedCoverUrl = masterProfile.coverUrl;

        let mergedPhotos = [...(masterProfile.deliveryPhotoUrls || [])];
        let mergedPlannedDates = [...(masterProfile.plannedDeliveryDates || [])];

        for (const dup of validDuplicatesToMerge) {
            if (!updatedCemeteryName && dup.cemeteryName) updatedCemeteryName = dup.cemeteryName;
            if ((!updatedCemeteryCity || !normalizeCity(updatedCemeteryCity)) && dup.cemeteryCity && normalizeCity(dup.cemeteryCity)) {
                updatedCemeteryCity = dup.cemeteryCity;
            }
            if (!updatedVerifiedNotes && dup.verifiedNotes) {
                updatedVerifiedNotes = dup.verifiedNotes;
            } else if (updatedVerifiedNotes && dup.verifiedNotes && updatedVerifiedNotes !== dup.verifiedNotes && !updatedVerifiedNotes.includes(dup.verifiedNotes)) {
                updatedVerifiedNotes = `${updatedVerifiedNotes}\n${dup.verifiedNotes}`;
            }
            if (!updatedBirthDate && dup.birthDate) updatedBirthDate = dup.birthDate;
            if (!updatedDeathDate && dup.deathDate) updatedDeathDate = dup.deathDate;
            if (!updatedPhone && dup.phone) updatedPhone = dup.phone;
            if (!updatedPhotoUrl && dup.photoUrl) updatedPhotoUrl = dup.photoUrl;
            if (!updatedCoverUrl && dup.coverUrl) updatedCoverUrl = dup.coverUrl;

            mergedPhotos = uniqueAppendPhotoUrls(mergedPhotos, dup.deliveryPhotoUrls || []);
            mergedPlannedDates = Array.from(new Set([...mergedPlannedDates, ...(dup.plannedDeliveryDates || [])]));
        }

        // 4. Esecuzione in Transazione Atomica Prisma ($transaction)
        const txResult = await prisma.$transaction(async (tx) => {
            // A. Recupero di tutti gli ordini associati (master + duplicati)
            const allAssociatedOrders = await tx.order.findMany({
                where: {
                    OR: [
                        { deceasedProfileId: masterProfileId },
                        { deceasedProfileId: { in: validDuplicateIds } },
                    ],
                    deletedAt: null,
                },
                include: {
                    deliveryProof: true,
                    items: true,
                },
            });

            // Raggruppa gli ordini per individuare ordini gemelli duplicati
            const orderGroups = new Map<string, any[]>();
            for (const ord of allAssociatedOrders) {
                let groupKey = ord.id;
                if (ord.orderNumber) {
                    groupKey = `code:${ord.orderNumber.trim()}`;
                } else {
                    const delDate = ord.deliveryDate ? new Date(ord.deliveryDate).toISOString().split('T')[0] : 'no-date';
                    const buyer = normalizeName(ord.buyerFullName || ord.customerPhone || '');
                    if (delDate !== 'no-date' && buyer) {
                        groupKey = `signature:${delDate}_${buyer}_${ord.totalPriceCents}`;
                    }
                }
                if (!orderGroups.has(groupKey)) {
                    orderGroups.set(groupKey, []);
                }
                orderGroups.get(groupKey)!.push(ord);
            }

            let mergedOrdersCount = 0;
            let reassignedOrdersCount = 0;

            for (const cluster of orderGroups.values()) {
                if (cluster.length === 1) {
                    const singleOrder = cluster[0];
                    if (singleOrder.deceasedProfileId !== masterProfileId) {
                        await tx.order.update({
                            where: { id: singleOrder.id },
                            data: { deceasedProfileId: masterProfileId },
                        });
                        reassignedOrdersCount++;
                    }
                } else {
                    // Ordini gemelli duplicati: seleziona il master order
                    cluster.sort((a, b) => calculateOrderCompletenessScore(b) - calculateOrderCompletenessScore(a));
                    const masterOrder = cluster[0];
                    const secondaryOrders = cluster.slice(1);

                    let masterOrderPhotos = [...(masterOrder.photos || [])];
                    let masterProofAfter = [...(masterOrder.deliveryProof?.photosAfterUrls || [])];

                    for (const sec of secondaryOrders) {
                        masterOrderPhotos = uniqueAppendPhotoUrls(masterOrderPhotos, sec.photos || []);
                        if (sec.deliveryProof?.photosAfterUrls?.length) {
                            masterProofAfter = uniqueAppendPhotoUrls(masterProofAfter, sec.deliveryProof.photosAfterUrls);
                        }

                        if (!masterOrder.deliveryProof && sec.deliveryProof) {
                            await tx.deliveryProof.upsert({
                                where: { orderId: masterOrder.id },
                                create: {
                                    orderId: masterOrder.id,
                                    partnerId: sec.deliveryProof.partnerId,
                                    photoAfterUrl: sec.deliveryProof.photoAfterUrl,
                                    photosAfterUrls: sec.deliveryProof.photosAfterUrls || [],
                                    status: sec.deliveryProof.status,
                                    timestampAfter: sec.deliveryProof.timestampAfter,
                                },
                                update: {},
                            });
                        }

                        await tx.order.update({
                            where: { id: sec.id },
                            data: {
                                deceasedProfileId: masterProfileId,
                                deletedAt: new Date(),
                                mergedIntoId: masterOrder.id,
                                additionalInstructions: [
                                    sec.additionalInstructions,
                                    `[MERGE ORDINE]: Accorpato nell'ordine master #${masterOrder.orderNumber || masterOrder.id}`,
                                ]
                                    .filter(Boolean)
                                    .join(' | '),
                            },
                        });
                        mergedOrdersCount++;
                    }

                    await tx.order.update({
                        where: { id: masterOrder.id },
                        data: {
                            deceasedProfileId: masterProfileId,
                            photos: masterOrderPhotos,
                        },
                    });

                    if (masterOrder.deliveryProof && masterProofAfter.length > 0) {
                        await tx.deliveryProof.update({
                            where: { id: masterOrder.deliveryProof.id },
                            data: {
                                photosAfterUrls: masterProofAfter,
                                photoAfterUrl: masterProofAfter[0] || masterOrder.deliveryProof.photoAfterUrl,
                            },
                        });
                    }
                    reassignedOrdersCount++;
                }
            }

            // B. Migrazione e Deduplicazione Pivot UserDeceasedLink [userId, deceasedProfileId]
            const userLinks = await tx.userDeceasedLink.findMany({
                where: { deceasedProfileId: { in: validDuplicateIds } },
            });

            for (const link of userLinks) {
                const existingMasterLink = await tx.userDeceasedLink.findUnique({
                    where: {
                        userId_deceasedProfileId: {
                            userId: link.userId,
                            deceasedProfileId: masterProfileId,
                        },
                    },
                });

                if (!existingMasterLink) {
                    await tx.userDeceasedLink.update({
                        where: { id: link.id },
                        data: { deceasedProfileId: masterProfileId },
                    });
                } else {
                    await tx.userDeceasedLink.delete({
                        where: { id: link.id },
                    });
                }
            }

            // C. Migrazione e Deduplicazione Pivot PartnerDeceasedAssignment [partnerId, deceasedProfileId]
            const partnerLinks = await tx.partnerDeceasedAssignment.findMany({
                where: { deceasedProfileId: { in: validDuplicateIds } },
            });

            for (const pLink of partnerLinks) {
                const existingPartnerLink = await tx.partnerDeceasedAssignment.findUnique({
                    where: {
                        partnerId_deceasedProfileId: {
                            partnerId: pLink.partnerId,
                            deceasedProfileId: masterProfileId,
                        },
                    },
                });

                if (!existingPartnerLink) {
                    await tx.partnerDeceasedAssignment.update({
                        where: { id: pLink.id },
                        data: { deceasedProfileId: masterProfileId },
                    });
                } else {
                    await tx.partnerDeceasedAssignment.delete({
                        where: { id: pLink.id },
                    });
                }
            }

            // D. Aggiornamento Profilo Master con i dati unificati ed arricchiti
            await tx.deceasedProfile.update({
                where: { id: masterProfileId },
                data: {
                    cemeteryName: updatedCemeteryName,
                    cemeteryCity: updatedCemeteryCity,
                    verifiedNotes: updatedVerifiedNotes,
                    birthDate: updatedBirthDate,
                    deathDate: updatedDeathDate,
                    phone: updatedPhone,
                    photoUrl: updatedPhotoUrl,
                    coverUrl: updatedCoverUrl || mergedPhotos.at(-1) || null,
                    deliveryPhotoUrls: mergedPhotos,
                    plannedDeliveryDates: mergedPlannedDates,
                },
            });

            // E. Soft-Delete con tracciamento storico per i profili duplicati
            for (const dupId of validDuplicateIds) {
                await tx.deceasedProfile.update({
                    where: { id: dupId },
                    data: {
                        deletedAt: new Date(),
                        mergedIntoId: masterProfileId,
                    },
                });
            }

            return {
                mergedOrdersCount,
                reassignedOrdersCount,
            };
        }, {
            timeout: 30000,
        });

        // 5. Revalidazione Cache Next.js
        try {
            revalidatePath('/dashboard/defunti');
            revalidatePath('/dashboard/orders');
            revalidatePath('/bacheca');
            revalidatePath(`/giardino/${masterProfileId}`);
        } catch {
            // Ignora se eseguito al di fuori di una richiesta HTTP Next.js
        }

        return {
            ok: true,
            masterProfileId,
            masterFullName: masterProfile.fullName,
            mergedProfileIds: validDuplicateIds,
            mergedOrdersCount: txResult.mergedOrdersCount,
            reassignedOrdersCount: txResult.reassignedOrdersCount,
            warning: skippedReasons.length > 0 ? skippedReasons.join(' | ') : undefined,
        };

    } catch (err) {
        console.error('[mergeDeceasedProfiles] Critical Error:', err);
        return {
            ok: false,
            masterProfileId,
            masterFullName: '',
            mergedProfileIds: [],
            mergedOrdersCount: 0,
            reassignedOrdersCount: 0,
            error: err instanceof Error ? err.message : 'Errore imprevisto durante l\'unione dei profili defunto.',
        };
    }
}

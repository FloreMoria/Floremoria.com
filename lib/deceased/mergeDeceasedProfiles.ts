/**
 * Core Service per l'unione (deduplicazione e merge) dei profili defunto
 * e dei relativi ordini nella Dashboard FloreMoria.
 *
 * REGOLE DI SICUREZZA:
 * 1. Nessun Hard Delete per Ordini o Profili: i duplicati accorpati vengono marcati
 *    con deletedAt = new Date() e mergedIntoId = masterId.
 * 2. Deduplicazione Ordini Intelligente: se due ordini costituiscono la stessa operazione,
 *    gli asset (foto posa, note) vengono trasferiti sull'ordine Master e il secondario viene archiviato.
 * 3. Se gli ordini sono acquisti distinti nel tempo per la stessa persona, vengono semplicemente
 *    riascoltati al profilo defunto Master unificato.
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
};

/**
 * Punteggio dell'ordine per selezionare l'ordine Master in caso di duplicato.
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
 * Normalizza stringhe per confronti tolleranti (rimuove accenti e punteggiatura).
 */
function normalizeName(str?: string | null): string {
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
 * Calcola l'uguaglianza dei nomi ignorando l'ordine (es. "Santo Sancono" == "Sancono Santo").
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

export async function mergeDeceasedProfiles(
    masterId: string,
    rawDuplicateIds: string[]
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
            error: 'Nessun ID profilo duplicato da unire.',
        };
    }

    try {
        // 1. Carica il profilo Master e tutti i profili duplicati
        const masterProfile = await prisma.deceasedProfile.findFirst({
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
                error: `Profilo Master con ID "${masterProfileId}" non trovato.`,
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

        const validDuplicateIds = duplicateProfiles.map((p) => p.id);

        // 2. Arricchimento Dati del Profilo Master
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

        for (const dup of duplicateProfiles) {
            if (!updatedCemeteryName && dup.cemeteryName) updatedCemeteryName = dup.cemeteryName;
            if ((!updatedCemeteryCity || updatedCemeteryCity === 'Non specificata') && dup.cemeteryCity) {
                updatedCemeteryCity = dup.cemeteryCity;
            }
            if (!updatedVerifiedNotes && dup.verifiedNotes) updatedVerifiedNotes = dup.verifiedNotes;
            if (!updatedBirthDate && dup.birthDate) updatedBirthDate = dup.birthDate;
            if (!updatedDeathDate && dup.deathDate) updatedDeathDate = dup.deathDate;
            if (!updatedPhone && dup.phone) updatedPhone = dup.phone;
            if (!updatedPhotoUrl && dup.photoUrl) updatedPhotoUrl = dup.photoUrl;
            if (!updatedCoverUrl && dup.coverUrl) updatedCoverUrl = dup.coverUrl;

            mergedPhotos = uniqueAppendPhotoUrls(mergedPhotos, dup.deliveryPhotoUrls || []);
            mergedPlannedDates = Array.from(new Set([...mergedPlannedDates, ...(dup.plannedDeliveryDates || [])]));
        }

        // 3. Recupera tutti gli ordini legati sia al master sia ai duplicati
        const allAssociatedOrders = await prisma.order.findMany({
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

        // Raggruppa gli ordini per rilevare eventuali ordini duplicati reali
        // a) Stesso codice ordine (orderNumber)
        // b) Stessa data di consegna + stesso acquirente + stesso totale
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
                // Ordine singolo distinto: riassegna semplicemente al masterProfileId
                const singleOrder = cluster[0];
                if (singleOrder.deceasedProfileId !== masterProfileId) {
                    await prisma.order.update({
                        where: { id: singleOrder.id },
                        data: { deceasedProfileId: masterProfileId },
                    });
                    reassignedOrdersCount++;
                }
            } else {
                // Ordini duplicati: seleziona il Master Order in base alla completezza
                cluster.sort((a, b) => calculateOrderCompletenessScore(b) - calculateOrderCompletenessScore(a));
                const masterOrder = cluster[0];
                const secondaryOrders = cluster.slice(1);

                let masterOrderPhotos = [...(masterOrder.photos || [])];
                let masterProofAfter = [...(masterOrder.deliveryProof?.photosAfterUrls || [])];

                for (const sec of secondaryOrders) {
                    // Trasferisci le foto sul Master Order
                    masterOrderPhotos = uniqueAppendPhotoUrls(masterOrderPhotos, sec.photos || []);
                    if (sec.deliveryProof?.photosAfterUrls?.length) {
                        masterProofAfter = uniqueAppendPhotoUrls(masterProofAfter, sec.deliveryProof.photosAfterUrls);
                    }

                    // Se il master order non ha un deliveryProof ma il secondario lo ha, ricrea o aggiorna
                    if (!masterOrder.deliveryProof && sec.deliveryProof) {
                        await prisma.deliveryProof.upsert({
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

                    // Archiviazione sicura dell'ordine secondario (Soft Delete + mergedIntoId)
                    await prisma.order.update({
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

                // Aggiorna l'ordine master con la combinazione completa di foto
                await prisma.order.update({
                    where: { id: masterOrder.id },
                    data: {
                        deceasedProfileId: masterProfileId,
                        photos: masterOrderPhotos,
                    },
                });

                if (masterOrder.deliveryProof && masterProofAfter.length > 0) {
                    await prisma.deliveryProof.update({
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

        // 4. Trasferimento relazioni Pivot (UserDeceasedLink & PartnerDeceasedAssignment)
        const userLinks = await prisma.userDeceasedLink.findMany({
            where: { deceasedProfileId: { in: validDuplicateIds } },
        });

        for (const link of userLinks) {
            const existingMasterLink = await prisma.userDeceasedLink.findUnique({
                where: {
                    userId_deceasedProfileId: {
                        userId: link.userId,
                        deceasedProfileId: masterProfileId,
                    },
                },
            });

            if (!existingMasterLink) {
                await prisma.userDeceasedLink.create({
                    data: {
                        userId: link.userId,
                        deceasedProfileId: masterProfileId,
                        relationship: link.relationship,
                    },
                });
            }

            await prisma.userDeceasedLink.delete({
                where: { id: link.id },
            });
        }

        const partnerLinks = await prisma.partnerDeceasedAssignment.findMany({
            where: { deceasedProfileId: { in: validDuplicateIds } },
        });

        for (const pLink of partnerLinks) {
            const existingPartnerLink = await prisma.partnerDeceasedAssignment.findFirst({
                where: {
                    partnerId: pLink.partnerId,
                    deceasedProfileId: masterProfileId,
                },
            });

            if (!existingPartnerLink) {
                await prisma.partnerDeceasedAssignment.create({
                    data: {
                        partnerId: pLink.partnerId,
                        deceasedProfileId: masterProfileId,
                        isPrimary: pLink.isPrimary,
                    },
                });
            }

            await prisma.partnerDeceasedAssignment.delete({
                where: { id: pLink.id },
            });
        }

        // 5. Aggiorna il profilo Master nel DB con i dati unificati
        await prisma.deceasedProfile.update({
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

        // 6. Archivia i profili duplicati accorpati (Soft Delete + mergedIntoId)
        for (const dupId of validDuplicateIds) {
            await prisma.deceasedProfile.update({
                where: { id: dupId },
                data: {
                    deletedAt: new Date(),
                    mergedIntoId: masterProfileId,
                },
            });
        }

        // 7. Revalida i percorsi UI della dashboard e della bacheca (in contesto Next.js server)
        try {
            revalidatePath('/dashboard/defunti');
            revalidatePath('/dashboard/orders');
            revalidatePath('/bacheca');
            revalidatePath(`/giardino/${masterProfileId}`);
        } catch {
            // Ignora se chiamato da uno script CLI al di fuori del contesto Next.js request
        }

        return {
            ok: true,
            masterProfileId,
            masterFullName: masterProfile.fullName,
            mergedProfileIds: validDuplicateIds,
            mergedOrdersCount,
            reassignedOrdersCount,
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
            error: err instanceof Error ? err.message : 'Errore durante l\'unione dei profili defunto.',
        };
    }
}

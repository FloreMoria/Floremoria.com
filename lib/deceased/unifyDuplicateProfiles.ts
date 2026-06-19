/**
 * Unificazione profili defunto duplicati: sposta ordini e link, elimina il profilo orfano.
 */
import prisma from '@/lib/prisma';
import {
    buildDeceasedIdentityKey,
    normalizeDeceasedIdentityField,
} from './deceasedProfileIdentity';

export interface DeceasedDuplicateGroup {
    identityKey: string;
    profiles: Array<{
        id: string;
        fullName: string;
        cemeteryCity: string;
        cemeteryName: string | null;
        createdAt: Date;
        orderCount: number;
    }>;
}

export interface MergeDeceasedProfilesResult {
    canonicalId: string;
    mergedDuplicateIds: string[];
    movedOrders: number;
    movedUserLinks: number;
    movedPartnerLinks: number;
}

async function pickCanonicalProfileId(
    profiles: DeceasedDuplicateGroup['profiles']
): Promise<string> {
    const sorted = [...profiles].sort((a, b) => {
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return sorted[0]!.id;
}

/** Raggruppa profili con stessa identità anagrafica normalizzata (nome + comune). */
export async function findDuplicateDeceasedProfileGroups(): Promise<DeceasedDuplicateGroup[]> {
    const profiles = await prisma.deceasedProfile.findMany({
        select: {
            id: true,
            fullName: true,
            cemeteryCity: true,
            cemeteryName: true,
            createdAt: true,
            _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const groups = new Map<string, DeceasedDuplicateGroup['profiles']>();

    for (const profile of profiles) {
        const identityKey = buildDeceasedIdentityKey(profile.fullName, profile.cemeteryCity);
        const bucket = groups.get(identityKey) ?? [];
        bucket.push({
            id: profile.id,
            fullName: profile.fullName,
            cemeteryCity: profile.cemeteryCity,
            cemeteryName: profile.cemeteryName,
            createdAt: profile.createdAt,
            orderCount: profile._count.orders,
        });
        groups.set(identityKey, bucket);
    }

    return Array.from(groups.entries())
        .filter(([, bucket]) => bucket.length > 1)
        .map(([identityKey, bucket]) => ({ identityKey, profiles: bucket }));
}

/** Unifica un profilo duplicato nel canonico (transazione atomica). */
export async function mergeDeceasedProfileIntoCanonical(
    duplicateId: string,
    canonicalId: string
): Promise<MergeDeceasedProfilesResult> {
    if (duplicateId === canonicalId) {
        return {
            canonicalId,
            mergedDuplicateIds: [],
            movedOrders: 0,
            movedUserLinks: 0,
            movedPartnerLinks: 0,
        };
    }

    return prisma.$transaction(async (tx) => {
        const movedOrders = await tx.order.updateMany({
            where: { deceasedProfileId: duplicateId },
            data: { deceasedProfileId: canonicalId },
        });

        const userLinks = await tx.userDeceasedLink.findMany({
            where: { deceasedProfileId: duplicateId },
        });
        for (const link of userLinks) {
            await tx.userDeceasedLink.upsert({
                where: {
                    userId_deceasedProfileId: {
                        userId: link.userId,
                        deceasedProfileId: canonicalId,
                    },
                },
                create: {
                    userId: link.userId,
                    deceasedProfileId: canonicalId,
                    relationship: link.relationship,
                },
                update: {},
            });
        }
        await tx.userDeceasedLink.deleteMany({ where: { deceasedProfileId: duplicateId } });

        const partnerLinks = await tx.partnerDeceasedAssignment.findMany({
            where: { deceasedProfileId: duplicateId },
        });
        for (const link of partnerLinks) {
            await tx.partnerDeceasedAssignment.upsert({
                where: {
                    partnerId_deceasedProfileId: {
                        partnerId: link.partnerId,
                        deceasedProfileId: canonicalId,
                    },
                },
                create: {
                    partnerId: link.partnerId,
                    deceasedProfileId: canonicalId,
                    isPrimary: link.isPrimary,
                },
                update: {
                    isPrimary: link.isPrimary ? true : undefined,
                },
            });
        }
        await tx.partnerDeceasedAssignment.deleteMany({
            where: { deceasedProfileId: duplicateId },
        });

        const [duplicate, canonical] = await Promise.all([
            tx.deceasedProfile.findUnique({ where: { id: duplicateId } }),
            tx.deceasedProfile.findUnique({ where: { id: canonicalId } }),
        ]);

        if (duplicate && canonical) {
            await tx.deceasedProfile.update({
                where: { id: canonicalId },
                data: {
                    ...(duplicate.verifiedNotes && !canonical.verifiedNotes
                        ? { verifiedNotes: duplicate.verifiedNotes }
                        : {}),
                    ...(duplicate.cemeteryName && !canonical.cemeteryName
                        ? { cemeteryName: duplicate.cemeteryName }
                        : {}),
                    ...(duplicate.uniqueCode && !canonical.uniqueCode
                        ? { uniqueCode: duplicate.uniqueCode }
                        : {}),
                },
            });
        }

        await tx.deceasedProfile.delete({ where: { id: duplicateId } });

        return {
            canonicalId,
            mergedDuplicateIds: [duplicateId],
            movedOrders: movedOrders.count,
            movedUserLinks: userLinks.length,
            movedPartnerLinks: partnerLinks.length,
        };
    });
}

/** Unifica tutti i duplicati in un gruppo identità. */
export async function unifyDeceasedDuplicateGroup(
    group: DeceasedDuplicateGroup
): Promise<MergeDeceasedProfilesResult> {
    const canonicalId = await pickCanonicalProfileId(group.profiles);
    const duplicateIds = group.profiles.map((p) => p.id).filter((id) => id !== canonicalId);

    const aggregate: MergeDeceasedProfilesResult = {
        canonicalId,
        mergedDuplicateIds: [],
        movedOrders: 0,
        movedUserLinks: 0,
        movedPartnerLinks: 0,
    };

    for (const duplicateId of duplicateIds) {
        const result = await mergeDeceasedProfileIntoCanonical(duplicateId, canonicalId);
        aggregate.mergedDuplicateIds.push(...result.mergedDuplicateIds);
        aggregate.movedOrders += result.movedOrders;
        aggregate.movedUserLinks += result.movedUserLinks;
        aggregate.movedPartnerLinks += result.movedPartnerLinks;
    }

    return aggregate;
}

/** Filtra gruppi duplicati per nome defunto normalizzato (es. pulizia mirata). */
export function filterDuplicateGroupsByDeceasedName(
    groups: DeceasedDuplicateGroup[],
    targetNames: string[]
): DeceasedDuplicateGroup[] {
    const targets = new Set(targetNames.map((name) => normalizeDeceasedIdentityField(name)));
    return groups.filter((group) => {
        const sampleName = group.profiles[0]?.fullName ?? '';
        return targets.has(normalizeDeceasedIdentityField(sampleName));
    });
}

/**
 * POST /api/dashboard/defunti/merge
 * Endpoint per lanciare l'unione sicura ed il recupero asset dei profili defunto duplicati.
 *
 * Supporta:
 * 1. autoScan: true -> Scansione automatica per unire tutti i profili omonimi duplicati e i relativi ordini.
 * 2. masterProfileId + duplicateProfileIds -> Merge mirato di uno o più profili selezionati da UI.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { mergeDeceasedProfiles, areNamesEquivalent } from '@/lib/deceased/mergeDeceasedProfiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json().catch(() => ({}));

        const isAutoScan = Boolean(body.autoScan);

        if (isAutoScan) {
            // 1. Collega ordini orfani a profili defunto se il nome corrisponde
            const unlinkedOrders = await prisma.order.findMany({
                where: { deceasedProfileId: null, deletedAt: null },
            });

            const allProfiles = await prisma.deceasedProfile.findMany({
                where: { deletedAt: null },
            });

            for (const ord of unlinkedOrders) {
                if (!ord.deceasedName) continue;
                const match = allProfiles.find((p) => areNamesEquivalent(p.fullName, ord.deceasedName));
                if (match) {
                    await prisma.order.update({
                        where: { id: ord.id },
                        data: { deceasedProfileId: match.id },
                    });
                }
            }

            // 2. Raggruppa i profili per nome omologo
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

            let clustersMergedCount = 0;
            let totalMergedProfiles = 0;

            for (const group of clusters) {
                if (group.length > 1) {
                    const sortedGroup = [...group].sort((a, b) => {
                        const scoreA = (a.orders?.length || 0) * 10 + (a.deliveryPhotoUrls?.length || 0);
                        const scoreB = (b.orders?.length || 0) * 10 + (b.deliveryPhotoUrls?.length || 0);
                        if (scoreB !== scoreA) return scoreB - scoreA;
                        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    });

                    const master = sortedGroup[0];
                    const duplicateIds = sortedGroup.slice(1).map((p) => p.id);

                    const res = await mergeDeceasedProfiles(master.id, duplicateIds);
                    if (res.ok) {
                        clustersMergedCount++;
                        totalMergedProfiles += res.mergedProfileIds.length;
                    }
                }
            }

            return NextResponse.json({
                ok: true,
                success: true,
                clustersMergedCount,
                totalMergedProfiles,
            });
        }

        // Merge mirato da UI
        const masterProfileId = (body.masterProfileId || body.masterId || '').trim();
        const rawDuplicates = body.duplicateProfileIds || body.duplicateIds || [];
        const duplicateProfileIds = Array.isArray(rawDuplicates) ? rawDuplicates : [];

        if (!masterProfileId) {
            return NextResponse.json(
                { ok: false, error: 'Parametro masterProfileId obbligatorio.' },
                { status: 400 }
            );
        }

        if (duplicateProfileIds.length === 0) {
            return NextResponse.json(
                { ok: false, error: 'Lista duplicateProfileIds vuota. Specifica almeno un profilo duplicato.' },
                { status: 400 }
            );
        }

        const result = await mergeDeceasedProfiles(masterProfileId, duplicateProfileIds);

        if (!result.ok) {
            return NextResponse.json(
                { ok: false, error: result.error || 'Errore durante l\'unione dei profili.' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            clustersMergedCount: 1,
            mergedProfileCount: result.mergedProfileIds.length,
            ...result,
        });

    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Errore imprevisto durante l\'unione dei profili.';
        console.error('[POST /api/dashboard/defunti/merge] Error:', err);
        return NextResponse.json(
            { ok: false, success: false, error: errorMsg },
            { status: 500 }
        );
    }
}

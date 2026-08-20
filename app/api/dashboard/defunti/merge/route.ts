/**
 * POST /api/dashboard/defunti/merge
 * Endpoint API per l'unione manuale o automatica dei profili defunto duplicati
 * e la deduplicazione degli ordini storici.
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
        const targetDeceasedId = typeof body.targetDeceasedId === 'string' ? body.targetDeceasedId.trim() : '';
        const duplicateDeceasedIds = Array.isArray(body.duplicateDeceasedIds)
            ? body.duplicateDeceasedIds.map((id: any) => String(id).trim()).filter(Boolean)
            : [];
        const autoScan = Boolean(body.autoScan);

        // 1. Modalità unione automatica omonimi duplicati (es. "Santo Sancono", "Tusa Salvatore")
        if (autoScan || (!targetDeceasedId && duplicateDeceasedIds.length === 0)) {
            const allProfiles = await prisma.deceasedProfile.findMany({
                where: { deletedAt: null },
                orderBy: { createdAt: 'asc' },
            });

            const mergedClusters: any[] = [];
            const processedIds = new Set<string>();

            for (let i = 0; i < allProfiles.length; i++) {
                const current = allProfiles[i];
                if (processedIds.has(current.id)) continue;

                const matchingDuplicates: string[] = [];

                for (let j = i + 1; j < allProfiles.length; j++) {
                    const candidate = allProfiles[j];
                    if (processedIds.has(candidate.id)) continue;

                    // Verifica se i nomi sono equivalenti (es. "Santo Sancono" == "Sancono Santo")
                    if (areNamesEquivalent(current.fullName, candidate.fullName)) {
                        matchingDuplicates.push(candidate.id);
                        processedIds.add(candidate.id);
                    }
                }

                if (matchingDuplicates.length > 0) {
                    processedIds.add(current.id);
                    const mergeResult = await mergeDeceasedProfiles(current.id, matchingDuplicates);
                    if (mergeResult.ok) {
                        mergedClusters.push(mergeResult);
                    }
                }
            }

            return NextResponse.json({
                ok: true,
                autoScan: true,
                clustersMergedCount: mergedClusters.length,
                results: mergedClusters,
            });
        }

        // 2. Modalità unione manuale esplicita (target + duplicati)
        if (!targetDeceasedId || duplicateDeceasedIds.length === 0) {
            return NextResponse.json(
                { ok: false, error: 'Occorre specificare targetDeceasedId e almeno un ID duplicato in duplicateDeceasedIds.' },
                { status: 400 }
            );
        }

        const result = await mergeDeceasedProfiles(targetDeceasedId, duplicateDeceasedIds);

        if (!result.ok) {
            return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
        }

        return NextResponse.json({
            ok: true,
            autoScan: false,
            result,
        });
    } catch (err) {
        console.error('[POST /api/dashboard/defunti/merge] Error:', err);
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : 'Errore server durante l\'unione dei defunti.' },
            { status: 500 }
        );
    }
}

/**
 * Persistenza snapshot audit AI su Neon (tabella ai_audit_snapshots).
 */

import prisma from '@/lib/prisma';
import type { AiAuditRunSummary } from '@/lib/seo/aiAuditRunner';
import { AI_AUDIT_STRICT_BASELINE_ID } from '@/lib/seo/aiVisibilityBenchmark';
import type { Prisma } from '@prisma/client';

export type StoredAiAuditSnapshot = AiAuditRunSummary & {
    id: string;
};

export async function saveAiAuditSnapshot(
    summary: AiAuditRunSummary
): Promise<StoredAiAuditSnapshot> {
    const row = await prisma.aiAuditSnapshot.create({
        data: {
            runAt: new Date(summary.runAt),
            provider: summary.provider,
            model: summary.model ?? null,
            overallScore: summary.overallScore,
            brandMentionRate: summary.brandMentionRate,
            guaranteeAccuracyRate: summary.guaranteeAccuracyRate,
            intentScores: summary.intentScores as Prisma.InputJsonValue,
            promptResults: summary.promptResults as Prisma.InputJsonValue,
        },
    });

    return {
        id: row.id,
        runAt: row.runAt.toISOString(),
        provider: summary.provider,
        model: summary.model,
        baselineId: summary.baselineId,
        overallScore: row.overallScore,
        brandMentionRate: row.brandMentionRate,
        guaranteeAccuracyRate: row.guaranteeAccuracyRate,
        intentScores: summary.intentScores,
        promptResults: summary.promptResults,
    };
}

export async function getLatestAiAuditSnapshot(): Promise<StoredAiAuditSnapshot | null> {
    const row = await prisma.aiAuditSnapshot.findFirst({
        orderBy: { runAt: 'desc' },
    });
    if (!row) return null;

    return {
        id: row.id,
        runAt: row.runAt.toISOString(),
        provider: row.provider as StoredAiAuditSnapshot['provider'],
        model: row.model ?? undefined,
        baselineId: AI_AUDIT_STRICT_BASELINE_ID,
        overallScore: row.overallScore,
        brandMentionRate: row.brandMentionRate,
        guaranteeAccuracyRate: row.guaranteeAccuracyRate,
        intentScores: row.intentScores as StoredAiAuditSnapshot['intentScores'],
        promptResults: row.promptResults as StoredAiAuditSnapshot['promptResults'],
    };
}

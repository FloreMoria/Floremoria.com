import type { Prisma } from '@prisma/client';

/** Casella assistenza — esclusa da overview, timeline e API log (POSTMAN). */
export const ASSISTENZA_EMAIL = 'assistenza@floremoria.com';

const ASSISTENZA_FIELDS = [
    'tag',
    'topic',
    'shortSummary',
    'keyPrompt',
    'fullText',
    'discussedPoints',
    'achievedResults',
    'pendingTasks',
    'criticalAlarms',
] as const;

function assistenzaContainsClauses(): Prisma.FloremoriaLogWhereInput[] {
    return [
        { tag: { contains: 'POSTMAN_ASSISTENZA', mode: 'insensitive' } },
        ...ASSISTENZA_FIELDS.map((field) => ({
            [field]: { contains: ASSISTENZA_EMAIL, mode: 'insensitive' as const },
        })),
    ];
}

/** Schede auto-generate vuote (legacy cron) — non devono comparire in dashboard. */
export const EXCLUDE_EMPTY_VERBALE_SCAFFOLD: Prisma.FloremoriaLogWhereInput = {
    AND: [
        { fullText: { contains: '(Da compilare)' } },
        {
            OR: [
                { fullText: { contains: 'verbale_giornaliero_auto' } },
                { shortSummary: { contains: 'Scaffold verbale', mode: 'insensitive' } },
                { shortSummary: { contains: 'da completare in Obsidian', mode: 'insensitive' } },
            ],
        },
    ],
};

/** Filtro unificato per query dashboard/API log. */
export function floremoriaLogPublicWhere(
    extra?: Prisma.FloremoriaLogWhereInput
): Prisma.FloremoriaLogWhereInput {
    const base: Prisma.FloremoriaLogWhereInput = {
        NOT: {
            OR: [...assistenzaContainsClauses(), EXCLUDE_EMPTY_VERBALE_SCAFFOLD],
        },
    };
    if (!extra) return base;
    return { AND: [base, extra] };
}

/** Blocca dettaglio log assistenza o scaffold vuoto. */
export function isLogHiddenFromDashboard(log: {
    tag?: string | null;
    topic?: string | null;
    shortSummary?: string | null;
    keyPrompt?: string | null;
    fullText?: string | null;
    discussedPoints?: string | null;
    achievedResults?: string | null;
    pendingTasks?: string | null;
    criticalAlarms?: string | null;
}): boolean {
    const blob = ASSISTENZA_FIELDS.map((f) => log[f] ?? '').join('\n');
    if (blob.includes('POSTMAN_ASSISTENZA') || blob.toLowerCase().includes(ASSISTENZA_EMAIL)) {
        return true;
    }
    const ft = log.fullText ?? '';
    const ss = log.shortSummary ?? '';
    if (
        ft.includes('(Da compilare)') &&
        (ft.includes('verbale_giornaliero_auto') ||
            ss.toLowerCase().includes('scaffold verbale') ||
            ss.toLowerCase().includes('da completare in obsidian'))
    ) {
        return true;
    }
    return false;
}

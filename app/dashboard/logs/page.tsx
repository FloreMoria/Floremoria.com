import { FloremoriaLog, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import ClientLogsTable from './ClientLogsTable';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: 'Log di Sistema | Floremoria Admin',
};

export const dynamic = 'force-dynamic';

// Categorie operative ufficiali (CEO): mappate sul campo `tag` di FloremoriaLog,
// così non serve un modello parallelo e la ricerca/filtro resta unica e coerente.
export const OPERATIONAL_CATEGORIES = ['STRATEGIA', 'WEBHOOK', 'PARTNERS', 'BREVETTI'] as const;

// Limite di sicurezza: la timeline può crescere a centinaia/migliaia di record.
// Caricarli tutti in un colpo rallenterebbe la pagina; impaginiamo lato server.
const PAGE_SIZE = 200;

/** Converte una data ISO (YYYY-MM-DD) in un Date affidabile a mezzogiorno UTC (evita slittamenti di fuso). */
function parseIsoDateAtNoon(iso: string | undefined): Date | null {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return Number.isNaN(date.getTime()) ? null : date;
}

export default async function SystemLogsPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; filter?: string; category?: string; from?: string; to?: string }>;
}) {
    const resolvedParams = await searchParams;
    const q = resolvedParams.q?.trim() || '';
    // `filter` resta supportato per retro-compatibilità con i link tag esistenti.
    const rawCategory = (resolvedParams.category || resolvedParams.filter || '').trim();
    const category = rawCategory;
    const from = resolvedParams.from?.trim() || '';
    const to = resolvedParams.to?.trim() || '';

    const andClauses: Prisma.FloremoriaLogWhereInput[] = [
        {
            NOT: {
                OR: [
                    { tag: { contains: 'POSTMAN_ASSISTENZA', mode: 'insensitive' as const } },
                    { tag: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { topic: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { shortSummary: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { keyPrompt: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { fullText: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { discussedPoints: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                ]
            }
        }
    ];

    if (category) {
        andClauses.push({ tag: { contains: category, mode: 'insensitive' } });
    }

    if (q) {
        andClauses.push({
            OR: [
                { tag: { contains: q, mode: 'insensitive' } },
                { topic: { contains: q, mode: 'insensitive' } },
                { shortSummary: { contains: q, mode: 'insensitive' } },
                { keyPrompt: { contains: q, mode: 'insensitive' } },
                { fullText: { contains: q, mode: 'insensitive' } },
            ],
        });
    }

    const fromDate = parseIsoDateAtNoon(from);
    const toDate = parseIsoDateAtNoon(to);
    if (fromDate || toDate) {
        const dateFilter: Prisma.DateTimeFilter = {};
        if (fromDate) dateFilter.gte = fromDate;
        // `to` inclusivo: spostiamo al termine della giornata selezionata.
        if (toDate) dateFilter.lte = new Date(toDate.getTime() + 12 * 60 * 60 * 1000);
        andClauses.push({ sessionDate: dateFilter });
    }

    let logs: FloremoriaLog[] = [];
    try {
        logs = await prisma.floremoriaLog.findMany({
            where: andClauses.length ? { AND: andClauses } : {},
            orderBy: [{ sessionDate: 'desc' }, { id: 'desc' }],
            take: PAGE_SIZE,
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[dashboard/logs] Database non raggiungibile, rendering con timeline vuota:', error);
        }
        logs = [];
    }

    return (
        <div className="p-8 pb-32 max-w-7xl mx-auto space-y-6 fade-in">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-all">
                <ArrowLeft size={16} /> Torna alla Overview
            </Link>
            <ClientLogsTable
                initialLogs={logs}
                initialQuery={q}
                categories={[...OPERATIONAL_CATEGORIES]}
                activeCategory={category}
                activeFrom={from}
                activeTo={to}
                pageSize={PAGE_SIZE}
            />
        </div>
    );
}

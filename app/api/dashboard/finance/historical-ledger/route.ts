import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { syncHistoricalLedgerFromSources } from '@/lib/financial/historicalLedgerSync';
import {
    availableCategories,
    computeHistoricalPnl,
    listHistoricalLedgerEntries,
    listPartnerLedgerExtract,
    listRelatedLedgerEntries,
} from '@/lib/financial/historicalLedgerQuery';
import { sanitizeLedgerDoubleEntryAnomalies } from '@/lib/financial/ledgerDoubleEntrySanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        // Dedup PayPal + sanitizzazione partita doppia prima di listati/PnL
        await sanitizeLedgerDoubleEntryAnomalies();

        const url = new URL(request.url);
        const view = url.searchParams.get('view') || 'list';
        const fiscalYear = Number(url.searchParams.get('year') || new Date().getFullYear());
        const q = url.searchParams.get('quarter');
        const fiscalQuarter = q ? Number(q) : null;
        const month = url.searchParams.get('month')
            ? Number(url.searchParams.get('month'))
            : null;
        const direction = (url.searchParams.get('direction') || 'ALL') as
            | 'ALL'
            | 'ENTRATA'
            | 'USCITA';
        const category = url.searchParams.get('category') || 'ALL';
        const search = url.searchParams.get('search') || '';
        const partnerId = url.searchParams.get('partnerId') || null;
        const take = Number(url.searchParams.get('take') || 200);
        const skip = Number(url.searchParams.get('skip') || 0);

        if (view === 'pnl') {
            const pnl = await computeHistoricalPnl({
                fiscalYear,
                fiscalQuarter: fiscalQuarter && fiscalQuarter >= 1 && fiscalQuarter <= 4 ? fiscalQuarter : null,
            });
            return NextResponse.json({ ok: true, pnl, categories: availableCategories() });
        }

        if (view === 'partner' && partnerId) {
            const data = await listPartnerLedgerExtract(partnerId);
            return NextResponse.json({ ok: true, ...data });
        }

        if (view === 'related') {
            const entryId = url.searchParams.get('entryId') || '';
            if (!entryId.trim()) {
                return jsonError('entryId obbligatorio per view=related', 400);
            }
            const { anchor, rows } = await listRelatedLedgerEntries(entryId.trim());
            if (!anchor) {
                return NextResponse.json({ ok: true, rows: [], anchor: null });
            }
            return NextResponse.json({
                ok: true,
                anchor: { id: anchor.id },
                rows: rows.map((r) => ({
                    id: r.id,
                    accountingDate: r.accountingDate.toISOString(),
                    description: r.description,
                    totalCents: r.totalCents,
                    direction: r.direction,
                    category: r.category,
                    sourceType: r.sourceType,
                    reconciliationStatus: r.reconciliationStatus,
                })),
            });
        }

        const data = await listHistoricalLedgerEntries({
            fiscalYear,
            fiscalQuarter:
                fiscalQuarter && fiscalQuarter >= 1 && fiscalQuarter <= 4 ? fiscalQuarter : null,
            month,
            direction,
            category,
            search,
            partnerId,
            take,
            skip,
        });

        const [pnlYear, pnlQ] = await Promise.all([
            computeHistoricalPnl({ fiscalYear }),
            fiscalQuarter
                ? computeHistoricalPnl({ fiscalYear, fiscalQuarter })
                : Promise.resolve(null),
        ]);

        return NextResponse.json({
            ok: true,
            ...data,
            pnl: pnlQ || pnlYear,
            pnlYear,
            categories: availableCategories(),
        });
    } catch (error) {
        console.error('[historical-ledger GET]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Caricamento registro fallito',
            500
        );
    }
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const body = (await request.json().catch(() => ({}))) as {
            action?: string;
            entryId?: string;
            fonteLabel?: string;
            reconciliationStatus?: string;
        };

        if (body.action === 'set_reconciliation_status') {
            const entryId = String(body.entryId || '').trim();
            const reconciliationStatus = String(body.reconciliationStatus || '')
                .trim()
                .toUpperCase();
            const allowed = new Set(['MATCHED', 'UNMATCHED', 'PARTIAL', 'N/A']);
            if (!entryId || !allowed.has(reconciliationStatus)) {
                return jsonError('entryId e reconciliationStatus validi obbligatori', 400);
            }
            const prisma = (await import('@/lib/prisma')).default;
            const row = await prisma.financialLedgerEntry.findUnique({
                where: { id: entryId },
                select: { id: true },
            });
            if (!row) {
                return jsonError('Voce registro non trovata', 404);
            }
            await prisma.financialLedgerEntry.update({
                where: { id: entryId },
                data: { reconciliationStatus },
            });
            return NextResponse.json({ ok: true, entryId, reconciliationStatus });
        }

        if (body.action === 'set_fonte') {
            const entryId = String(body.entryId || '').trim();
            const fonteLabel = String(body.fonteLabel || '').trim().slice(0, 64);
            if (!entryId || !fonteLabel) {
                return jsonError('entryId e fonteLabel obbligatori', 400);
            }
            const prisma = (await import('@/lib/prisma')).default;
            const row = await prisma.financialLedgerEntry.findUnique({
                where: { id: entryId },
                select: { id: true, metadataJson: true },
            });
            if (!row) {
                // Override locale (JSON Prima Nota) via SystemState
                const key = 'finance.prima_nota.fonte_overrides';
                const existing = await prisma.systemState.findUnique({ where: { key } });
                const map = existing?.value ? (JSON.parse(existing.value) as Record<string, string>) : {};
                map[entryId] = fonteLabel;
                await prisma.systemState.upsert({
                    where: { key },
                    create: { key, value: JSON.stringify(map) },
                    update: { value: JSON.stringify(map) },
                });
                return NextResponse.json({ ok: true, entryId, fonteLabel, via: 'override' });
            }
            const meta =
                row.metadataJson && typeof row.metadataJson === 'object'
                    ? (row.metadataJson as Record<string, unknown>)
                    : {};
            await prisma.financialLedgerEntry.update({
                where: { id: entryId },
                data: {
                    metadataJson: { ...meta, displayFonte: fonteLabel },
                },
            });
            return NextResponse.json({ ok: true, entryId, fonteLabel, via: 'ledger' });
        }

        if (body.action !== 'sync') {
            return jsonError(
                'Usa action: "sync", "set_fonte" o "set_reconciliation_status".',
                400
            );
        }

        const result = await syncHistoricalLedgerFromSources();
        const year = new Date().getFullYear();
        const pnl = await computeHistoricalPnl({ fiscalYear: year });

        return NextResponse.json({
            ok: true,
            message: `Registro aggiornato: +${result.inserted} nuove voci (${result.skipped} già presenti).`,
            sync: result,
            pnl,
        });
    } catch (error) {
        console.error('[historical-ledger POST]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Sync registro fallito',
            500
        );
    }
}

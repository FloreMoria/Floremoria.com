import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { syncHistoricalLedgerFromSources } from '@/lib/financial/historicalLedgerSync';
import {
    availableCategories,
    computeHistoricalPnl,
    listHistoricalLedgerEntries,
    listPartnerLedgerExtract,
} from '@/lib/financial/historicalLedgerQuery';
import { sanitizePaypalLedgerDuplicates } from '@/lib/financial/paypalLedgerSanitize';

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

        // Dedup PayPal prima di listati/PnL (API↔Webhook↔CSV)
        await sanitizePaypalLedgerDuplicates();

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
        };

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
                'Usa action: "sync" o action: "set_fonte".',
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

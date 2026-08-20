/**
 * Query, aggregati CE/IVA e export del Registro Storico Permanente.
 */

import prisma from '@/lib/prisma';
import {
    CATEGORY_LABELS,
    LEDGER_CATEGORIES,
    type HistoricalPnl,
    type LedgerCategory,
} from '@/lib/financial/historicalLedgerTypes';

export type HistoricalLedgerFilters = {
    fiscalYear?: number;
    fiscalQuarter?: number | null;
    month?: number | null;
    direction?: 'ENTRATA' | 'USCITA' | 'ALL';
    category?: string | null;
    search?: string | null;
    partnerId?: string | null;
    includeReversed?: boolean;
    take?: number;
    skip?: number;
};

function buildWhere(filters: HistoricalLedgerFilters) {
    const where: Record<string, unknown> = {};
    if (!filters.includeReversed) where.reversedAt = null;
    if (filters.fiscalYear) where.fiscalYear = filters.fiscalYear;
    if (filters.fiscalQuarter) where.fiscalQuarter = filters.fiscalQuarter;
    if (filters.month && filters.fiscalYear) {
        where.periodKey = `${filters.fiscalYear}-${String(filters.month).padStart(2, '0')}`;
    }
    if (filters.direction && filters.direction !== 'ALL') where.direction = filters.direction;
    if (filters.category && filters.category !== 'ALL') where.category = filters.category;
    if (filters.partnerId) where.partnerId = filters.partnerId;
    if (filters.search?.trim()) {
        where.OR = [
            { description: { contains: filters.search.trim(), mode: 'insensitive' } },
            { counterpartyName: { contains: filters.search.trim(), mode: 'insensitive' } },
            { documentRef: { contains: filters.search.trim(), mode: 'insensitive' } },
        ];
    }
    return where;
}

export async function listHistoricalLedgerEntries(filters: HistoricalLedgerFilters = {}) {
    const take = Math.min(filters.take ?? 200, 2000);
    const skip = filters.skip ?? 0;
    const where = buildWhere(filters);
    const [rows, total] = await Promise.all([
        prisma.financialLedgerEntry.findMany({
            where,
            orderBy: [{ accountingDate: 'desc' }, { createdAt: 'desc' }],
            take,
            skip,
        }),
        prisma.financialLedgerEntry.count({ where }),
    ]);
    return { rows, total };
}

export async function computeHistoricalPnl(opts: {
    fiscalYear: number;
    fiscalQuarter?: number | null;
}): Promise<HistoricalPnl> {
    const where: Record<string, unknown> = {
        reversedAt: null,
        fiscalYear: opts.fiscalYear,
        // Esclude documenti duplicati: CUSTOMER_RECEIPT non è nel sync come ricavo
        sourceType: { not: 'CUSTOMER_RECEIPT' },
    };
    if (opts.fiscalQuarter) where.fiscalQuarter = opts.fiscalQuarter;

    const rows = await prisma.financialLedgerEntry.findMany({
        where,
        select: {
            category: true,
            direction: true,
            totalCents: true,
            netCents: true,
            vatCents: true,
            sourceType: true,
        },
    });

    // Evita doppio conteggio: se esistono sia ORDER che BANK_LINE payout, preferiamo ORDER per ricavi
    // e BANK_LINE solo se non coperto. Per semplicità gestionale: ricavi da ORDER+ALTRI; costi fioristi
    // da FLORIST_PAYOUT; bank lines uscite non fiorista; manual expenses; saas; stripe fees.
    // Per ricavi bank line gateway: includi solo se non abbiamo già sync ordini nello stesso anno
    // (approccio pragmatico: somma per categoria escludendo BANK_LINE ricavi se ci sono ORDER).

    const hasOrders = rows.some((r) => r.sourceType === 'ORDER');

    let ricaviLordiCents = 0;
    let ricaviNettiCents = 0;
    let ivaDebitoCents = 0;
    let costiFioristiCents = 0;
    let costiSaasCents = 0;
    let costiOperativiCents = 0;
    let oneriBancariCents = 0;
    let ivaCreditoCents = 0;

    for (const r of rows) {
        if (r.sourceType === 'BANK_LINE' && r.direction === 'ENTRATA' && hasOrders) {
            // Payout gateway già riflessi negli ordini — evita doppio ricavo
            continue;
        }
        if (r.sourceType === 'BANK_LINE' && r.category === 'COSTI_FIORISTI') {
            // Preferisci FLORIST_PAYOUT da ordine se presente
            const hasFloristPayout = rows.some((x) => x.sourceType === 'FLORIST_PAYOUT');
            if (hasFloristPayout) continue;
        }

        if (r.direction === 'ENTRATA' || r.totalCents > 0) {
            if (r.category === 'RICAVI_VENDITE' || r.category === 'ALTRI_RICAVI' || r.category === 'RIMBORSI') {
                ricaviLordiCents += Math.abs(r.totalCents);
                ricaviNettiCents += Math.abs(r.netCents);
                ivaDebitoCents += Math.abs(r.vatCents);
            }
        } else {
            const abs = Math.abs(r.totalCents);
            if (r.category === 'COSTI_FIORISTI') costiFioristiCents += abs;
            else if (r.category === 'SPESE_SAAS') costiSaasCents += abs;
            else if (r.category === 'ONERI_BANCARI') oneriBancariCents += abs;
            else costiOperativiCents += abs;
            if (r.vatCents < 0 || (r.direction === 'USCITA' && r.vatCents !== 0)) {
                ivaCreditoCents += Math.abs(r.vatCents);
            }
        }
    }

    const costiProduzioneCents = costiFioristiCents + costiSaasCents + costiOperativiCents;
    const ebitdaCents = ricaviLordiCents - costiProduzioneCents;
    const risultatoAnteImposteCents = ebitdaCents - oneriBancariCents;
    const ivaNettaCents = ivaDebitoCents - ivaCreditoCents;

    return {
        fiscalYear: opts.fiscalYear,
        fiscalQuarter: opts.fiscalQuarter ?? null,
        ricaviLordiCents,
        ricaviNettiCents,
        ivaDebitoCents,
        costiFioristiCents,
        costiSaasCents,
        costiOperativiCents,
        costiProduzioneCents,
        ebitdaCents,
        oneriBancariCents,
        ivaCreditoCents,
        ivaNettaCents,
        risultatoAnteImposteCents,
        entriesCount: rows.length,
    };
}

export async function listPartnerLedgerExtract(partnerId: string) {
    return listHistoricalLedgerEntries({
        partnerId,
        take: 500,
        direction: 'ALL',
    });
}

function csvEscape(v: unknown): string {
    const s = v == null ? '' : String(v);
    if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

export async function buildHistoricalLedgerCsv(filters: HistoricalLedgerFilters): Promise<string> {
    const { rows } = await listHistoricalLedgerEntries({ ...filters, take: 5000, skip: 0 });
    const header = [
        'Data Contabile',
        'Data Valuta',
        'Direzione',
        'Categoria',
        'Descrizione',
        'Controparte',
        'P.IVA',
        'Imponibile EUR',
        'Aliquota IVA',
        'IVA EUR',
        'Totale EUR',
        'Stato Riconciliazione',
        'Rif. Documento',
        'Tipo Fonte',
        'ID Fonte',
        'ID Ordine',
        'ID Partner',
        'ID Riga Fineco',
        'Allegato URL',
        'Anno',
        'Trimestre',
        'Periodo',
    ].join(';');

    const lines = rows.map((r) =>
        [
            r.accountingDate.toISOString().slice(0, 10),
            r.valueDate ? r.valueDate.toISOString().slice(0, 10) : '',
            r.direction,
            CATEGORY_LABELS[r.category as LedgerCategory] || r.category,
            r.description,
            r.counterpartyName || '',
            r.counterpartyVat || '',
            (r.netCents / 100).toFixed(2),
            r.vatRate,
            (r.vatCents / 100).toFixed(2),
            (r.totalCents / 100).toFixed(2),
            r.reconciliationStatus,
            r.documentRef || '',
            r.sourceType,
            r.sourceId,
            r.orderId || '',
            r.partnerId || '',
            r.bankLineId || '',
            r.attachmentUrl || '',
            r.fiscalYear,
            r.fiscalQuarter,
            r.periodKey,
        ]
            .map(csvEscape)
            .join(';')
    );

    return `\uFEFF${header}\n${lines.join('\n')}`;
}

export async function buildHistoricalLedgerXlsxBuffer(
    filters: HistoricalLedgerFilters
): Promise<Buffer> {
    const XLSX = await import('xlsx');
    const { rows } = await listHistoricalLedgerEntries({ ...filters, take: 5000, skip: 0 });
    const data = rows.map((r) => ({
        'Data Contabile': r.accountingDate.toISOString().slice(0, 10),
        'Data Valuta': r.valueDate ? r.valueDate.toISOString().slice(0, 10) : '',
        Direzione: r.direction,
        Categoria: CATEGORY_LABELS[r.category as LedgerCategory] || r.category,
        Descrizione: r.description,
        Controparte: r.counterpartyName || '',
        'P.IVA': r.counterpartyVat || '',
        'Imponibile EUR': r.netCents / 100,
        'Aliquota IVA': r.vatRate,
        'IVA EUR': r.vatCents / 100,
        'Totale EUR': r.totalCents / 100,
        'Stato Riconciliazione': r.reconciliationStatus,
        'Rif. Documento': r.documentRef || '',
        'Tipo Fonte': r.sourceType,
        'ID Fonte': r.sourceId,
        'ID Ordine': r.orderId || '',
        'ID Partner': r.partnerId || '',
        'ID Riga Fineco': r.bankLineId || '',
        'Allegato URL': r.attachmentUrl || '',
        Anno: r.fiscalYear,
        Trimestre: r.fiscalQuarter,
        Periodo: r.periodKey,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Libro Giornale');
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return Buffer.from(out);
}

export function availableCategories() {
    return LEDGER_CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABELS[c] }));
}

/**
 * Controlli di quadratura del Dossier Fiscale (METODO §5).
 * Sola verifica: non modifica dati né il generatore XLSX.
 *
 * Spec: docs/METODO_DOSSIER_FISCALE.md
 */

import prisma from '@/lib/prisma';
import {
    listHistoricalLedgerEntries,
} from '@/lib/financial/historicalLedgerQuery';
import {
    CATEGORY_LABELS,
    isInternalTransferCategory,
    type LedgerCategory,
} from '@/lib/financial/historicalLedgerTypes';
import {
    buildTaxQuarterlyReport,
    resolveQuarterBounds,
    type TaxQuarter,
} from '@/lib/financial/taxQuarterly';
import { compareGatewayTransitBalances } from '@/lib/financial/gatewayTransitBalance';

export type DossierControlId =
    | 'C1'
    | 'C2'
    | 'C3'
    | 'C4'
    | 'C5'
    | 'C6'
    | 'C7'
    | 'C8'
    | 'C9'
    | 'C10';

export type DossierControlResult = {
    id: DossierControlId;
    name: string;
    formula: string;
    /** Valore misurato (scostamento rispetto all’atteso 0, o valore grezzo della formula). */
    measured: number;
    expected: number;
    /** measured − expected */
    delta: number;
    unit: 'rows' | 'cents' | 'docs';
    passed: boolean;
    detail: string;
    /** Dettaglio per gateway (solo C10). */
    perGateway?: Array<{
        gateway: 'STRIPE' | 'PAYPAL';
        measured: number;
        expected: number;
        passed: boolean;
        detail: string;
    }>;
};

/** Elenco chiuso mastri — METODO §6.1 (testo esatto). */
export const DOSSIER_ALLOWED_MASTRI = [
    'Ricavi vendite',
    'Altri ricavi',
    'Contributi',
    'Costi del venduto (fioristi)',
    'Commissioni gateway',
    'Servizi e software',
    'Oneri bancari',
    'Spese generali',
    'Compensi professionali',
    'Banca',
    'Transito Stripe',
    'Transito PayPal',
    'Crediti verso clienti',
    'Debiti verso fornitori',
    'Fatture da ricevere',
    'Risconti',
    'IVA a credito',
    'IVA a debito',
    'Finanziamento soci',
    'Da classificare',
] as const;

const ALLOWED_SET = new Set<string>(DOSSIER_ALLOWED_MASTRI);

/** Normalizza etichette legacy verso l’elenco chiuso (solo per il check; non riscrive DB). */
function normalizeMastroForCheck(label: string): string {
    const t = label.trim();
    if (ALLOWED_SET.has(t)) return t;
    const map: Record<string, string> = {
        'Costi del venduto / Fioristi': 'Costi del venduto (fioristi)',
        'Contributi in conto esercizio': 'Contributi',
        'Spese server / SaaS': 'Servizi e software',
        'Spese operative': 'Spese generali',
        'Consulenze': 'Compensi professionali',
        'Da classificare (partite aperte)': 'Da classificare',
        'Partita di giro (gateway → Fineco)': 'Banca', // patrimoniale: giroconto → non in elenco come tale
        'Trasferimento PayPal → banca (giroconto)': 'Transito PayPal',
        'Rimborsi ricevuti': 'Altri ricavi',
        'Imposte / F24': 'Spese generali',
        'Altri costi': 'Spese generali',
    };
    return map[t] || t;
}

function isBankChannel(sourceType: string, category: string): boolean {
    if (sourceType === 'BANK_LINE' || sourceType === 'BANK_LINE_MANUAL') return true;
    // Vista Fineco-master: canale etichettato Fineco
    if (category && /FINECO/i.test(category)) return true;
    return false;
}

async function loadT2BankLines(year: number, quarter: TaxQuarter) {
    const bounds = resolveQuarterBounds(year, quarter);
    return prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { accountingDate: { gte: bounds.start, lte: bounds.end } },
                {
                    AND: [
                        { accountingDate: null },
                        { valueDate: { gte: bounds.start, lte: bounds.end } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            balanceCents: true,
        },
        orderBy: [{ accountingDate: 'asc' }, { valueDate: 'asc' }],
    });
}

async function loadT2PrimaNota(year: number, quarter: TaxQuarter) {
    const { rows } = await listHistoricalLedgerEntries({
        fiscalYear: year,
        fiscalQuarter: quarter,
        direction: 'ALL',
        take: 5000,
        skip: 0,
    });
    return rows;
}

/**
 * C1 — Completezza banca
 * Formula: n° righe estratto − n° righe Prima Nota su canale banca → atteso 0
 */
export async function controlC1(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const bank = await loadT2BankLines(year, quarter);
    const pn = await loadT2PrimaNota(year, quarter);
    const pnBank = pn.filter((r) => isBankChannel(r.sourceType, r.category || ''));
    const measured = bank.length - pnBank.length;
    return {
        id: 'C1',
        name: 'Completezza banca',
        formula: 'n° estratto conto − n° Prima Nota canale banca',
        measured,
        expected: 0,
        delta: measured - 0,
        unit: 'rows',
        passed: measured === 0,
        detail: `estratto=${bank.length} · PN banca=${pnBank.length}`,
    };
}

/**
 * C2 — Quadratura banca
 * Formula: Σ movimenti Prima Nota − (entrate − uscite estratto) → atteso 0
 * Nota: per allineamento al dossier agosto si usa la somma signed di tutte le righe PN
 * del periodo (come foglio Prima Nota Master), non solo canale banca.
 */
export async function controlC2(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const bank = await loadT2BankLines(year, quarter);
    const pn = await loadT2PrimaNota(year, quarter);
    const pnSum = pn.reduce((s, r) => s + r.totalCents, 0);
    let entrate = 0;
    let uscite = 0;
    for (const l of bank) {
        if (l.amountCents > 0) entrate += l.amountCents;
        else uscite += Math.abs(l.amountCents);
    }
    const extractNet = entrate - uscite;
    const measured = pnSum - extractNet;
    return {
        id: 'C2',
        name: 'Quadratura banca',
        formula: 'Σ Prima Nota − (entrate − uscite estratto)',
        measured,
        expected: 0,
        delta: measured,
        unit: 'cents',
        passed: measured === 0,
        detail: `Σ PN=${(pnSum / 100).toFixed(2)} · net estratto=${(extractNet / 100).toFixed(2)} (E ${(entrate / 100).toFixed(2)} − U ${(uscite / 100).toFixed(2)})`,
    };
}

/**
 * C3 — Continuità saldo
 * Formula: saldo iniziale + Σ movimenti − saldo finale dichiarato → 0
 * Fonti: BankStatementDocument con opening/closing sul periodo (PDF ufficiali).
 */
export async function controlC3(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const bounds = resolveQuarterBounds(year, quarter);
    const docs = await prisma.bankStatementDocument.findMany({
        where: {
            OR: [
                {
                    periodStart: { lte: bounds.end },
                    periodEnd: { gte: bounds.start },
                },
                {
                    periodStart: null,
                    uploadedAt: { gte: bounds.start, lte: bounds.end },
                },
            ],
        },
        select: {
            id: true,
            fileName: true,
            openingBalanceCents: true,
            closingBalanceCents: true,
            periodStart: true,
            periodEnd: true,
        },
    });

    const withBoth = docs.filter(
        (d) => d.openingBalanceCents != null && d.closingBalanceCents != null
    );

    if (withBoth.length === 0) {
        return {
            id: 'C3',
            name: 'Continuità saldo',
            formula: 'saldo iniziale + Σ movimenti − saldo finale',
            measured: NaN,
            expected: 0,
            delta: NaN,
            unit: 'cents',
            passed: false,
            detail:
                'Nessun estratto PDF con opening+closing nel periodo — controllo non eseguibile (METODO §2: paste senza saldi non è fonte)',
        };
    }

    // Usa il documento che copre meglio il trimestre (max overlap)
    const pick = withBoth.sort((a, b) => {
        const aSpan =
            (a.periodEnd?.getTime() || 0) - (a.periodStart?.getTime() || 0);
        const bSpan =
            (b.periodEnd?.getTime() || 0) - (b.periodStart?.getTime() || 0);
        return bSpan - aSpan;
    })[0];

    const lines = await prisma.bankStatementLine.findMany({
        where: { documentId: pick.id },
        select: { amountCents: true },
    });
    const sumMov = lines.reduce((s, l) => s + l.amountCents, 0);
    const opening = pick.openingBalanceCents!;
    const closing = pick.closingBalanceCents!;
    const measured = opening + sumMov - closing;

    return {
        id: 'C3',
        name: 'Continuità saldo',
        formula: 'saldo iniziale + Σ movimenti − saldo finale',
        measured,
        expected: 0,
        delta: measured,
        unit: 'cents',
        passed: measured === 0,
        detail: `doc=${pick.fileName || pick.id} · open=${(opening / 100).toFixed(2)} · Σ=${(sumMov / 100).toFixed(2)} · close=${(closing / 100).toFixed(2)} · nLinee=${lines.length}`,
    };
}

/**
 * C4 — Incassi e corrispettivi
 * Formula: Σ incassi clienti gateway − totale registro corrispettivi → 0
 */
export async function controlC4(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const bounds = resolveQuarterBounds(year, quarter);
    const report = await buildTaxQuarterlyReport(year, quarter);

    // Incassi clienti dai gateway (stessa logica Quadratura agosto: charge/payment Stripe + vendite PayPal)
    const stripe = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: bounds.start, lte: bounds.end },
            type: { in: ['charge', 'payment'] },
        },
        select: { amountCents: true, type: true },
    });
    const stripeIncassi = stripe.reduce((s, m) => s + Math.abs(m.amountCents), 0);

    const paypal = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: { gte: bounds.start, lte: bounds.end },
            direction: 'ENTRATA',
            category: 'RICAVI_VENDITE',
        },
        select: { totalCents: true },
    });
    // fallback: ENTRATA PayPal non transfer
    const paypalAll = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: { gte: bounds.start, lte: bounds.end },
        },
        select: { totalCents: true, category: true, direction: true, description: true },
    });
    const paypalIncassi = paypalAll
        .filter((r) => {
            if (isInternalTransferCategory(r.category)) return false;
            const d = (r.description || '').toUpperCase();
            if (/FEE|COMMISSION|PAYOUT|WITHDRAWAL|SDD|ADD TO BALANCE/.test(d)) return false;
            return r.totalCents > 0 || r.direction === 'ENTRATA';
        })
        .reduce((s, r) => s + Math.abs(r.totalCents), 0);

    const gatewayIncassi = stripeIncassi + (paypal.length ? paypal.reduce((s, r) => s + Math.abs(r.totalCents), 0) : paypalIncassi);
    const corrispettivi = report.corrispettivi.reduce((s, r) => s + r.grossCents, 0);
    const measured = gatewayIncassi - corrispettivi;

    return {
        id: 'C4',
        name: 'Incassi e corrispettivi',
        formula: 'Σ incassi clienti gateway − totale registro corrispettivi',
        measured,
        expected: 0,
        delta: measured,
        unit: 'cents',
        passed: measured === 0,
        detail: `gateway=${(gatewayIncassi / 100).toFixed(2)} (Stripe charges/payments ${(stripeIncassi / 100).toFixed(2)} + PayPal) · corrispettivi report=${(corrispettivi / 100).toFixed(2)} · nCorrispettivi=${report.corrispettivi.length}`,
    };
}

/**
 * C5 — Coerenza documenti
 * Formula: Σ(imponibile + IVA) − Σ totali documento → 0
 */
export async function controlC5(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const bounds = resolveQuarterBounds(year, quarter);
    const [manual, saas] = await Promise.all([
        prisma.manualFinanceExpense.findMany({
            where: { expenseDate: { gte: bounds.start, lte: bounds.end } },
            select: { netCents: true, vatCents: true, totalCents: true },
        }),
        prisma.saasForeignInvoice.findMany({
            where: { invoiceDate: { gte: bounds.start, lte: bounds.end } },
            select: { eurAmountCents: true },
        }),
    ]);

    let sumParts = 0;
    let sumTot = 0;
    for (const e of manual) {
        sumParts += (e.netCents || 0) + (e.vatCents || 0);
        sumTot += e.totalCents || 0;
    }
    // SaaS: in dossier XLSX imponibile=eurAmount, IVA=22%, totale=imponibile+IVA
    for (const e of saas) {
        const imponibile = e.eurAmountCents || 0;
        const iva = Math.round((imponibile * 22) / 100);
        sumParts += imponibile + iva;
        sumTot += imponibile + iva; // coerenza interna del foglio = 0 per costruzione
    }
    const measured = sumParts - sumTot;
    return {
        id: 'C5',
        name: 'Coerenza documenti',
        formula: 'Σ(imponibile + IVA) − Σ totali documento',
        measured,
        expected: 0,
        delta: measured,
        unit: 'cents',
        passed: measured === 0,
        detail: `manual=${manual.length} · saas=${saas.length} · parti=${(sumParts / 100).toFixed(2)} · totali=${(sumTot / 100).toFixed(2)}`,
    };
}

/**
 * C6 — Nessuno storno tecnico (METODO §5; confronto su **imponibile**, v1.2)
 *
 * Formula: n° **coppie** di righe con imponibile uguale e opposto, stesso
 * identificativo di documento, generate dal sistema → atteso 0.
 *
 * Perché l’imponibile e non il totale: in un acquisto estero la riga positiva
 * porta l’IVA reverse charge e la negativa ha IVA zero — i totali non sono
 * opposti anche quando gli imponibili lo sono (−17,75 / +17,75 → totali −17,75 / +21,66).
 *
 * Universo = stesso foglio «Fatture Passive e Autofatture»: manual + saas.
 * Non conta mai rimborsi clienti né note di credito (fatti esterni con id proprio).
 */
export async function controlC6(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const bounds = resolveQuarterBounds(year, quarter);
    const [manual, saas] = await Promise.all([
        prisma.manualFinanceExpense.findMany({
            where: { expenseDate: { gte: bounds.start, lte: bounds.end } },
            select: {
                id: true,
                vendorName: true,
                netCents: true,
                vatCents: true,
                totalCents: true,
                metadataJson: true,
                fileName: true,
                description: true,
            },
        }),
        prisma.saasForeignInvoice.findMany({
            where: { invoiceDate: { gte: bounds.start, lte: bounds.end } },
            select: {
                id: true,
                vendorName: true,
                eurAmountCents: true,
                fileName: true,
            },
        }),
    ]);

    type C6Row = {
        id: string;
        source: 'manual' | 'saas';
        netCents: number;
        docKey: string;
        system: boolean;
    };

    function docKeyFromParts(parts: {
        invoiceNumber?: string;
        documentNumber?: string;
        foreignInvoiceNumber?: string;
        fileName?: string | null;
        fallbackId: string;
    }): string {
        const raw =
            parts.invoiceNumber ||
            parts.documentNumber ||
            parts.foreignInvoiceNumber ||
            parts.fileName ||
            parts.fallbackId;
        return String(raw).trim().toLowerCase();
    }

    /** Artefatto di sistema (non rimborso cliente / non NC esterna). */
    function isSystemManual(e: (typeof manual)[0]): boolean {
        const meta = (e.metadataJson || {}) as Record<string, unknown>;
        const blob = `${e.description || ''} ${e.fileName || ''} ${JSON.stringify(meta)}`.toLowerCase();
        if (
            /rimborso|refund|nota di credito|credit.?note|storno cliente|customer.?refund/.test(blob)
        ) {
            return false;
        }
        if (
            meta.source === 'SDI_AUTOFATTURA_ESTERA' ||
            meta.source === 'AUTOFATTURA_TD17' ||
            meta.source === 'AUTOFATTURA_TD18' ||
            meta.isForeignAutofattura === true ||
            meta.isReverseCharge === true ||
            typeof meta.saasForeignInvoiceId === 'string' ||
            typeof meta.sanitizeReason === 'string' ||
            meta.origin === 'system' ||
            meta.generatedBy === 'system'
        ) {
            return true;
        }
        // Riga negativa senza meta di sistema: nel dossier agosto è comunque
        // la controparte tecnica della saas sullo stesso fileName → conta come sistema
        // solo se esiste una saas con lo stesso documento (verificato al pairing).
        return e.netCents < 0 && Boolean(e.fileName);
    }

    const rows: C6Row[] = [];

    for (const e of manual) {
        const meta = (e.metadataJson || {}) as Record<string, unknown>;
        rows.push({
            id: `manual:${e.id}`,
            source: 'manual',
            netCents: e.netCents,
            docKey: docKeyFromParts({
                invoiceNumber: typeof meta.invoiceNumber === 'string' ? meta.invoiceNumber : undefined,
                documentNumber:
                    typeof meta.documentNumber === 'string' ? meta.documentNumber : undefined,
                foreignInvoiceNumber:
                    typeof meta.foreignInvoiceNumber === 'string'
                        ? meta.foreignInvoiceNumber
                        : undefined,
                fileName: e.fileName,
                fallbackId: e.id,
            }),
            system: isSystemManual(e),
        });
    }

    for (const s of saas) {
        // SaaS = riga fornitore estero / autofattura positiva nel foglio dossier
        rows.push({
            id: `saas:${s.id}`,
            source: 'saas',
            netCents: s.eurAmountCents,
            docKey: docKeyFromParts({
                fileName: s.fileName,
                fallbackId: s.id,
            }),
            system: true,
        });
    }

    const byDoc = new Map<string, C6Row[]>();
    for (const r of rows) {
        if (!byDoc.has(r.docKey)) byDoc.set(r.docKey, []);
        byDoc.get(r.docKey)!.push(r);
    }

    let pairs = 0;
    const examples: string[] = [];
    const pairedIds = new Set<string>();
    for (const [docId, group] of byDoc) {
        const pos = group.filter((r) => r.netCents > 0 && r.system);
        const neg = group.filter((r) => r.netCents < 0 && r.system);
        const usedPos = new Set<string>();
        for (const n of neg) {
            // Confronto sull’**imponibile**, non sul totale documento
            const match = pos.find(
                (p) => !usedPos.has(p.id) && p.netCents + n.netCents === 0
            );
            if (match) {
                usedPos.add(match.id);
                pairedIds.add(n.id);
                pairedIds.add(match.id);
                pairs++;
                if (examples.length < 6) {
                    examples.push(
                        `${docId.slice(0, 48)} imponibile ±${(Math.abs(n.netCents) / 100).toFixed(2)} (${n.source}↔${match.source})`
                    );
                }
            }
        }
    }

    const orphanNeg = rows.filter(
        (r) => r.netCents < 0 && r.system && !pairedIds.has(r.id)
    ).length;

    return {
        id: 'C6',
        name: 'Nessuno storno tecnico',
        formula:
            'n° coppie imponibile uguale/opposto, stesso id documento, generate dal sistema (no rimborsi)',
        measured: pairs,
        expected: 0,
        delta: pairs,
        unit: 'rows',
        passed: pairs === 0,
        detail: `coppie=${pairs}${examples.length ? ` · ${examples.join('; ')}` : ''} · negativi sistema senza coppia=${orphanNeg} · manual=${manual.length} · saas=${saas.length}`,
    };
}

/**
 * C7 — Identificazione fornitori
 * Formula: n° documenti senza P.IVA o CF → 0
 */
export async function controlC7(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const bounds = resolveQuarterBounds(year, quarter);
    const [manual, saas] = await Promise.all([
        prisma.manualFinanceExpense.findMany({
            where: { expenseDate: { gte: bounds.start, lte: bounds.end } },
            select: { vendorName: true, metadataJson: true },
        }),
        prisma.saasForeignInvoice.findMany({
            where: { invoiceDate: { gte: bounds.start, lte: bounds.end } },
            select: { vendorName: true, metadataJson: true },
        }),
    ]);

    const missing: string[] = [];
    for (const e of manual) {
        const meta = (e.metadataJson || {}) as Record<string, unknown>;
        const vat = String(meta.vendorVat || meta.vatNumber || '').trim();
        const cf = String(meta.vendorTaxCode || meta.taxCode || meta.fiscalCode || '').trim();
        if (!vat && !cf) missing.push(e.vendorName || '?');
    }
    for (const e of saas) {
        // Come foglio dossier agosto: colonna P.IVA lasciata vuota sulle SaaS
        const meta = (e.metadataJson || {}) as Record<string, unknown>;
        const vat = String(meta.vendorVat || meta.vatNumber || '').trim();
        if (!vat) missing.push(e.vendorName || '?');
    }

    return {
        id: 'C7',
        name: 'Identificazione fornitori',
        formula: 'n° documenti senza P.IVA o CF',
        measured: missing.length,
        expected: 0,
        delta: missing.length,
        unit: 'docs',
        passed: missing.length === 0,
        detail: missing.length
            ? `esempi: ${missing.slice(0, 5).join('; ')}${missing.length > 5 ? '…' : ''}`
            : 'tutti i documenti hanno P.IVA/CF',
    };
}

/**
 * C8 — Mastri ammessi
 * Formula: n° righe PN con mastro fuori dall’elenco chiuso → 0
 */
export async function controlC8(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const pn = await loadT2PrimaNota(year, quarter);
    let bad = 0;
    const examples: string[] = [];
    for (const r of pn) {
        const raw = CATEGORY_LABELS[r.category as LedgerCategory] || r.category || '';
        const norm = normalizeMastroForCheck(raw);
        if (!ALLOWED_SET.has(norm)) {
            bad++;
            if (examples.length < 5) examples.push(`${raw}→${norm}`);
        }
    }
    return {
        id: 'C8',
        name: 'Mastri ammessi',
        formula: 'n° righe con mastro fuori elenco chiuso §6.1',
        measured: bad,
        expected: 0,
        delta: bad,
        unit: 'rows',
        passed: bad === 0,
        detail: bad ? `esempi: ${examples.join('; ')}` : `tutte le ${pn.length} righe PN in elenco chiuso (dopo normalizzazione legacy)`,
    };
}

/**
 * C9 — Partite di giro
 * Formula: n° movimenti di transito classificati come ricavo o costo → 0
 */
export async function controlC9(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    const bounds = resolveQuarterBounds(year, quarter);
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: year,
            fiscalQuarter: quarter,
            accountingDate: { gte: bounds.start, lte: bounds.end },
        },
        select: {
            id: true,
            category: true,
            entryNature: true,
            description: true,
            sourceType: true,
            totalCents: true,
        },
    });

    const revenueOrCost = new Set([
        'RICAVI_VENDITE',
        'ALTRI_RICAVI',
        'CONTRIBUTI_ESERCIZIO',
        'RIMBORSI',
        'COSTI_FIORISTI',
        'SPESE_SAAS',
        'SPESE_OPERATIVE',
        'ONERI_BANCARI',
        'CONSULENZE',
        'IMPOSTE',
        'ALTRI_COSTI',
    ]);

    let bad = 0;
    for (const r of rows) {
        const isTransitNature = r.entryNature === 'TRANSITO';
        const desc = (r.description || '').toUpperCase();
        const looksTransit =
            isTransitNature ||
            /ADD TO BALANCE|PAYOUT|GIROCONTO|TRASFERIMENTO DI DENARO|DENARO RACCOLTO/.test(desc) ||
            (r.sourceType === 'BANK_LINE' && /STRIPE|PAYPAL/.test(desc) && /PAYOUT|ACCREDITO|BONIFICO.*STRIPE|SDD/.test(desc));

        // Partita di giro mal classificata: transito ma category economica ricavo/costo
        // Esclude già TRASFERIMENTO_INTERNO / PAYPAL_PAYOUT (corretti)
        if (
            looksTransit &&
            revenueOrCost.has(r.category) &&
            !isInternalTransferCategory(r.category)
        ) {
            bad++;
        }
    }

    return {
        id: 'C9',
        name: 'Partite di giro',
        formula: 'n° movimenti di transito classificati come ricavo o costo',
        measured: bad,
        expected: 0,
        delta: bad,
        unit: 'rows',
        passed: bad === 0,
        detail: `righe ledger T2 ispezionate=${rows.length}`,
    };
}

/**
 * C10 — Doppia gamba transito
 * Formula: per ogni gateway: Σ dare − Σ avere − saldo wallet dichiarato → 0
 */
export async function controlC10(year: number, quarter: TaxQuarter): Promise<DossierControlResult> {
    void year;
    void quarter;
    // Il saldo wallet è un punto nel tempo (dichiarato dal gateway); il ledger transit è cumulativo.
    const cmp = await compareGatewayTransitBalances();

    const perGateway: NonNullable<DossierControlResult['perGateway']> = [
        {
            gateway: 'STRIPE',
            measured: cmp.stripe.deltaCents ?? Number.NaN,
            expected: 0,
            passed: cmp.stripe.deltaCents === 0,
            detail: `ledger dare−avere=${(cmp.stripe.transitLedgerCents / 100).toFixed(2)} · wallet dich.=${
                cmp.stripe.gatewayAvailableCents == null
                    ? 'n/d'
                    : (cmp.stripe.gatewayAvailableCents / 100).toFixed(2)
            } · ${cmp.stripe.note}`,
        },
        {
            gateway: 'PAYPAL',
            measured: cmp.paypal.deltaCents ?? Number.NaN,
            expected: 0,
            passed: false, // saldo API non wireato → non può passare
            detail: `ledger dare−avere=${(cmp.paypal.transitLedgerCents / 100).toFixed(2)} · wallet dich.=n/d · ${cmp.paypal.note}`,
        },
    ];

    // Fallback PayPal: se non c'è saldo dichiarato, lo scostamento è il solo saldo ledger ≠ 0
    // oppure fallimento strutturale (gamba dare assente). Misura “fallito” se delta null o ≠ 0.
    if (cmp.paypal.deltaCents == null) {
        perGateway[1].measured = cmp.paypal.transitLedgerCents; // ≠ 0 ⇒ fallisce
        perGateway[1].passed = false;
        perGateway[1].detail +=
            ' · FALLITO: saldo wallet PayPal non dichiarato (API non collegata) e/o gamba dare incompleta';
    }

    const bothFailed = perGateway.every((g) => !g.passed);
    const measured = perGateway.filter((g) => !g.passed).length;

    return {
        id: 'C10',
        name: 'Doppia gamba transito',
        formula: 'per gateway: Σ dare − Σ avere − saldo wallet dichiarato',
        measured,
        expected: 0,
        delta: measured,
        unit: 'rows',
        passed: perGateway.every((g) => g.passed),
        detail: bothFailed
            ? 'FALLITO su entrambi i gateway (atteso in Fase 1: gamba dare mai scritta / saldo PayPal n/d)'
            : perGateway.map((g) => `${g.gateway}:${g.passed ? 'OK' : 'KO'}`).join(' · '),
        perGateway,
    };
}

export async function runAllDossierControls(
    year: number,
    quarter: TaxQuarter
): Promise<DossierControlResult[]> {
    return [
        await controlC1(year, quarter),
        await controlC2(year, quarter),
        await controlC3(year, quarter),
        await controlC4(year, quarter),
        await controlC5(year, quarter),
        await controlC6(year, quarter),
        await controlC7(year, quarter),
        await controlC8(year, quarter),
        await controlC9(year, quarter),
        await controlC10(year, quarter),
    ];
}

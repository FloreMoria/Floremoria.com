/**
 * Report vendite PayPal HAYUM — fonte autorevole di cosa sia una vendita sul canale.
 * File: docs/verbali/paypal-sales-reports/{T1,T2,T3…}.csv
 *
 * Perché: il ledger PayPal contiene anche cashback, micro-rimborsi e movimenti di conto
 * che non devono entrare nel registro corrispettivi (METODO §8.4).
 */
import fs from 'node:fs';
import path from 'node:path';

export type PaypalSalesDay = {
    date: string; // YYYY-MM-DD
    quantity: number;
    volumeCents: number;
    /** Slot unitari in centesimi (qty × media, o ripartizione esatta quando volume % qty = 0). */
    unitSlotsCents: number[];
};

export type PaypalSalesReportIndex = {
    merchantCode: string;
    days: Map<string, PaypalSalesDay>;
    /** Totale vendite (centesimi) su tutti i giorni con qty > 0. */
    totalSalesCents: number;
    totalSalesCount: number;
    sources: string[];
};

const DEFAULT_DIR = path.join(
    process.cwd(),
    'docs',
    'verbali',
    'paypal-sales-reports'
);

const DEFAULT_FILES = [
    'T1-2026.csv',
    'T2-2026.csv',
    'T3-2026-PROVVISORIO-1lug-10set.csv',
];

function euroToCents(raw: string): number {
    const n = Number(String(raw).trim().replace(',', '.'));
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
}

function expandUnitSlots(quantity: number, volumeCents: number, avgRaw: string): number[] {
    if (quantity <= 0 || volumeCents <= 0) return [];
    if (quantity === 1) return [volumeCents];
    const avgCents = euroToCents(avgRaw);
    if (avgCents > 0 && avgCents * quantity === volumeCents) {
        return Array.from({ length: quantity }, () => avgCents);
    }
    // Ripartizione half-up: primi (qty-1) = floor, ultimo = resto
    const base = Math.floor(volumeCents / quantity);
    const slots = Array.from({ length: quantity }, () => base);
    let rem = volumeCents - base * quantity;
    for (let i = 0; i < slots.length && rem > 0; i++) {
        slots[i] += 1;
        rem -= 1;
    }
    return slots;
}

/** Parsa un CSV report vendite PayPal (riepilogo giornaliero). */
export function parsePaypalSalesReportCsv(csvText: string, sourceLabel: string): PaypalSalesDay[] {
    const lines = csvText.split(/\r?\n/);
    const days: PaypalSalesDay[] = [];
    let inDaily = false;
    for (const line of lines) {
        const cols = line.split(';');
        if (cols[0]?.trim() === 'Data' && /Quantit/i.test(cols[1] || '')) {
            inDaily = true;
            continue;
        }
        if (!inDaily) continue;
        const date = (cols[0] || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const quantity = Number(cols[1] || 0) || 0;
        const volumeCents = euroToCents(cols[2] || '0');
        if (quantity <= 0 || volumeCents <= 0) continue;
        days.push({
            date,
            quantity,
            volumeCents,
            unitSlotsCents: expandUnitSlots(quantity, volumeCents, cols[3] || ''),
        });
    }
    if (days.length === 0) {
        throw new Error(`[paypalSalesReport] Nessun giorno vendita in ${sourceLabel}`);
    }
    return days;
}

let cached: PaypalSalesReportIndex | null = null;

export function loadPaypalSalesReportIndex(opts?: {
    dir?: string;
    files?: string[];
    forceReload?: boolean;
}): PaypalSalesReportIndex {
    if (cached && !opts?.forceReload) return cached;
    const dir = opts?.dir || DEFAULT_DIR;
    const files = opts?.files || DEFAULT_FILES;
    const days = new Map<string, PaypalSalesDay>();
    const sources: string[] = [];
    let totalSalesCents = 0;
    let totalSalesCount = 0;

    for (const file of files) {
        const full = path.join(dir, file);
        if (!fs.existsSync(full)) {
            console.warn(`[paypalSalesReport] file assente: ${full}`);
            continue;
        }
        const parsed = parsePaypalSalesReportCsv(fs.readFileSync(full, 'utf8'), file);
        sources.push(file);
        for (const d of parsed) {
            const prev = days.get(d.date);
            if (prev) {
                // Stesso giorno in più file: tieni il più completo (qty/volume maggiori)
                if (d.quantity > prev.quantity || d.volumeCents > prev.volumeCents) {
                    days.set(d.date, d);
                }
            } else {
                days.set(d.date, d);
            }
        }
    }

    for (const d of days.values()) {
        totalSalesCents += d.volumeCents;
        totalSalesCount += d.quantity;
    }

    cached = {
        merchantCode: 'HAYUMYJTWLRTE',
        days,
        totalSalesCents,
        totalSalesCount,
        sources,
    };
    return cached;
}

export function italyDateKey(d: Date): string {
    // Europe/Rome calendar date for matching report days
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

/**
 * Seleziona quali movimenti PayPal sono vendite confermate dal report.
 * Matching greedy per giorno su importo esatto (centesimi).
 * I movimenti con orderId restano ammessi anche fuori report (METODO §8.4).
 */
export function selectPaypalSalesConfirmed(params: {
    movements: Array<{
        transactionId: string;
        grossCents: number;
        paymentDate: Date;
        orderId: string | null;
    }>;
    index?: PaypalSalesReportIndex;
}): {
    confirmedTxIds: Set<string>;
    excluded: Array<{ transactionId: string; grossCents: number; date: string; reason: string }>;
} {
    const index = params.index || loadPaypalSalesReportIndex();
    const confirmedTxIds = new Set<string>();
    const excluded: Array<{
        transactionId: string;
        grossCents: number;
        date: string;
        reason: string;
    }> = [];

    // Slot residui per giorno (copia mutabile)
    const slotsLeft = new Map<string, number[]>();
    for (const [date, day] of index.days) {
        slotsLeft.set(date, [...day.unitSlotsCents]);
    }

    // Prima: movimenti con orderId → confermati (vendita agganciata)
    const rest: typeof params.movements = [];
    for (const m of params.movements) {
        if (m.grossCents <= 0) continue; // rimborsi gestiti altrove
        if (m.orderId) {
            confirmedTxIds.add(m.transactionId);
            // Consuma uno slot se coincide (migliora il matching residuale)
            const date = italyDateKey(m.paymentDate);
            const slots = slotsLeft.get(date);
            if (slots) {
                const idx = slots.findIndex((s) => s === m.grossCents);
                if (idx >= 0) slots.splice(idx, 1);
            }
            continue;
        }
        rest.push(m);
    }

    // Poi: greedy match su report (importo maggiore prima, per stabilità)
    rest.sort((a, b) => Math.abs(b.grossCents) - Math.abs(a.grossCents));
    for (const m of rest) {
        const date = italyDateKey(m.paymentDate);
        const slots = slotsLeft.get(date);
        if (!slots || slots.length === 0) {
            excluded.push({
                transactionId: m.transactionId,
                grossCents: m.grossCents,
                date,
                reason: 'PayPal non in report vendite (nessuno slot vendita quel giorno)',
            });
            continue;
        }
        const idx = slots.findIndex((s) => s === m.grossCents);
        if (idx < 0) {
            excluded.push({
                transactionId: m.transactionId,
                grossCents: m.grossCents,
                date,
                reason: `PayPal non in report vendite (importo ${m.grossCents}¢ assente dagli slot del giorno)`,
            });
            continue;
        }
        slots.splice(idx, 1);
        confirmedTxIds.add(m.transactionId);
    }

    return { confirmedTxIds, excluded };
}

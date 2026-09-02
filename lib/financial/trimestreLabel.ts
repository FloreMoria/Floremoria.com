/**
 * Nomenclatura periodi fiscali italiana: Trimestre T1–T4 (ex Quarter Q1–Q4).
 * I parametri API accettano ancora Q1/Q3/3 per retrocompatibilità.
 */

export type TrimestreIndex = 1 | 2 | 3 | 4;

const MONTH_RANGES: Record<TrimestreIndex, string> = {
    1: 'Gen - Mar',
    2: 'Apr - Giu',
    3: 'Lug - Set',
    4: 'Ott - Dic',
};

/** Codice corto: T1 … T4 */
export function trimestreCode(index: number): string {
    const n = Math.min(4, Math.max(1, Math.floor(index))) as TrimestreIndex;
    return `T${n}`;
}

/** Etichetta dossier/Excel: "T3 2026" */
export function trimestrePeriodLabel(year: number, index: number): string {
    return `${trimestreCode(index)} ${year}`;
}

/** Etichetta UI lunga: "T3 2026 (Lug - Set)" */
export function trimestrePeriodLabelLong(year: number, index: number): string {
    const n = Math.min(4, Math.max(1, Math.floor(index))) as TrimestreIndex;
    return `${trimestreCode(n)} ${year} (${MONTH_RANGES[n]})`;
}

/**
 * Parse da query: "3" | "T3" | "Q3" | "t3" → 1..4
 * Default: trimestre corrente.
 */
export function parseTrimestreParam(raw: string | null | undefined): TrimestreIndex {
    if (raw == null || raw === '') {
        return (Math.floor(new Date().getMonth() / 3) + 1) as TrimestreIndex;
    }
    const s = String(raw).trim().toUpperCase();
    const fromCode = s.match(/^[TQ]([1-4])$/);
    if (fromCode) return Number(fromCode[1]) as TrimestreIndex;
    const n = Number(s);
    if (n === 1 || n === 2 || n === 3 || n === 4) return n;
    return (Math.floor(new Date().getMonth() / 3) + 1) as TrimestreIndex;
}

/** Normalizza chiave storage Prima Nota: accetta Q1 legacy → T1 */
export function normalizePrimaNotaPeriodKey(
    raw: string | null | undefined
): 'T1' | 'T2' | 'T3' | 'T4' | 'YEAR' | null {
    if (!raw) return null;
    const s = raw.trim().toUpperCase();
    if (s === 'YEAR' || s === 'ANNO') return 'YEAR';
    const m = s.match(/^[TQ]([1-4])$/);
    if (m) return `T${m[1]}` as 'T1' | 'T2' | 'T3' | 'T4';
    if (s === '1' || s === '2' || s === '3' || s === '4') {
        return `T${s}` as 'T1' | 'T2' | 'T3' | 'T4';
    }
    return null;
}

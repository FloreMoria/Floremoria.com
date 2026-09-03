/**
 * Nomenclatura periodi fiscali italiana: Trimestre T1–T4 (ex Quarter Q1–Q4).
 * I parametri API accettano ancora Q1/Q3/3 per retrocompatibilità.
 */

export type TrimestreIndex = 1 | 2 | 3 | 4;
export type FiscalPeriodParam = TrimestreIndex | 'YEAR';

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
 * Parse da query: "3" | "T3" | "Q3" | "YEAR" | "ALL" → 1..4 | YEAR
 * Default: trimestre corrente.
 */
export function parseFiscalPeriodParam(raw: string | null | undefined): FiscalPeriodParam {
    if (raw == null || raw === '') {
        return (Math.floor(new Date().getMonth() / 3) + 1) as TrimestreIndex;
    }
    const s = String(raw).trim().toUpperCase();
    if (s === 'YEAR' || s === 'ALL' || s === 'ANNO' || s === 'COMPLETO' || s === '0') {
        return 'YEAR';
    }
    const fromCode = s.match(/^[TQ]([1-4])$/);
    if (fromCode) return Number(fromCode[1]) as TrimestreIndex;
    const n = Number(s);
    if (n === 1 || n === 2 || n === 3 || n === 4) return n;
    return (Math.floor(new Date().getMonth() / 3) + 1) as TrimestreIndex;
}

/**
 * Parse da query: "3" | "T3" | "Q3" | "t3" → 1..4
 * Default: trimestre corrente.
 * @deprecated Preferire parseFiscalPeriodParam per supportare YEAR.
 */
export function parseTrimestreParam(raw: string | null | undefined): TrimestreIndex {
    const p = parseFiscalPeriodParam(raw);
    if (p === 'YEAR') {
        return (Math.floor(new Date().getMonth() / 3) + 1) as TrimestreIndex;
    }
    return p;
}

/** Stamp filename: T2 | COMPLETO */
export function fiscalPeriodFilenameStamp(period: FiscalPeriodParam): string {
    return period === 'YEAR' ? 'COMPLETO' : trimestreCode(period);
}

/** Normalizza chiave storage Prima Nota: accetta Q1 legacy → T1 */
export function normalizePrimaNotaPeriodKey(
    raw: string | null | undefined
): 'T1' | 'T2' | 'T3' | 'T4' | 'YEAR' | null {
    if (!raw) return null;
    const s = raw.trim().toUpperCase();
    if (s === 'YEAR' || s === 'ANNO' || s === 'ALL' || s === 'COMPLETO') return 'YEAR';
    const m = s.match(/^[TQ]([1-4])$/);
    if (m) return `T${m[1]}` as 'T1' | 'T2' | 'T3' | 'T4';
    if (s === '1' || s === '2' || s === '3' || s === '4') {
        return `T${s}` as 'T1' | 'T2' | 'T3' | 'T4';
    }
    return null;
}

/** Legge il periodo attivo dalla storage Prima Nota / dossier (browser). */
export function readActivePrimaNotaPeriod(): {
    year: number;
    period: FiscalPeriodParam;
    queryValue: string;
} {
    const year = 2026;
    if (typeof window === 'undefined') {
        const q = (Math.floor(new Date().getMonth() / 3) + 1) as TrimestreIndex;
        return { year, period: q, queryValue: String(q) };
    }
    try {
        const fromPrima = normalizePrimaNotaPeriodKey(
            window.localStorage.getItem('floremoria.primaNota.period'),
        );
        if (fromPrima === 'YEAR') {
            return { year, period: 'YEAR', queryValue: 'YEAR' };
        }
        if (fromPrima) {
            const q = Number(fromPrima.slice(1)) as TrimestreIndex;
            return { year, period: q, queryValue: String(q) };
        }
        const dossierQ = window.localStorage.getItem('floremoria.dossier.quarter');
        const fromDossier = normalizePrimaNotaPeriodKey(dossierQ ? `T${dossierQ}` : null);
        if (fromDossier && fromDossier !== 'YEAR') {
            const q = Number(fromDossier.slice(1)) as TrimestreIndex;
            return { year, period: q, queryValue: String(q) };
        }
    } catch {
        /* ignore */
    }
    const q = (Math.floor(new Date().getMonth() / 3) + 1) as TrimestreIndex;
    return { year, period: q, queryValue: String(q) };
}

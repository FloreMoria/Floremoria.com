/**
 * Periodo bancario «aperto» — METODO §2 v1.10.
 * L'estratto ufficiale esiste solo a trimestre chiuso; nel trimestre in corso
 * si ammette la lista movimenti (provvisoria).
 */

export type BankQuarter = 1 | 2 | 3 | 4;

export type OpenBankPeriod = {
    year: number;
    quarter: BankQuarter;
    start: Date;
    end: Date;
    label: string;
};

export function resolveQuarterBounds(year: number, quarter: BankQuarter): {
    start: Date;
    end: Date;
} {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999));
    return { start, end };
}

/** Trimestre di calendario di `now` (UTC) = periodo non ancora chiuso per lista movimenti. */
export function getOpenBankPeriod(now: Date = new Date()): OpenBankPeriod {
    const year = now.getUTCFullYear();
    const quarter = (Math.floor(now.getUTCMonth() / 3) + 1) as BankQuarter;
    const { start, end } = resolveQuarterBounds(year, quarter);
    return { year, quarter, start, end, label: `T${quarter} ${year}` };
}

export function isoDateInOpenPeriod(iso: string | null | undefined, open: OpenBankPeriod): boolean {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const t = Date.parse(`${iso}T12:00:00.000Z`);
    if (!Number.isFinite(t)) return false;
    return t >= open.start.getTime() && t <= open.end.getTime();
}

export const CERT_STATUS_PROVISIONAL = 'provisional';
export const CERT_STATUS_CERTIFIED = 'certified';
export const CERT_STATUS_UNCONFIRMED = 'unconfirmed_by_official';

export const PASTE_SOURCE = 'fineco_paste';

export function isPasteDocumentMeta(meta: unknown): boolean {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
    const m = meta as Record<string, unknown>;
    return m.source === PASTE_SOURCE || m.origin === PASTE_SOURCE;
}

export function lineCertificationStatus(rawJson: unknown): string | null {
    if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) return null;
    const s = (rawJson as Record<string, unknown>).certificationStatus;
    return typeof s === 'string' ? s : null;
}

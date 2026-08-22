/**
 * Formattazione date Contabilità: rigorosamente GG/MM/AAAA (Italia).
 * Evita ISO a schermo, dateStyle medium e RangeError da timeStyle.
 */

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** Parsing robusto di ISO, YYYY-MM-DD, Date o timestamp. */
function toValidDate(input?: string | Date | number | null): Date | null {
    if (input == null || input === '') return null;
    if (input instanceof Date) {
        return Number.isNaN(input.getTime()) ? null : input;
    }
    if (typeof input === 'number') {
        const d = new Date(input);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const raw = String(input).trim();
    if (!raw) return null;

    // Solo data calendario YYYY-MM-DD → interpreta in UTC per evitare shift fuso
    const dayOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dayOnly) {
        const y = Number(dayOnly[1]);
        const m = Number(dayOnly[2]);
        const d = Number(dayOnly[3]);
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    }

    // GG/MM/AAAA già formattato
    const it = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (it) {
        const d = Number(it[1]);
        const m = Number(it[2]);
        const y = Number(it[3]);
        const hh = it[4] != null ? Number(it[4]) : 12;
        const mm = it[5] != null ? Number(it[5]) : 0;
        const dt = new Date(y, m - 1, d, hh, mm, 0);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }

    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

/** GG/MM/AAAA — mai ISO a UI. */
export function formatFinanceDate(input?: string | Date | number | null): string {
    const dt = toValidDate(input);
    if (!dt) return '—';
    // Preferisci componenti UTC per date-only ISO; locale per datetime completi
    const raw = typeof input === 'string' ? input.trim() : '';
    const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) || (raw.includes('T') && raw.endsWith('Z') && !raw.includes(':'));
    if (dayOnly || (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00/.test(raw))) {
        return `${pad2(dt.getUTCDate())}/${pad2(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
    }
    // ISO date-only embedded
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) && !/[T ]\d{2}:\d{2}/.test(raw)) {
        return `${pad2(dt.getUTCDate())}/${pad2(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
    }
    return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

/** GG/MM/AAAA HH:mm */
export function formatFinanceDateTime(input?: string | Date | number | null): string {
    const dt = toValidDate(input);
    if (!dt) return '—';
    const raw = typeof input === 'string' ? input.trim() : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return formatFinanceDate(input);
    }
    return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

/** ID seed demo da non mostrare / non aggregare. */
export const FINANCE_SEED_TX_IDS = new Set([
    'tx_fineco_001',
    'tx_fineco_002',
    'tx_fineco_003',
    'tx_fineco_004',
    'tx_fineco_005',
    'tx_fineco_006',
]);

export const FINANCE_SEED_ENTRY_IDS = new Set([
    'entry_001_gross',
    'entry_002_gross',
    'entry_002_fees',
    'entry_003',
]);

export function isFinanceSeedEntryId(id: string): boolean {
    if (FINANCE_SEED_ENTRY_IDS.has(id)) return true;
    // Varianti storiche seed (entry_001_gross / entry_00x)
    if (/^entry_00\d/.test(id)) return true;
    if (id.startsWith('entry_001') || id.startsWith('entry_002') || id.startsWith('entry_003')) {
        return true;
    }
    return false;
}

export function isFinanceSeedTxId(id: string): boolean {
    return FINANCE_SEED_TX_IDS.has(id) || /^tx_fineco_0/.test(id);
}

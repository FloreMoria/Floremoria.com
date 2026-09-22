/**
 * Stili condivisi tab Contabilità e tabelle Passivo (scroll 10 righe, ricerca).
 */

/** ~10 righe dati (py-2) — corpo tabella scrollabile senza allungare la pagina. */
export const FINANCE_PASSIVO_TABLE_SCROLL =
    'max-h-[420px] overflow-y-auto overflow-x-auto [scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300';

export const FINANCE_PASSIVO_CARD_CLASS =
    'bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-full min-h-[560px] flex flex-col gap-3 overflow-hidden';

/** Quattro blocchi di primo livello (riordino 2026-09-22). */
export type FinanceMainTabId = 'fisco' | 'gestione' | 'controlli' | 'avanzate';

export const FINANCE_TAB_STYLES: Record<
    FinanceMainTabId,
    { active: string; inactive: string }
> = {
    fisco: {
        active: 'bg-rose-50 border-rose-300 text-rose-900',
        inactive:
            'bg-rose-50/40 border-transparent text-rose-800/80 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-200',
    },
    gestione: {
        active: 'bg-emerald-50 border-emerald-300 text-emerald-900',
        inactive:
            'bg-emerald-50/40 border-transparent text-emerald-700/80 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-200',
    },
    controlli: {
        active: 'bg-amber-50 border-amber-400 text-amber-950',
        inactive:
            'bg-amber-50/40 border-transparent text-amber-800/80 hover:bg-amber-50 hover:text-amber-950 hover:border-amber-200',
    },
    avanzate: {
        active: 'bg-slate-100 border-slate-400 text-slate-900',
        inactive:
            'bg-slate-50/60 border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300',
    },
};

export function matchesPassivoSearch(haystack: string, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const normalized = haystack.toLowerCase();
    return q.split(/\s+/).filter(Boolean).every((token) => normalized.includes(token));
}

'use client';

/**
 * Archivio Storico Fiscale + CE permanente da Registro Neon immutabile.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    Archive,
    Download,
    ExternalLink,
    Loader2,
    RefreshCw,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type Pnl = {
    fiscalYear: number;
    fiscalQuarter: number | null;
    ricaviLordiCents: number;
    ricaviNettiCents: number;
    ivaDebitoCents: number;
    costiFioristiCents: number;
    costiSaasCents: number;
    costiOperativiCents: number;
    costiProduzioneCents: number;
    ebitdaCents: number;
    oneriBancariCents: number;
    ivaCreditoCents: number;
    ivaNettaCents: number;
    risultatoAnteImposteCents: number;
    entriesCount: number;
};

type Row = {
    id: string;
    accountingDate: string;
    valueDate: string | null;
    direction: string;
    category: string;
    description: string;
    counterpartyName: string | null;
    counterpartyVat: string | null;
    netCents: number;
    vatRate: number;
    vatCents: number;
    totalCents: number;
    reconciliationStatus: string;
    documentRef: string | null;
    sourceType: string;
    attachmentUrl: string | null;
    bankLineId: string | null;
    orderId: string | null;
    partnerId: string | null;
    fiscalYear: number;
    fiscalQuarter: number;
};

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function HistoricalFiscalArchivePanel() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [quarter, setQuarter] = useState<number | ''>('');
    const [month, setMonth] = useState<number | ''>('');
    const [direction, setDirection] = useState<'ALL' | 'ENTRATA' | 'USCITA'>('ALL');
    const [category, setCategory] = useState('ALL');
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<Row[]>([]);
    const [total, setTotal] = useState(0);
    const [pnl, setPnl] = useState<Pnl | null>(null);
    const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = new URLSearchParams({
                year: String(year),
                direction,
                category,
                take: '300',
            });
            if (quarter) qs.set('quarter', String(quarter));
            if (month) qs.set('month', String(month));
            if (search.trim()) qs.set('search', search.trim());
            const res = await fetch(`/api/dashboard/finance/historical-ledger?${qs}`);
            const parsed = await readJsonResponse<{
                ok?: boolean;
                rows?: Row[];
                total?: number;
                pnl?: Pnl;
                categories?: Array<{ id: string; label: string }>;
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Caricamento fallito');
            setRows(parsed.data?.rows || []);
            setTotal(parsed.data?.total || 0);
            setPnl(parsed.data?.pnl || null);
            setCategories(parsed.data?.categories || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore');
        } finally {
            setLoading(false);
        }
    }, [year, quarter, month, direction, category, search]);

    useEffect(() => {
        void load();
    }, [load]);

    const sync = async () => {
        setSyncing(true);
        setMessage(null);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/historical-ledger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync' }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                message?: string;
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Sync fallito');
            setMessage(parsed.data?.message || 'Sync completato');
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Sync fallito');
        } finally {
            setSyncing(false);
        }
    };

    const exportUrl = (format: 'xlsx' | 'csv') => {
        const qs = new URLSearchParams({
            format,
            year: String(year),
            direction,
            category,
        });
        if (quarter) qs.set('quarter', String(quarter));
        if (month) qs.set('month', String(month));
        return `/api/dashboard/finance/historical-ledger/export?${qs}`;
    };

    return (
        <div className="p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
                        <Archive className="text-[#c5a880]" size={20} />
                        Archivio Storico Fiscale
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        Registro permanente su Neon (immutabile). Filtra per esercizio/trimestre ed esporta
                        Libro Giornale per il commercialista.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void sync()}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                        {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Allinea da fonti
                    </button>
                    <a
                        href={exportUrl('xlsx')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                    >
                        <Download size={14} />
                        Esporta XLSX
                    </a>
                    <a
                        href={exportUrl('csv')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                    >
                        <Download size={14} />
                        Esporta CSV
                    </a>
                </div>
            </div>

            {message && (
                <div className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl px-3 py-2">
                    {message}
                </div>
            )}
            {error && (
                <div className="text-xs bg-rose-50 border border-rose-100 text-rose-700 rounded-xl px-3 py-2">
                    {error}
                </div>
            )}

            {pnl && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                        <p className="text-[10px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                            <TrendingUp size={12} /> Valore produzione
                        </p>
                        <p className="text-xl font-mono font-bold text-emerald-800 mt-1">
                            €{euro(pnl.ricaviLordiCents)}
                        </p>
                        <p className="text-[11px] text-emerald-700/80 mt-1">
                            Netto €{euro(pnl.ricaviNettiCents)} · IVA debito €{euro(pnl.ivaDebitoCents)}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
                        <p className="text-[10px] font-bold uppercase text-rose-700 flex items-center gap-1">
                            <TrendingDown size={12} /> Costi produzione
                        </p>
                        <p className="text-xl font-mono font-bold text-rose-800 mt-1">
                            €{euro(pnl.costiProduzioneCents)}
                        </p>
                        <p className="text-[11px] text-rose-700/80 mt-1">
                            Fioristi €{euro(pnl.costiFioristiCents)} · SaaS €{euro(pnl.costiSaasCents)}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-bold uppercase text-slate-500">EBITDA</p>
                        <p
                            className={`text-xl font-mono font-bold mt-1 ${
                                pnl.ebitdaCents >= 0 ? 'text-slate-900' : 'text-rose-700'
                            }`}
                        >
                            €{euro(pnl.ebitdaCents)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                            Oneri bancari €{euro(pnl.oneriBancariCents)}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                        <p className="text-[10px] font-bold uppercase text-amber-800">IVA &amp; risultato</p>
                        <p className="text-xl font-mono font-bold text-amber-900 mt-1">
                            €{euro(pnl.risultatoAnteImposteCents)}
                        </p>
                        <p className="text-[11px] text-amber-800/80 mt-1">
                            IVA netta €{euro(pnl.ivaNettaCents)} (credito €{euro(pnl.ivaCreditoCents)})
                        </p>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-end">
                <label className="text-[10px] font-bold uppercase text-slate-500">
                    Anno
                    <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        {[year, year - 1, year - 2, 2026, 2025].filter((v, i, a) => a.indexOf(v) === i).map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-[10px] font-bold uppercase text-slate-500">
                    Trimestre
                    <select
                        value={quarter}
                        onChange={(e) => setQuarter(e.target.value ? Number(e.target.value) : '')}
                        className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">Tutti</option>
                        <option value={1}>Q1</option>
                        <option value={2}>Q2</option>
                        <option value={3}>Q3</option>
                        <option value={4}>Q4</option>
                    </select>
                </label>
                <label className="text-[10px] font-bold uppercase text-slate-500">
                    Mese
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}
                        className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">Tutti</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-[10px] font-bold uppercase text-slate-500">
                    Tipologia
                    <select
                        value={direction}
                        onChange={(e) => setDirection(e.target.value as typeof direction)}
                        className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="ALL">Tutti</option>
                        <option value="ENTRATA">Solo Entrate</option>
                        <option value="USCITA">Solo Uscite</option>
                    </select>
                </label>
                <label className="text-[10px] font-bold uppercase text-slate-500">
                    Categoria
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm min-w-[180px]"
                    >
                        <option value="ALL">Tutte</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-[10px] font-bold uppercase text-slate-500 flex-1 min-w-[180px]">
                    Cerca
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Fornitore, causale, rif…"
                        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                </label>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                        <Loader2 className="animate-spin" size={16} />
                        Caricamento registro…
                    </div>
                ) : (
                    <table className="w-full text-left text-sm min-w-[960px]">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-3 py-2.5 font-bold">Data</th>
                                <th className="px-3 py-2.5 font-bold">Dir.</th>
                                <th className="px-3 py-2.5 font-bold">Categoria</th>
                                <th className="px-3 py-2.5 font-bold">Descrizione</th>
                                <th className="px-3 py-2.5 font-bold text-right">Imponibile</th>
                                <th className="px-3 py-2.5 font-bold text-right">IVA</th>
                                <th className="px-3 py-2.5 font-bold text-right">Totale</th>
                                <th className="px-3 py-2.5 font-bold">Riconciliazione</th>
                                <th className="px-3 py-2.5 font-bold">Doc</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                                        Nessuna voce. Clicca «Allinea da fonti» per popolare il registro da
                                        ordini, Fineco, SDI e SaaS.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50/80">
                                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600">
                                            {String(r.accountingDate).slice(0, 10)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span
                                                className={`text-[10px] font-bold uppercase ${
                                                    r.direction === 'ENTRATA'
                                                        ? 'text-emerald-700'
                                                        : 'text-rose-700'
                                                }`}
                                            >
                                                {r.direction}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-[11px] text-slate-600">
                                            <div className="flex flex-col gap-1">
                                                <span>{r.category}</span>
                                                {(r.category === 'SPESE_SAAS' ||
                                                    /AUTOFATTURA|TD17|TD18|TD19/i.test(
                                                        `${r.description} ${r.documentRef || ''} ${r.sourceType}`
                                                    )) && (
                                                    <span className="inline-flex w-fit px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-800 border border-indigo-200">
                                                        Autofattura Estera (TD17/TD18)
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 max-w-[280px]">
                                            <p className="truncate font-medium text-slate-800" title={r.description}>
                                                {r.description}
                                            </p>
                                            <p className="text-[11px] text-slate-400 truncate">
                                                {r.counterpartyName || r.sourceType}
                                            </p>
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono text-xs">
                                            €{euro(r.netCents)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono text-xs">
                                            €{euro(r.vatCents)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold">
                                            €{euro(r.totalCents)}
                                        </td>
                                        <td className="px-3 py-2.5 text-[10px] uppercase text-slate-500">
                                            {r.reconciliationStatus}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {r.attachmentUrl ? (
                                                <a
                                                    href={r.attachmentUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[11px] text-teal-700 font-semibold"
                                                >
                                                    <ExternalLink size={12} />
                                                    File
                                                </a>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">
                                                    {r.documentRef || '—'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
            <p className="text-[11px] text-slate-400">
                {total} voci totali (mostrate {rows.length}). Le registrazioni non vengono mai cancellate al
                cambio filtro o nuovo upload.
            </p>
        </div>
    );
}

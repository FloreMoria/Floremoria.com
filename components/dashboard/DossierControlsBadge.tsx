'use client';

/**
 * Badge persistente C1–C12 in Contabilità (METODO §5).
 * Mostra l’ultima esecuzione registrata; non ricalcola al page load.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { readActivePrimaNotaPeriod } from '@/lib/financial/trimestreLabel';

type ControlRow = {
    id: string;
    name: string;
    measured: number;
    expected: number;
    delta: number;
    unit: 'cents' | 'rows' | 'count' | string;
    passed: boolean;
    verifiable?: boolean;
    detail?: string;
};

function formatMeasured(c: ControlRow): string {
    if (!Number.isFinite(c.measured)) return 'n/d';
    if (c.unit === 'cents') {
        return (
            (c.measured / 100).toLocaleString('it-IT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }) + ' €'
        );
    }
    return String(c.measured);
}

function formatRanAt(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function DossierControlsBadge() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [passed, setPassed] = useState(0);
    const [total, setTotal] = useState(12);
    const [failedCount, setFailedCount] = useState(0);
    const [notVerifiableCount, setNotVerifiableCount] = useState(0);
    const [periodLabel, setPeriodLabel] = useState('');
    const [controls, setControls] = useState<ControlRow[]>([]);
    const [open, setOpen] = useState(false);
    const [stale, setStale] = useState(false);
    const [ranAt, setRanAt] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [source, setSource] = useState<'persisted' | 'fresh' | 'none' | string>('none');

    const load = useCallback(async (refresh = false) => {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const { year, queryValue } = readActivePrimaNotaPeriod();
            const qs = new URLSearchParams({
                year: String(year),
                period: queryValue,
            });
            if (refresh) qs.set('refresh', '1');
            const res = await fetch(`/api/dashboard/finance/dossier-controls?${qs}`, {
                cache: 'no-store',
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                passed?: number;
                total?: number;
                failedCount?: number;
                notVerifiableCount?: number;
                periodLabel?: string;
                controls?: ControlRow[];
                stale?: boolean;
                ranAt?: string | null;
                message?: string;
                source?: string;
            }>(res);
            if (!parsed.ok || !parsed.data?.ok) {
                throw new Error(parsed.error || parsed.data?.error || 'Controlli non disponibili');
            }
            setPassed(parsed.data.passed ?? 0);
            setTotal(parsed.data.total ?? 12);
            setFailedCount(parsed.data.failedCount ?? 0);
            setNotVerifiableCount(parsed.data.notVerifiableCount ?? 0);
            setPeriodLabel(parsed.data.periodLabel || '');
            setControls(parsed.data.controls || []);
            setStale(Boolean(parsed.data.stale));
            setRanAt(parsed.data.ranAt ?? null);
            setMessage(parsed.data.message || null);
            setSource(parsed.data.source || 'none');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore controlli');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void load(false);
    }, [load]);

    const failed = controls.filter((c) => c.verifiable !== false && !c.passed);
    const allOk = !loading && !error && failedCount === 0 && source !== 'none';
    const busy = loading || refreshing;

    return (
        <div
            className={`rounded-2xl border px-4 py-3 shadow-sm ${
                allOk && !stale
                    ? 'border-emerald-200 bg-emerald-50/80'
                    : error || source === 'none'
                      ? 'border-amber-200 bg-amber-50/80'
                      : stale
                        ? 'border-amber-200 bg-amber-50/70'
                        : 'border-rose-200 bg-rose-50/70'
            }`}
        >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                    {busy ? (
                        <Loader2 className="shrink-0 mt-0.5 animate-spin text-slate-500" size={20} />
                    ) : allOk && !stale ? (
                        <CheckCircle2 className="shrink-0 mt-0.5 text-emerald-700" size={20} />
                    ) : (
                        <ShieldAlert className="shrink-0 mt-0.5 text-rose-700" size={20} />
                    )}
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Controlli di quadratura · METODO §5
                            {periodLabel ? ` · ${periodLabel}` : ''}
                        </p>
                        <p className="text-sm font-bold text-slate-900">
                            {busy
                                ? refreshing
                                    ? 'Esecuzione controlli…'
                                    : 'Caricamento ultima misurazione…'
                                : error
                                  ? 'Controlli non disponibili'
                                  : source === 'none'
                                    ? 'Nessuna misurazione registrata'
                                    : allOk
                                      ? `${passed}/${total} VERDE — dossier quadrato`
                                      : `${passed}/${total} VERDE — scostamenti aperti`}
                        </p>
                        {ranAt && !error && (
                            <p className="text-xs text-slate-600 mt-0.5">
                                Ultima esecuzione: {formatRanAt(ranAt)}
                                {notVerifiableCount > 0
                                    ? ` · ${notVerifiableCount} non verificabili`
                                    : ''}
                            </p>
                        )}
                        {(stale || message) && !error && (
                            <p className="text-xs text-amber-800 mt-0.5 flex items-center gap-1">
                                <AlertTriangle size={12} />{' '}
                                {message || 'Misurazione non aggiornata'}
                            </p>
                        )}
                        {error && (
                            <p className="text-xs text-amber-800 mt-0.5 flex items-center gap-1">
                                <AlertTriangle size={12} /> {error}
                            </p>
                        )}
                        {!busy && !error && failed.length > 0 && (
                            <p className="text-xs text-rose-800 mt-0.5">
                                Falliti:{' '}
                                {failed.map((c) => `${c.id} (${formatMeasured(c)})`).join(' · ')}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        disabled={controls.length === 0}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {open ? 'Nascondi dettaglio' : 'Dettaglio C1–C12'}
                    </button>
                    <button
                        type="button"
                        onClick={() => void load(true)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                        Esegui controlli
                    </button>
                </div>
            </div>

            {open && controls.length > 0 && (
                <div className="mt-3 overflow-auto rounded-xl border border-white/80 bg-white/90">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                <th className="px-3 py-2 font-bold">ID</th>
                                <th className="px-3 py-2 font-bold">Controllo</th>
                                <th className="px-3 py-2 font-bold text-right">Misurato</th>
                                <th className="px-3 py-2 font-bold text-right">Atteso</th>
                                <th className="px-3 py-2 font-bold">Esito</th>
                            </tr>
                        </thead>
                        <tbody>
                            {controls.map((c) => {
                                const esito =
                                    c.verifiable === false
                                        ? 'NON VERIFICABILE'
                                        : c.passed
                                          ? 'OK'
                                          : 'FAIL';
                                return (
                                    <tr key={c.id} className="border-t border-slate-50 align-top">
                                        <td className="px-3 py-2 font-mono text-xs font-bold">
                                            {c.id}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-slate-700">
                                            <div className="font-semibold">{c.name}</div>
                                            {c.detail ? (
                                                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                                    {c.detail}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-xs">
                                            {formatMeasured(c)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-xs">
                                            0
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                                    c.verifiable === false
                                                        ? 'bg-amber-50 text-amber-900 border-amber-100'
                                                        : c.passed
                                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                                                          : 'bg-rose-50 text-rose-800 border-rose-100'
                                                }`}
                                            >
                                                {esito}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

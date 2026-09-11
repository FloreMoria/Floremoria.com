'use client';

/**
 * Lista di lavoro (NON un controllo C*): fatture fiorista da sollecitare.
 * Sempre visibile conteggio + importo; progettata per non essere vuota.
 */
import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import type { FloristInvoiceWorkList } from '@/lib/financial/floristInvoiceWorkList';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function FloristInvoiceWorkListPanel() {
    const [data, setData] = useState<FloristInvoiceWorkList | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/florist-invoice-work-list', {
                cache: 'no-store',
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                error?: string;
                data?: FloristInvoiceWorkList;
            }>(res);
            if (!parsed.ok || !parsed.data?.data) {
                throw new Error(parsed.error || 'Lista non disponibile');
            }
            setData(parsed.data.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/80">
                        Lista di lavoro · non è un controllo
                    </p>
                    <h2 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                        <ClipboardList size={18} className="text-amber-700 shrink-0" />
                        Da sollecitare — fatture fiorista mancanti
                    </h2>
                    <p className="text-xs text-slate-600 max-w-2xl">
                        Il fiorista consegna, noi paghiamo, la fattura arriva dopo. Le date non
                        devono coincidere: l&apos;aggancio è sul riferimento ordine. Questa lista
                        misura un arretrato operativo, non un errore del sistema.
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                            Da sollecitare
                        </div>
                        <div className="font-mono text-lg font-bold text-slate-900">
                            {data ? data.totalCount : '—'}
                            <span className="text-sm font-semibold text-slate-600 ml-2">
                                · €{data ? euro(data.totalAmountCents) : '—'}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="p-2 rounded-xl border border-amber-200 bg-white text-amber-800 hover:bg-amber-100"
                        title="Aggiorna"
                    >
                        {loading ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    {error}
                </p>
            )}

            {loading && !data ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-6 justify-center">
                    <Loader2 size={18} className="animate-spin" /> Caricamento…
                </div>
            ) : data && data.rows.length === 0 ? (
                <p className="text-sm text-slate-600 py-2">
                    Nessuna fattura da sollecitare al momento (lista vuota — eccezione, non la
                    norma).
                </p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-amber-100 bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-amber-50/80 text-[10px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-3 py-2 font-bold">Fiorista</th>
                                <th className="text-left px-3 py-2 font-bold">Ordini</th>
                                <th className="text-right px-3 py-2 font-bold">Importo pagato</th>
                                <th className="text-right px-3 py-2 font-bold">Giorni dal pagamento</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.rows.map((r) => (
                                <tr
                                    key={r.partnerId || r.floristName}
                                    className="border-t border-slate-100"
                                >
                                    <td className="px-3 py-2 font-medium text-slate-900">
                                        {r.floristName}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                                        {r.orderNumbers.join(', ')}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">
                                        €{euro(r.amountPaidCents)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold text-amber-900">
                                        {r.daysSincePayment}
                                        <span className="block text-[10px] font-normal text-slate-400">
                                            dal {r.oldestPaymentDate}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

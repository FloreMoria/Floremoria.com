'use client';

/**
 * Tabella estratto conto stile home banking: solo movimenti Fineco reali + paste manuali.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { formatFinanceDate } from '@/lib/financial/formatFinanceDate';

type MovementLine = {
    id: string;
    documentId: string;
    accountingDate: string | null;
    valueDate: string | null;
    description: string;
    amountCents: number;
    balanceCents: number | null;
    matchType: string | null;
    matchStatus?: string;
    fileName: string | null;
    matchedOrderId: string | null;
};

function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function categoryLabel(matchType: string | null | undefined, amountCents: number): string {
    const t = (matchType || '').toUpperCase();
    if (t.includes('FLORIST')) return 'Compenso fiorista';
    if (t.includes('STRIPE') || t.includes('PAYPAL') || t.includes('GATEWAY')) return 'Incasso gateway';
    if (t.includes('SDI') || t.includes('INVOICE')) return 'Fattura / fornitore';
    if (t.includes('FEE') || t.includes('BANK')) return 'Oneri bancari';
    if (t.includes('INTERNAL') || t.includes('TRANSFER')) return 'Giroconto';
    if (t.includes('SAAS') || t.includes('SUBSCRIPTION')) return 'Canone / SaaS';
    if (t.includes('CASH')) return 'Spesa documentata';
    return amountCents >= 0 ? 'Entrata' : 'Uscita';
}

function originBadge(fileName: string | null | undefined): { label: string; className: string } {
    const n = (fileName || '').toLowerCase();
    if (n.includes('paste') || n.includes('incolla') || n.includes('manual')) {
        return {
            label: 'Inserimento Manuale',
            className: 'bg-violet-50 text-violet-800 border-violet-100',
        };
    }
    return {
        label: 'Estratto Conto Fineco',
        className: 'bg-sky-50 text-sky-800 border-sky-100',
    };
}

type Props = { searchTerm?: string };

export default function BankMovementsStatementTable({ searchTerm = '' }: Props) {
    const [lines, setLines] = useState<MovementLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const year = new Date().getFullYear();

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/dashboard/finance/bank-statements?view=movements&year=${year}`
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                lines?: MovementLine[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Caricamento movimenti fallito');
            setLines(parsed.data?.lines || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento');
            setLines([]);
        } finally {
            setLoading(false);
        }
    }, [year]);

    useEffect(() => {
        void load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        let rows = [...lines];
        if (q) {
            rows = rows.filter(
                (l) =>
                    l.description.toLowerCase().includes(q) ||
                    (l.fileName || '').toLowerCase().includes(q) ||
                    (l.matchType || '').toLowerCase().includes(q) ||
                    String(Math.abs(l.amountCents) / 100).includes(q)
            );
        }
        rows.sort((a, b) => {
            const da = a.accountingDate || a.valueDate || '';
            const db = b.accountingDate || b.valueDate || '';
            if (da !== db) return da.localeCompare(db);
            return a.id.localeCompare(b.id);
        });
        return rows;
    }, [lines, searchTerm]);

    const withRunningBalance = useMemo(() => {
        let running = 0;
        const hasAnyBalance = filtered.some((l) => l.balanceCents != null);
        return filtered.map((l) => {
            if (hasAnyBalance && l.balanceCents != null) {
                running = l.balanceCents;
                return { ...l, progressiveCents: l.balanceCents };
            }
            running += l.amountCents;
            return { ...l, progressiveCents: running };
        });
    }, [filtered]);

    const displayRows = useMemo(() => [...withRunningBalance].reverse(), [withRunningBalance]);

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={16} />
                Caricamento estratto conto Fineco…
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="px-4 pt-3 flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                    Solo movimenti reali da estratti Fineco e inserimenti manuali · anno {year} ·{' '}
                    {displayRows.length} righe
                </p>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                >
                    <RefreshCw size={12} />
                    Aggiorna
                </button>
            </div>
            {error && (
                <div className="mx-4 text-xs bg-rose-50 border border-rose-100 text-rose-700 rounded-xl px-3 py-2">
                    {error}
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="px-4 py-3">Data Contabile</th>
                            <th className="px-4 py-3">Data Valuta</th>
                            <th className="px-4 py-3">Descrizione / Causale</th>
                            <th className="px-4 py-3">Categoria</th>
                            <th className="px-4 py-3 text-right">Entrate</th>
                            <th className="px-4 py-3 text-right">Uscite</th>
                            <th className="px-4 py-3 text-right">Saldo</th>
                            <th className="px-4 py-3">Origine</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                        {displayRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={8}
                                    className="px-4 py-10 text-center text-slate-400 italic"
                                >
                                    Nessun movimento bancario reale. Carica o incolla un estratto
                                    Fineco nel pannello sopra.
                                </td>
                            </tr>
                        ) : (
                            displayRows.map((line) => {
                                const origin = originBadge(line.fileName);
                                const credit = line.amountCents > 0 ? line.amountCents : 0;
                                const debit =
                                    line.amountCents < 0 ? Math.abs(line.amountCents) : 0;
                                return (
                                    <tr key={line.id} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                                            {formatFinanceDate(line.accountingDate)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                                            {formatFinanceDate(line.valueDate)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-800 max-w-[360px]">
                                            <p
                                                className="text-sm leading-snug line-clamp-2"
                                                title={line.description}
                                            >
                                                {line.description}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                                {categoryLabel(line.matchType, line.amountCents)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-emerald-700 whitespace-nowrap">
                                            {credit > 0 ? `+€${euro(credit)}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-rose-700 whitespace-nowrap">
                                            {debit > 0 ? `−€${euro(debit)}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                                            €{euro(line.progressiveCents)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${origin.className}`}
                                            >
                                                {origin.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

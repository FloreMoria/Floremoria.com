'use client';

/**
 * Estratto conto compensi fiorista dal Registro Storico Permanente.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { formatFinanceDate } from '@/lib/financial/formatFinanceDate';
import { labelReconciliationStatusIt } from '@/lib/financial/fiscalItalianLabels';

type Props = { partnerId: string };

export default function PartnerHistoricalLedgerSnippet({ partnerId }: Props) {
    const [rows, setRows] = useState<
        Array<{
            id: string;
            accountingDate: string;
            description: string;
            totalCents: number;
            reconciliationStatus: string;
            category: string;
        }>
    >([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/dashboard/finance/historical-ledger?view=partner&partnerId=${encodeURIComponent(partnerId)}&take=30`
                );
                const parsed = await readJsonResponse<{
                    ok?: boolean;
                    rows?: Array<{
                        id: string;
                        accountingDate: string;
                        description: string;
                        totalCents: number;
                        reconciliationStatus: string;
                        category: string;
                    }>;
                }>(res);
                if (!cancelled) setRows(parsed.data?.rows || []);
            } catch {
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [partnerId]);

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800">Estratto Conto Contabile</h4>
                <a
                    href="/dashboard/finance"
                    className="text-[11px] font-semibold text-teal-700 hover:underline"
                >
                    Apri Archivio Storico →
                </a>
            </div>
            {loading ? (
                <p className="text-xs text-slate-400 inline-flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Caricamento…
                </p>
            ) : rows.length === 0 ? (
                <p className="text-xs text-slate-400">
                    Nessuna voce nel registro. Allinea il registro da Contabilità → Archivio Storico.
                </p>
            ) : (
                <ul className="divide-y divide-slate-100 text-xs">
                    {rows.slice(0, 8).map((r) => (
                        <li key={r.id} className="py-2 flex justify-between gap-2">
                            <div className="min-w-0">
                                <p className="truncate font-medium text-slate-800">{r.description}</p>
                                <p className="text-slate-400">
                                    {formatFinanceDate(r.accountingDate)} · {r.category} ·{' '}
                                    {labelReconciliationStatusIt(r.reconciliationStatus)}
                                </p>
                            </div>
                            <span className="font-mono font-semibold text-slate-700 shrink-0">
                                €{(r.totalCents / 100).toFixed(2)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

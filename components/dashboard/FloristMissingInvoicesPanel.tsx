'use client';

/**
 * Alert Contabilità: fioristi pagati senza fattura ricevuta entro 15 giorni.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    Link2,
    Loader2,
    Mail,
    MessageCircle,
    RefreshCw,
} from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

export type FloristMissingInvoiceRow = {
    id: string;
    partnerId: string | null;
    partnerName: string;
    partnerVat: string | null;
    partnerEmail: string | null;
    partnerWhatsapp: string | null;
    paymentDate: string;
    amountCents: number;
    daysSincePayment: number;
    bankLineId: string | null;
    orderId: string | null;
    orderNumber: string | null;
    description: string;
    severity: 'warning' | 'critical';
    statusLabel: string;
};

type Props = {
    onLinkInvoice?: (prefill: {
        vendorName: string;
        totalEuro: string;
        expenseDate: string;
        notes?: string;
    }) => void;
};

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function FloristMissingInvoicesPanel({ onLinkInvoice }: Props) {
    const [rows, setRows] = useState<FloristMissingInvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/florist-missing-invoices');
            const parsed = await readJsonResponse<{
                ok?: boolean;
                rows?: FloristMissingInvoiceRow[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Caricamento fallito');
            setRows(parsed.data?.rows || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore caricamento');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const remind = async (row: FloristMissingInvoiceRow, channel: 'email' | 'whatsapp' | 'both') => {
        setBusyId(`${row.id}-${channel}`);
        setFlash(null);
        try {
            const res = await fetch('/api/dashboard/finance/florist-missing-invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'remind',
                    channel,
                    rowId: row.id,
                    partnerId: row.partnerId,
                    partnerEmail: row.partnerEmail,
                    partnerWhatsapp: row.partnerWhatsapp,
                    partnerName: row.partnerName,
                    amountCents: row.amountCents,
                    paymentDate: row.paymentDate,
                    daysSincePayment: row.daysSincePayment,
                    orderNumber: row.orderNumber,
                }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                message?: string;
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Sollecito fallito');
            setFlash(parsed.data?.message || 'Sollecito inviato');
        } catch (e) {
            setFlash(e instanceof Error ? e.message : 'Sollecito fallito');
        } finally {
            setBusyId(null);
        }
    };

    const critical = rows.filter((r) => r.severity === 'critical').length;

    return (
        <div className="space-y-3">
            {rows.length > 0 && (
                <div
                    className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${
                        critical > 0
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                >
                    <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                    <div className="text-sm">
                        <p className="font-semibold">
                            Fatture Fioristi Mancanti dopo il pagamento
                        </p>
                        <p className="text-xs mt-0.5 opacity-90">
                            {rows.length} bonifici/compensi senza fattura ricevuta entro 15 giorni
                            {critical > 0 ? ` · ${critical} oltre soglia critica (≥15 gg)` : ''}.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="ml-auto p-2 rounded-xl hover:bg-white/50 text-inherit"
                        title="Aggiorna"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            )}

            {flash && (
                <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700">
                    {flash}
                </div>
            )}
            {error && (
                <div className="text-xs bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 text-rose-700">
                    {error}
                </div>
            )}

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                    <Loader2 className="animate-spin" size={16} />
                    Analisi pagamenti fioristi…
                </div>
            ) : rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                    Nessun fiorista in attesa di fattura. Tutti i pagamenti hanno un match entro 15 giorni.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-4 py-3 font-bold">Fiorista & P.IVA</th>
                                <th className="px-4 py-3 font-bold">Data bonifico</th>
                                <th className="px-4 py-3 font-bold text-right">Importo</th>
                                <th className="px-4 py-3 font-bold">Giorni</th>
                                <th className="px-4 py-3 font-bold">Stato</th>
                                <th className="px-4 py-3 font-bold text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-50/80">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-900">{row.partnerName}</p>
                                        <p className="text-[11px] text-slate-500 font-mono">
                                            {row.partnerVat || 'P.IVA n/d'}
                                        </p>
                                        {row.orderNumber && (
                                            <p className="text-[11px] text-slate-400">
                                                Ordine {row.orderNumber}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                        {row.paymentDate}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                                        €{euro(row.amountCents)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">{row.daysSincePayment}</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                                row.severity === 'critical'
                                                    ? 'bg-rose-100 text-rose-800'
                                                    : 'bg-amber-100 text-amber-800'
                                            }`}
                                        >
                                            {row.statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                            <button
                                                type="button"
                                                disabled={!!busyId || !row.partnerEmail}
                                                title={
                                                    row.partnerEmail
                                                        ? 'Invia sollecito email'
                                                        : 'Email assente'
                                                }
                                                onClick={() => void remind(row, 'email')}
                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-700 hover:bg-white disabled:opacity-40"
                                            >
                                                {busyId === `${row.id}-email` ? (
                                                    <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                    <Mail size={12} />
                                                )}
                                                Email
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!!busyId || !row.partnerWhatsapp}
                                                title={
                                                    row.partnerWhatsapp
                                                        ? 'Invia sollecito WhatsApp'
                                                        : 'WhatsApp assente'
                                                }
                                                onClick={() => void remind(row, 'whatsapp')}
                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-700 hover:bg-white disabled:opacity-40"
                                            >
                                                {busyId === `${row.id}-whatsapp` ? (
                                                    <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                    <MessageCircle size={12} />
                                                )}
                                                WhatsApp
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onLinkInvoice?.({
                                                        vendorName: row.partnerName,
                                                        totalEuro: (row.amountCents / 100).toFixed(2),
                                                        expenseDate: row.paymentDate,
                                                        notes: `Collegamento manuale pagamento ${row.id}`,
                                                    })
                                                }
                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wide hover:bg-slate-800"
                                            >
                                                <Link2 size={12} />
                                                Collega fattura
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

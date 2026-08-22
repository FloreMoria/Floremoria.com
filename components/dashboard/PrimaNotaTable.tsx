'use client';

/**
 * Scritture di Prima Nota da dati reali (ledger bonificato + Registro Neon).
 * Gerarchia fiscale: banca/gateway prevalgono su ordini web/manuali.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { readJsonResponse } from '@/lib/http/readJsonResponse';
import { formatFinanceDate, isFinanceSeedEntryId } from '@/lib/financial/formatFinanceDate';
import { applyFiscalAuthorityHierarchy } from '@/lib/financial/fiscalAuthorityDedupe';
import type { AccountingEntry } from '@/lib/financial/types';

type NeonRow = {
    id: string;
    accountingDate: string;
    description: string;
    sourceType: string;
    sourceId: string;
    sourceKey?: string | null;
    documentRef?: string | null;
    orderId?: string | null;
    totalCents: number;
    netCents: number;
    vatCents: number;
    category: string;
    direction: string;
    metadataJson?: {
        dareAccount?: string;
        avereAccount?: string;
        stripeTransactionId?: string;
        [key: string]: unknown;
    } | null;
};

type DisplayEntry = {
    id: string;
    date: string;
    description: string;
    dareAccount: string;
    avereAccount: string;
    amountCents: number;
    sourceLabel: string;
};

function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function accountsFromNeon(r: NeonRow): { dare: string; avere: string } {
    const meta = r.metadataJson || {};
    if (meta.dareAccount && meta.avereAccount) {
        return { dare: String(meta.dareAccount), avere: String(meta.avereAccount) };
    }
    const bank = '10100 - Banca Fineco';
    if (r.direction === 'ENTRATA' || r.totalCents > 0) {
        return { dare: bank, avere: accountForCategory(r.category, true) };
    }
    return { dare: accountForCategory(r.category, false), avere: bank };
}

function accountForCategory(category: string, revenueSide: boolean): string {
    switch (category) {
        case 'RICAVI_VENDITE':
        case 'ALTRI_RICAVI':
            return '60100 - Ricavi da Vendite';
        case 'COSTI_FIORISTI':
            return '70100 - Costi Fioristi';
        case 'SPESE_SAAS':
            return '70300 - Software SaaS';
        case 'ONERI_BANCARI':
            return '70200 - Commissioni / Oneri bancari';
        default:
            return revenueSide ? '60900 - Altri ricavi' : '70900 - Spese operative';
    }
}

function sourceLabel(sourceType: string): string {
    switch (sourceType) {
        case 'ORDER':
            return 'Ordine web';
        case 'STRIPE_MOVEMENT':
        case 'PAYPAL_MOVEMENT':
            return 'Incasso gateway';
        case 'FLORIST_PAYOUT':
            return 'Compenso fiorista';
        case 'BANK_LINE':
            return 'Movimento bancario';
        case 'SAAS_INVOICE':
        case 'MANUAL_EXPENSE':
            return 'Fattura / spesa';
        case 'JSON_ENTRY':
            return 'Prima Nota';
        default:
            return sourceType || 'Registro';
    }
}

type Props = {
    localEntries: AccountingEntry[];
    searchTerm?: string;
};

export default function PrimaNotaTable({ localEntries, searchTerm = '' }: Props) {
    const [neonRows, setNeonRows] = useState<NeonRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const year = new Date().getFullYear();
            const res = await fetch(
                `/api/dashboard/finance/historical-ledger?year=${year}&take=500&direction=ALL&category=ALL`
            );
            const parsed = await readJsonResponse<{
                ok?: boolean;
                rows?: NeonRow[];
                error?: string;
            }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Caricamento fallito');
            setNeonRows(parsed.data?.rows || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore');
            setNeonRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const rows: DisplayEntry[] = useMemo(() => {
        const cleanedNeon = neonRows.filter((r) => {
            if (r.sourceType === 'CUSTOMER_RECEIPT') return false;
            if (r.sourceType === 'JSON_ENTRY' && isFinanceSeedEntryId(r.sourceId || '')) return false;
            return true;
        });

        // Dedup già lato API; ricalcolo locale per sicurezza e per escludere JSON locali duplicati
        const fiscalRows = applyFiscalAuthorityHierarchy(
            cleanedNeon.map((r) => ({
                id: r.id,
                sourceType: r.sourceType,
                sourceId: r.sourceId,
                sourceKey: r.sourceKey,
                orderId: r.orderId,
                documentRef: r.documentRef,
                accountingDate: r.accountingDate,
                totalCents: r.totalCents,
                direction: r.direction,
                category: r.category,
                metadataJson: r.metadataJson,
            }))
        );
        const keepNeonIds = new Set(fiscalRows.map((r) => r.id).filter(Boolean) as string[]);

        const map = new Map<string, DisplayEntry>();

        for (const r of cleanedNeon) {
            if (!keepNeonIds.has(r.id)) continue;
            const accounts = accountsFromNeon(r);
            map.set(r.id, {
                id: r.id,
                date: String(r.accountingDate).slice(0, 10),
                description: r.description,
                dareAccount: accounts.dare,
                avereAccount: accounts.avere,
                amountCents: Math.abs(r.totalCents || r.netCents || 0),
                sourceLabel: sourceLabel(r.sourceType),
            });
        }

        const combinedForLocalFilter = applyFiscalAuthorityHierarchy([
            ...fiscalRows,
            ...localEntries
                .filter((e) => !isFinanceSeedEntryId(e.id))
                .map((e) => ({
                    id: e.id,
                    sourceType: 'JSON_ENTRY' as const,
                    sourceId: e.id,
                    sourceKey: `JSON_ENTRY:${e.id}`,
                    accountingDate: e.date,
                    totalCents: e.amountCents,
                    direction: 'ENTRATA' as const,
                    category: 'RICAVI_VENDITE',
                    metadataJson: null,
                })),
        ]);
        const keepLocalIds = new Set(
            combinedForLocalFilter
                .filter((r) => r.sourceType === 'JSON_ENTRY')
                .map((r) => r.id)
                .filter(Boolean) as string[]
        );

        for (const e of localEntries) {
            if (isFinanceSeedEntryId(e.id)) continue;
            if (!keepLocalIds.has(e.id)) continue;
            if (map.has(e.id)) continue;
            map.set(e.id, {
                id: e.id,
                date: e.date,
                description: e.description,
                dareAccount: e.dareAccount,
                avereAccount: e.avereAccount,
                amountCents: e.amountCents,
                sourceLabel: 'Prima Nota',
            });
        }

        let list = Array.from(map.values());
        const q = searchTerm.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (e) =>
                    e.description.toLowerCase().includes(q) ||
                    e.dareAccount.toLowerCase().includes(q) ||
                    e.avereAccount.toLowerCase().includes(q) ||
                    e.id.toLowerCase().includes(q)
            );
        }
        list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
        return list;
    }, [localEntries, neonRows, searchTerm]);

    if (loading && rows.length === 0) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={16} />
                Caricamento scritture reali…
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="px-4 pt-3 flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                    Solo scritture reali (gateway/banca prioritari; ordini esclusi se già
                    incassati) · {rows.length} voci
                </p>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600"
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
                <table className="w-full text-left border-collapse min-w-[960px]">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="px-5 py-3">Data</th>
                            <th className="px-5 py-3">Numero / ID</th>
                            <th className="px-5 py-3">Descrizione / Causale</th>
                            <th className="px-5 py-3">Conto Dare</th>
                            <th className="px-5 py-3">Conto Avere</th>
                            <th className="px-5 py-3 text-right">Importo (€)</th>
                            <th className="px-5 py-3">Fonte</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                        {rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={7}
                                    className="px-5 py-10 text-center text-slate-400 italic"
                                >
                                    Nessuna scrittura contabile reale. Allinea l&apos;Archivio
                                    Storico o importa fatture/gateway.
                                </td>
                            </tr>
                        ) : (
                            rows.map((entry) => (
                                <tr key={entry.id} className="hover:bg-slate-50/50">
                                    <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                                        {formatFinanceDate(entry.date)}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-700">
                                            <FileText size={11} />
                                            {entry.id.length > 18
                                                ? `${entry.id.slice(0, 8)}…${entry.id.slice(-6)}`
                                                : entry.id}
                                        </span>
                                    </td>
                                    <td
                                        className="px-5 py-3.5 font-medium text-slate-800 max-w-[280px] truncate"
                                        title={entry.description}
                                    >
                                        {entry.description}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-slate-600">
                                        {entry.dareAccount}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-slate-600">
                                        {entry.avereAccount}
                                    </td>
                                    <td className="px-5 py-3.5 font-bold font-mono text-right text-slate-950">
                                        €{euro(entry.amountCents)}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                            {entry.sourceLabel}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

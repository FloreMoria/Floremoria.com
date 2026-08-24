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
        displayFonte?: string;
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
    /** true = entrata/ricavo (verde); false = uscita/costo (rosso) */
    isEntrata: boolean;
    sourceLabel: string;
};

function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatSignedAmount(cents: number, isEntrata: boolean): {
    text: string;
    className: string;
} {
    const signed = isEntrata ? Math.abs(cents) : -Math.abs(cents);
    const sign = signed >= 0 ? '+' : '−';
    return {
        text: `${sign}€ ${euro(signed)}`,
        className: isEntrata ? 'text-emerald-700' : 'text-rose-700',
    };
}

function isEntrataFromNeon(r: NeonRow): boolean {
    if (r.direction === 'ENTRATA') return true;
    if (r.direction === 'USCITA') return false;
    return r.totalCents > 0;
}

/** Dare su cassa/banca ⇒ entrata di liquidità (verde). */
function isEntrataFromLocal(dareAccount: string, avereAccount: string): boolean {
    const dare = dareAccount.toLowerCase();
    const avere = avereAccount.toLowerCase();
    if (/banca|cassa|10100|10200/.test(dare)) return true;
    if (/banca|cassa|10100|10200/.test(avere)) return false;
    if (/ricav|60100|60900/.test(avere)) return true;
    if (/cost|spes|70100|70200|70300|70900/.test(dare)) return false;
    return true;
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
        case 'TRASFERIMENTO_INTERNO':
        case 'PAYPAL_PAYOUT':
            return '17100 - Conto transitorio Gateway (giroconto)';
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

const FONTE_OPTIONS = [
    'Gateway',
    'SDI',
    'Fineco',
    'Manuale',
    'Ordine web',
    'Compenso fiorista',
    'Fattura / spesa',
    'Prima Nota',
] as const;

function sourceLabel(sourceType: string, displayFonte?: string | null): string {
    if (displayFonte) return displayFonte;
    switch (sourceType) {
        case 'ORDER':
            return 'Ordine web';
        case 'STRIPE_MOVEMENT':
        case 'PAYPAL_MOVEMENT':
            return 'Gateway';
        case 'FLORIST_PAYOUT':
            return 'Compenso fiorista';
        case 'BANK_LINE':
            return 'Fineco';
        case 'SAAS_INVOICE':
        case 'MANUAL_EXPENSE':
            return 'SDI';
        case 'JSON_ENTRY':
            return 'Manuale';
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
    const [fonteOverrides, setFonteOverrides] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingFonteId, setEditingFonteId] = useState<string | null>(null);

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

    const saveFonte = async (entryId: string, fonteLabel: string) => {
        try {
            const res = await fetch('/api/dashboard/finance/historical-ledger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_fonte',
                    entryId,
                    fonteLabel,
                }),
            });
            const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
            if (!parsed.ok) throw new Error(parsed.error || 'Salvataggio fallito');
            setFonteOverrides((prev) => ({ ...prev, [entryId]: fonteLabel }));
            setNeonRows((prev) =>
                prev.map((r) =>
                    r.id === entryId
                        ? {
                              ...r,
                              metadataJson: {
                                  ...(r.metadataJson || {}),
                                  displayFonte: fonteLabel,
                              },
                          }
                        : r
                )
            );
            setEditingFonteId(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore salvataggio fonte');
        }
    };

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
                isEntrata: isEntrataFromNeon(r),
                sourceLabel: sourceLabel(
                    r.sourceType,
                    fonteOverrides[r.id] ||
                        (typeof r.metadataJson?.displayFonte === 'string'
                            ? r.metadataJson.displayFonte
                            : null)
                ),
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
                isEntrata: isEntrataFromLocal(e.dareAccount, e.avereAccount),
                sourceLabel: fonteOverrides[e.id] || 'Manuale',
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
    }, [localEntries, neonRows, searchTerm, fonteOverrides]);

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
                <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="px-5 py-3">Data</th>
                            <th className="px-5 py-3">Numero / ID</th>
                            <th className="px-5 py-3 min-w-[280px]">Descrizione / Causale</th>
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
                            rows.map((entry) => {
                                const amount = formatSignedAmount(
                                    entry.amountCents,
                                    entry.isEntrata
                                );
                                return (
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
                                        className="px-5 py-3.5 font-medium text-slate-800 min-w-[280px] max-w-[420px] whitespace-normal break-words"
                                        title={entry.description}
                                    >
                                        {entry.description}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                                        {entry.dareAccount}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                                        {entry.avereAccount}
                                    </td>
                                    <td
                                        className={`px-5 py-3.5 font-bold font-mono text-right whitespace-nowrap ${amount.className}`}
                                    >
                                        {amount.text}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {editingFonteId === entry.id ? (
                                            <select
                                                autoFocus
                                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700"
                                                value={entry.sourceLabel}
                                                onChange={(e) =>
                                                    void saveFonte(entry.id, e.target.value)
                                                }
                                                onBlur={() => setEditingFonteId(null)}
                                            >
                                                {FONTE_OPTIONS.map((f) => (
                                                    <option key={f} value={f}>
                                                        {f}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setEditingFonteId(entry.id)}
                                                className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-600"
                                                title="Modifica fonte"
                                            >
                                                {entry.sourceLabel}
                                            </button>
                                        )}
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

'use client';

/**
 * Tabella unificata Stripe + PayPal: date reali, dedupe, filtri, colonne complete.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, Search } from 'lucide-react';
import {
    formatGatewayDateTime,
    type GatewaySyncRow,
    type MovementKind,
} from '@/lib/financial/gatewaySyncRows';

type GatewayFilter = 'all' | 'stripe' | 'paypal';
type TypeFilter = 'all' | 'incasso' | 'commissione' | 'payout' | 'rimborso';

type Props = {
    refreshToken?: number;
};

function euro(cents: number): string {
    const sign = cents < 0 ? '−' : '';
    return `${sign}€${(Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function gatewayBadgeClass(code: string): string {
    if (code === 'EU') return 'bg-amber-50 text-amber-800 border-amber-200';
    if (code === 'COM') return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    if (code === 'PAYPAL') return 'bg-sky-50 text-sky-800 border-sky-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
}

function movementBadgeClass(kind: MovementKind): string {
    switch (kind) {
        case 'incasso':
            return 'bg-emerald-50 text-emerald-800 border-emerald-200';
        case 'commissione':
            return 'bg-orange-50 text-orange-800 border-orange-200';
        case 'payout':
            return 'bg-violet-50 text-violet-800 border-violet-200';
        case 'rimborso':
            return 'bg-rose-50 text-rose-800 border-rose-200';
        case 'riserva':
            return 'bg-slate-100 text-slate-700 border-slate-300';
        default:
            return 'bg-slate-50 text-slate-600 border-slate-200';
    }
}

function CopyIdButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            title="Copia ID"
            onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(value).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                });
            }}
            className="inline-flex items-center justify-center p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
            {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
        </button>
    );
}

export default function GatewaySyncTable({ refreshToken = 0 }: Props) {
    const [rows, setRows] = useState<GatewaySyncRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [gatewayFilter, setGatewayFilter] = useState<GatewayFilter>('all');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/sync/gateways');
            const data = (await res.json()) as {
                ok?: boolean;
                rows?: GatewaySyncRow[];
                error?: string;
            };
            if (!data.ok) throw new Error(data.error || 'Caricamento fallito');
            setRows(data.rows || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load, refreshToken]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (gatewayFilter === 'stripe' && r.gateway !== 'stripe') return false;
            if (gatewayFilter === 'paypal' && r.gateway !== 'paypal') return false;
            if (typeFilter !== 'all' && r.movementKind !== typeFilter) return false;
            if (!q) return true;
            const hay = [
                r.transactionId,
                r.description,
                r.customerName,
                r.customerEmail,
                r.reference,
                r.accountLabel,
                r.movementLabel,
                euro(r.grossCents),
                euro(r.netCents),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [rows, gatewayFilter, typeFilter, search]);

    const filterBtn = (active: boolean) =>
        `px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
            active
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }`;

    return (
        <div className="space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                        Gateway
                    </span>
                    {(
                        [
                            ['all', 'Tutti'],
                            ['stripe', 'Stripe'],
                            ['paypal', 'PayPal'],
                        ] as const
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setGatewayFilter(k)}
                            className={filterBtn(gatewayFilter === k)}
                        >
                            {label}
                        </button>
                    ))}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-2 mr-1">
                        Tipo
                    </span>
                    {(
                        [
                            ['all', 'Tutti'],
                            ['incasso', 'Incassi'],
                            ['commissione', 'Commissioni'],
                            ['payout', 'Payout'],
                            ['rimborso', 'Rimborsi'],
                        ] as const
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setTypeFilter(k)}
                            className={filterBtn(typeFilter === k)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 lg:w-56">
                        <Search
                            size={12}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cerca ID, cliente, importo…"
                            className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        disabled={loading}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <RefreshCw size={12} />
                        )}
                        Aggiorna
                    </button>
                </div>
            </div>

            <p className="text-[10px] text-slate-500">
                {filtered.length} movimenti
                {filtered.length !== rows.length ? ` (filtro su ${rows.length})` : ''} · Stripe COM +
                EU + PayPal
            </p>

            {error && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-[520px] overflow-y-auto [scrollbar-width:thin]">
                <table className="w-full text-left text-[11px] min-w-[1100px]">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                        <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                            <th className="px-3 py-2.5 font-bold whitespace-nowrap">Data &amp; Ora</th>
                            <th className="px-3 py-2.5 font-bold">Gateway / Account</th>
                            <th className="px-3 py-2.5 font-bold">Tipo movimento</th>
                            <th className="px-3 py-2.5 font-bold min-w-[180px]">
                                Descrizione / Cliente / Riferimento
                            </th>
                            <th className="px-3 py-2.5 font-bold">ID Transazione</th>
                            <th className="px-3 py-2.5 font-bold text-right">Lordo</th>
                            <th className="px-3 py-2.5 font-bold text-right">Fee</th>
                            <th className="px-3 py-2.5 font-bold text-right">Netto</th>
                            <th className="px-3 py-2.5 font-bold">Stato &amp; Fonte</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                                    <Loader2 size={16} className="inline animate-spin mr-2" />
                                    Caricamento movimenti gateway…
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-3 py-10 text-center text-slate-400 italic">
                                    Nessun movimento con i filtri selezionati. Sincronizza Stripe/PayPal
                                    o carica un CSV PayPal.
                                </td>
                            </tr>
                        ) : (
                            filtered.map((r) => (
                                <tr
                                    key={r.id}
                                    className="border-t border-slate-50 hover:bg-slate-50/80 align-top"
                                >
                                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-700">
                                        {formatGatewayDateTime(r.occurredAt)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span
                                            className={`inline-flex px-1.5 py-0.5 rounded border font-bold text-[10px] ${gatewayBadgeClass(r.accountCode)}`}
                                        >
                                            {r.accountLabel}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span
                                            className={`inline-flex px-1.5 py-0.5 rounded border font-bold text-[10px] ${movementBadgeClass(r.movementKind)}`}
                                        >
                                            {r.movementLabel}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="font-medium text-slate-800 line-clamp-2">
                                            {r.description}
                                        </div>
                                        {(r.customerName || r.customerEmail) && (
                                            <div className="text-[10px] text-slate-500 mt-0.5">
                                                {[r.customerName, r.customerEmail]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </div>
                                        )}
                                        {r.reference && (
                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                Rif. {r.reference}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="inline-flex items-center gap-1 max-w-[140px]">
                                            <span
                                                className="font-mono text-[10px] text-slate-700 truncate"
                                                title={r.transactionId}
                                            >
                                                {r.transactionId}
                                            </span>
                                            <CopyIdButton value={r.transactionId} />
                                        </div>
                                    </td>
                                    <td
                                        className={`px-3 py-2.5 text-right font-mono whitespace-nowrap ${
                                            r.grossCents > 0
                                                ? 'text-emerald-700'
                                                : r.grossCents < 0
                                                  ? 'text-rose-700'
                                                  : 'text-slate-600'
                                        }`}
                                    >
                                        {euro(r.grossCents)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap text-orange-700">
                                        {r.feeCents > 0 ? euro(-r.feeCents) : '—'}
                                    </td>
                                    <td
                                        className={`px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap ${
                                            r.netCents >= 0 ? 'text-slate-900' : 'text-rose-700'
                                        }`}
                                    >
                                        {euro(r.netCents)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="text-[10px] font-semibold text-slate-700">
                                            {r.statusLabel}
                                        </div>
                                        <div className="text-[10px] text-slate-400">{r.sourceLabel}</div>
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

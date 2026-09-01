'use client';

/**
 * Tabella unificata Stripe + PayPal — vista semplificata per ordine + log tecnico opzionale.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, Search } from 'lucide-react';
import {
    formatGatewayDateTime,
    type GatewaySyncGroupedRow,
    type GatewaySyncRow,
    type MovementKind,
} from '@/lib/financial/gatewaySyncRows';
import {
    formatQuadraturaEuro,
    type GatewayQuadraturaResult,
    type GatewayWalletQuadratura,
} from '@/lib/financial/gatewayQuadratura';

type GatewayFilter = 'all' | 'stripe' | 'paypal';
type TypeFilter = 'all' | 'incasso' | 'commissione' | 'payout' | 'rimborso' | 'altro';

type Props = {
    refreshToken?: number;
};

function euro(cents: number): string {
    const abs = (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    if (cents < 0) return `−€${abs}`;
    if (cents > 0) return `+€${abs}`;
    return `€${abs}`;
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

function movementEmoji(kind: MovementKind, label: string): string {
    if (kind === 'incasso') return `🟢 ${label}`;
    if (kind === 'payout') return `🟣 ${label}`;
    if (kind === 'rimborso') return `🔴 ${label}`;
    if (kind === 'commissione' || kind === 'altro' || kind === 'riserva') return `⚪ ${label}`;
    return label;
}

function QuadraturaCard({ q, title }: { q: GatewayWalletQuadratura; title: string }) {
    const ok = q.isQuadrato;
    return (
        <div
            className={`rounded-xl border p-4 space-y-3 ${
                ok ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/50'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <h5 className="text-sm font-bold text-slate-900">{title}</h5>
                <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border ${
                        ok
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-amber-100 text-amber-900 border-amber-200'
                    }`}
                >
                    {ok ? 'Quadrato' : 'Scarto'}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <span className="text-slate-500">Entrate (lordo incassi)</span>
                <span className="text-right font-mono font-semibold text-emerald-800">
                    +{formatQuadraturaEuro(q.entrateLordoCents)}
                </span>
                <span className="text-slate-500">Commissioni gateway</span>
                <span className="text-right font-mono text-orange-800">
                    −{formatQuadraturaEuro(q.commissioniCents)}
                </span>
                <span className="text-slate-500">Payout → banca</span>
                <span className="text-right font-mono text-violet-800">
                    −{formatQuadraturaEuro(q.payoutCents)}
                </span>
                {q.payoutFinecoCents !== q.payoutCents ? (
                    <>
                        <span className="text-slate-500">Payout abbinati Fineco</span>
                        <span className="text-right font-mono text-violet-900 font-semibold">
                            −{formatQuadraturaEuro(q.payoutFinecoCents)}
                        </span>
                    </>
                ) : null}
                <span className="text-slate-500">Rimborsi</span>
                <span className="text-right font-mono text-rose-800">
                    −{formatQuadraturaEuro(q.rimborsiCents)}
                </span>
                <span className="text-slate-500">Spese SaaS / carta / altro</span>
                <span className="text-right font-mono text-slate-800">
                    −{formatQuadraturaEuro(q.speseCents)}
                </span>
                <span className="text-slate-700 font-semibold border-t border-slate-200 pt-1">
                    Totale uscite
                </span>
                <span className="text-right font-mono font-semibold text-slate-900 border-t border-slate-200 pt-1">
                    −{formatQuadraturaEuro(q.totaleUsciteCents)}
                </span>
                <span className="text-slate-700 font-semibold">Saldo teorico (E − U)</span>
                <span className="text-right font-mono font-bold text-slate-900">
                    {formatQuadraturaEuro(q.saldoTeoricoCents)}
                </span>
                <span className="text-slate-500">Σ movimenti netti</span>
                <span className="text-right font-mono text-slate-700">
                    {formatQuadraturaEuro(q.saldoNettoMovimentiCents)}
                </span>
                {q.residuoStripeCents != null ? (
                    <>
                        <span className="text-slate-700 font-semibold border-t border-slate-200 pt-1">
                            Residuo Stripe (vs Fineco)
                        </span>
                        <span
                            className={`text-right font-mono font-bold border-t border-slate-200 pt-1 ${
                                Math.abs(q.residuoStripeCents) <= 100
                                    ? 'text-emerald-800'
                                    : 'text-amber-900'
                            }`}
                        >
                            {formatQuadraturaEuro(q.residuoStripeCents)}
                        </span>
                    </>
                ) : null}
            </div>
            {q.bankMatch ? (
                <p className="text-[10px] text-slate-600 leading-relaxed">
                    Fineco gateway: {q.bankMatch.matchCount} payout abbinati
                    {q.bankMatch.unmatchedPayoutCount > 0
                        ? ` · ${q.bankMatch.unmatchedPayoutCount} payout senza banca`
                        : ''}
                    {q.bankMatch.unmatchedBankCount > 0
                        ? ` · ${q.bankMatch.unmatchedBankCount} accrediti senza payout API`
                        : ''}
                    .
                </p>
            ) : null}
            {!ok ? (
                <p className="text-[10px] text-amber-900 leading-relaxed">
                    Scarto formula: {formatQuadraturaEuro(q.quadraturaScartoCents)}
                    {q.residuoStripeCents != null &&
                    Math.abs(q.residuoStripeCents) > 100
                        ? ` · residuo Stripe/Fineco: ${formatQuadraturaEuro(q.residuoStripeCents)}`
                        : ''}
                    {q.walletScartoCents != null
                        ? ` · vs saldo API: ${formatQuadraturaEuro(q.walletScartoCents)}`
                        : ''}
                    . Verifica sync, CSV PayPal o movimenti mancanti.
                </p>
            ) : (
                <p className="text-[10px] text-emerald-800">
                    Entrate e uscite (fee, payout, spese) tornano a zero nel periodo sincronizzato.
                </p>
            )}
            <p className="text-[9px] text-slate-400">{q.rowCount} movimenti deduplicati</p>
        </div>
    );
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

function TechIdsBadge({ ids }: { ids: string[] }) {
    if (!ids.length) return <span className="text-slate-400">—</span>;
    const primary = ids[0];
    const rest = ids.slice(1);
    return (
        <div className="flex flex-col gap-0.5">
            <span
                className="inline-flex items-center gap-1 max-w-[120px] font-mono text-[9px] text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-0.5 truncate"
                title={ids.join('\n')}
            >
                {primary}
                <CopyIdButton value={primary} />
            </span>
            {rest.length > 0 && (
                <span className="text-[9px] text-slate-400" title={rest.join('\n')}>
                    +{rest.length} ID
                </span>
            )}
        </div>
    );
}

export default function GatewaySyncTable({ refreshToken = 0 }: Props) {
    const [rows, setRows] = useState<GatewaySyncRow[]>([]);
    const [quadratura, setQuadratura] = useState<GatewayQuadraturaResult | null>(null);
    const [groupedRows, setGroupedRows] = useState<GatewaySyncGroupedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [gatewayFilter, setGatewayFilter] = useState<GatewayFilter>('all');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [search, setSearch] = useState('');
    const [simplifiedView, setSimplifiedView] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/sync/gateways');
            const data = (await res.json()) as {
                ok?: boolean;
                rows?: GatewaySyncRow[];
                groupedRows?: GatewaySyncGroupedRow[];
                quadratura?: GatewayQuadraturaResult;
                error?: string;
            };
            if (!data.ok) throw new Error(data.error || 'Caricamento fallito');
            setRows(data.rows || []);
            setGroupedRows(data.groupedRows || []);
            setQuadratura(data.quadratura || null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Errore');
            setRows([]);
            setGroupedRows([]);
            setQuadratura(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load, refreshToken]);

    const filteredGrouped = useMemo(() => {
        const q = search.trim().toLowerCase();
        return groupedRows.filter((r) => {
            if (simplifiedView && r.eventKind === 'technical') return false;
            if (gatewayFilter === 'stripe' && r.gateway !== 'stripe') return false;
            if (gatewayFilter === 'paypal' && r.gateway !== 'paypal') return false;
            if (typeFilter !== 'all' && r.movementKind !== typeFilter) return false;
            if (!q) return true;
            const hay = [
                r.orderNumber,
                r.customerName,
                r.customerEmail,
                r.description,
                r.movementLabel,
                ...r.transactionIds,
                euro(r.grossCents),
                euro(r.netCents),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [groupedRows, gatewayFilter, typeFilter, search, simplifiedView]);

    const filteredTechnical = useMemo(() => {
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
                r.orderNumber,
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

    const visibleCount = simplifiedView ? filteredGrouped.length : filteredTechnical.length;
    const totalCount = simplifiedView ? groupedRows.length : rows.length;

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
                            ['commissione', 'Fee'],
                            ['payout', 'Payout'],
                            ['rimborso', 'Rimborsi'],
                            ['altro', 'Spese'],
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
                <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-slate-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!simplifiedView}
                            onChange={(e) => setSimplifiedView(!e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        Mostra log grezzi di riconciliazione
                    </label>
                    <div className="relative flex-1 lg:w-56">
                        <Search
                            size={12}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cerca ordine, cliente, importo…"
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
                {visibleCount} {simplifiedView ? 'eventi' : 'movimenti'}
                {visibleCount !== totalCount ? ` (filtro su ${totalCount})` : ''} ·{' '}
                {simplifiedView
                    ? 'Vista semplificata per ordine/payout/rimborso'
                    : 'Vista tecnica completa (ogni riga gateway)'}
            </p>

            {error && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}

            {quadratura ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <QuadraturaCard q={quadratura.stripe} title="Quadratura Stripe (solo commissioni + payout)" />
                    <QuadraturaCard
                        q={quadratura.paypal}
                        title="Quadratura PayPal (fee, payout, SaaS, carta)"
                    />
                </div>
            ) : null}

            <div className="dashboard-table-scroll overflow-x-auto rounded-xl border border-slate-100 max-h-[520px] overflow-y-auto [scrollbar-width:thin]">
                {simplifiedView ? (
                    <table className="w-full text-left text-[11px] min-w-[980px]">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                            <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                <th className="px-3 py-2.5 font-bold whitespace-nowrap">Data</th>
                                <th className="px-3 py-2.5 font-bold">Gateway</th>
                                <th className="px-3 py-2.5 font-bold">Tipo</th>
                                <th className="px-3 py-2.5 font-bold min-w-[220px]">Ordine / Cliente</th>
                                <th className="px-3 py-2.5 font-bold text-right">Lordo</th>
                                <th className="px-3 py-2.5 font-bold text-right">Fee tot.</th>
                                <th className="px-3 py-2.5 font-bold text-right">Netto</th>
                                <th className="px-3 py-2.5 font-bold">ID tecnici</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && groupedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                                        <Loader2 size={16} className="inline animate-spin mr-2" />
                                        Caricamento…
                                    </td>
                                </tr>
                            ) : filteredGrouped.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-3 py-10 text-center text-slate-400 italic">
                                        Nessun evento con i filtri selezionati.
                                    </td>
                                </tr>
                            ) : (
                                filteredGrouped.map((r) => (
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
                                                {movementEmoji(r.movementKind, r.movementLabel)}
                                            </span>
                                            {r.rawRowCount > 1 && (
                                                <div className="text-[9px] text-slate-400 mt-0.5">
                                                    {r.rawRowCount} mov. consolidati
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {r.orderNumber && r.orderId ? (
                                                <Link
                                                    href={`/dashboard/orders?open=${encodeURIComponent(r.orderId)}`}
                                                    className="font-bold text-indigo-700 hover:underline"
                                                >
                                                    {r.orderNumber}
                                                </Link>
                                            ) : r.orderNumber ? (
                                                <span className="font-bold text-slate-800">{r.orderNumber}</span>
                                            ) : null}
                                            <div className="text-slate-700 mt-0.5 line-clamp-2">{r.description}</div>
                                            {(r.customerName || r.customerEmail) && (
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    {[r.customerName, r.customerEmail]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </div>
                                            )}
                                        </td>
                                        <td
                                            className={`px-3 py-2.5 text-right font-mono whitespace-nowrap ${
                                                r.grossCents > 0
                                                    ? 'text-emerald-800 font-semibold'
                                                    : r.grossCents < 0
                                                      ? 'text-rose-800 font-semibold'
                                                      : 'text-slate-600'
                                            }`}
                                        >
                                            {euro(r.grossCents)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap text-rose-800">
                                            {r.feeCents > 0 ? euro(-r.feeCents) : '—'}
                                        </td>
                                        <td
                                            className={`px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap ${
                                                r.netCents > 0
                                                    ? 'text-emerald-900'
                                                    : r.netCents < 0
                                                      ? 'text-rose-900'
                                                      : 'text-slate-900'
                                            }`}
                                        >
                                            {euro(r.netCents)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <TechIdsBadge ids={r.transactionIds} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                ) : (
                    <table className="w-full text-left text-[11px] min-w-[1100px]">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                            <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                <th className="px-3 py-2.5 font-bold whitespace-nowrap">Data</th>
                                <th className="px-3 py-2.5 font-bold">Gateway</th>
                                <th className="px-3 py-2.5 font-bold">Tipo</th>
                                <th className="px-3 py-2.5 font-bold min-w-[180px]">Descrizione</th>
                                <th className="px-3 py-2.5 font-bold">ID Transazione</th>
                                <th className="px-3 py-2.5 font-bold text-right">Lordo</th>
                                <th className="px-3 py-2.5 font-bold text-right">Fee</th>
                                <th className="px-3 py-2.5 font-bold text-right">Netto</th>
                                <th className="px-3 py-2.5 font-bold">Fonte</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                                        <Loader2 size={16} className="inline animate-spin mr-2" />
                                        Caricamento log grezzi…
                                    </td>
                                </tr>
                            ) : filteredTechnical.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-3 py-10 text-center text-slate-400 italic">
                                        Nessun movimento grezzo con i filtri selezionati.
                                    </td>
                                </tr>
                            ) : (
                                filteredTechnical.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="border-t border-slate-50 hover:bg-slate-50/80 align-top"
                                    >
                                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-700">
                                            {formatGatewayDateTime(r.occurredAt)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span
                                                className={`inline-flex px-1.5 py-0.5 rounded border font-bold text-[10px] ${gatewayBadgeClass(r.accountCode || (r.gateway === 'paypal' ? 'PAYPAL' : 'COM'))}`}
                                            >
                                                {r.accountLabel}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span
                                                className={`inline-flex px-1.5 py-0.5 rounded border font-bold text-[10px] ${movementBadgeClass(r.movementKind || 'altro')}`}
                                            >
                                                {movementEmoji(r.movementKind || 'altro', r.movementLabel)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {r.orderNumber && r.orderId ? (
                                                <Link
                                                    href={`/dashboard/orders?open=${encodeURIComponent(r.orderId)}`}
                                                    className="font-bold text-indigo-700 hover:underline text-[10px]"
                                                >
                                                    {r.orderNumber}
                                                </Link>
                                            ) : null}
                                            <div className="text-slate-800 line-clamp-2">{r.description}</div>
                                            {(r.customerName || r.customerEmail) && (
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    {[r.customerName, r.customerEmail]
                                                        .filter(Boolean)
                                                        .join(' · ')}
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
                                        <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                                            {euro(r.grossCents)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap text-rose-800">
                                            {r.feeCents > 0 ? euro(-r.feeCents) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap">
                                            {euro(r.netCents)}
                                        </td>
                                        <td className="px-3 py-2.5 text-[10px] text-slate-400">
                                            {r.sourceLabel}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

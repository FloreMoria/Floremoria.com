'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    DollarSign,
    TrendingUp,
    Cpu,
    CheckCircle2,
    Download,
    Plus,
    RefreshCw,
    FileJson,
    Calendar,
    AlertOctagon,
    Pencil,
    Check,
    Copy,
    Link2,
    FileWarning,
} from 'lucide-react';
import type { FinancialLedger } from '@/lib/financial/types';
import type { FinanceQuadratura } from '@/lib/financial/financeQuadratura';
import { getUpcomingDeadlines } from '@/lib/financial/compliance/deadlines';
import TaxQuarterlyPanel from './TaxQuarterlyPanel';
import BankStatementsPanel from '@/components/dashboard/BankStatementsPanel';
import SaasForeignExpensesPanel from '@/components/dashboard/SaasForeignExpensesPanel';
import ManualExpenseModal, {
    type ManualExpensePrefill,
} from '@/components/dashboard/ManualExpenseModal';
import SdiInvoicesUploadBox from '@/components/dashboard/SdiInvoicesUploadBox';
import ReceivedInvoicesXlsxUploadBox from '@/components/dashboard/ReceivedInvoicesXlsxUploadBox';
import ForeignAutofattureUploadBox from '@/components/dashboard/ForeignAutofattureUploadBox';
import PaypalCsvUploadBox from '@/components/dashboard/PaypalCsvUploadBox';
import GatewaySyncTable from '@/components/dashboard/GatewaySyncTable';
import FloristMissingInvoicesPanel from '@/components/dashboard/FloristMissingInvoicesPanel';
import HistoricalFiscalArchivePanel from '@/components/dashboard/HistoricalFiscalArchivePanel';
import BankMovementsStatementTable from '@/components/dashboard/BankMovementsStatementTable';
import PrimaNotaTable from '@/components/dashboard/PrimaNotaTable';
import { formatFinanceDate, formatFinanceDateTime } from '@/lib/financial/formatFinanceDate';
import { FLOREMORIA_FINECO_BANK, FLOREMORIA_LEGAL_ENTITY } from '@/lib/financial/companyBankDetails';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

type FinanceTab = 'bank' | 'prima-nota' | 'passivo' | 'gateway' | 'fisco';

function formatEuroCents(cents: number | null | undefined): string {
    if (cents == null || !Number.isFinite(cents)) return '—';
    return (
        (cents / 100).toLocaleString('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }) + ' €'
    );
}

export default function FinanceDashboardPage() {
    const [ledger, setLedger] = useState<FinancialLedger>({ transactions: [], accountingEntries: [] });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<FinanceTab>('bank');
    const [statements, setStatements] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [quadratura, setQuadratura] = useState<FinanceQuadratura | null>(null);
    const [ibanCopied, setIbanCopied] = useState(false);
    const [bicCopied, setBicCopied] = useState(false);
    const [exportingLedger, setExportingLedger] = useState(false);

    // Gateways live status
    const [gatewayData, setGatewayData] = useState<any>(null);
    const [loadingGateways, setLoadingGateways] = useState(true);
    const [syncingStripe, setSyncingStripe] = useState(false);
    const [syncingPaypal, setSyncingPaypal] = useState(false);
    const [stripeSyncMeta, setStripeSyncMeta] = useState<{
        lastSyncAt?: string | null;
        recordCount?: number;
        movements?: any[];
    } | null>(null);
    const [paypalSyncMeta, setPaypalSyncMeta] = useState<{
        lastSyncAt?: string | null;
        recordCount?: number;
        transactions?: any[];
    } | null>(null);
    const [gatewaySyncMsg, setGatewaySyncMsg] = useState<string | null>(null);
    const [gatewayTableRefresh, setGatewayTableRefresh] = useState(0);

    // Compliance state
    const [complianceFilter, setComplianceFilter] = useState<'ALL' | 'FISC' | 'ESTER' | 'CORP'>('ALL');

    // Saldo Fineco manuale (SystemState) + drawer SaaS
    const [manualBalanceCents, setManualBalanceCents] = useState<number | null>(null);
    const [manualBalanceAlignedAt, setManualBalanceAlignedAt] = useState<string | null>(null);
    const [editingBalance, setEditingBalance] = useState(false);
    const [balanceDraft, setBalanceDraft] = useState('');
    const [savingBalance, setSavingBalance] = useState(false);
    const [saasDrawerOpen, setSaasDrawerOpen] = useState(false);
    const [saasTotalCents, setSaasTotalCents] = useState(0);
    const [manualExpenseOpen, setManualExpenseOpen] = useState(false);
    const [manualExpensePrefill, setManualExpensePrefill] = useState<ManualExpensePrefill | null>(null);

    // Caricamento dati
    const loadLedger = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/dashboard/finance');
            const parsed = await readJsonResponse<{
                ok?: boolean;
                ledger?: FinancialLedger;
                statements?: unknown;
                finecoBalance?: { balanceCents: number; alignedAt: string } | null;
                saasTotalEurCents?: number;
                quadratura?: FinanceQuadratura;
                error?: string;
            }>(res);
            if (parsed.ok && parsed.data) {
                if (parsed.data.ledger) setLedger(parsed.data.ledger);
                if (parsed.data.statements) setStatements(parsed.data.statements);
                if (parsed.data.finecoBalance) {
                    setManualBalanceCents(parsed.data.finecoBalance.balanceCents);
                    setManualBalanceAlignedAt(parsed.data.finecoBalance.alignedAt);
                }
                if (typeof parsed.data.saasTotalEurCents === 'number') {
                    setSaasTotalCents(parsed.data.saasTotalEurCents);
                }
                if (parsed.data.quadratura) setQuadratura(parsed.data.quadratura);
            } else if (parsed.error) {
                console.error('Errore di caricamento ledger:', parsed.error);
            }
        } catch (error) {
            console.error('Errore di caricamento ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadGateways = async () => {
        setLoadingGateways(true);
        try {
            const res = await fetch('/api/dashboard/finance/gateways');
            const data = await res.json();
            if (data.ok) {
                setGatewayData(data);
            }
            const [st, pp] = await Promise.all([
                fetch('/api/dashboard/finance/sync/stripe').then((r) => r.json()).catch(() => null),
                fetch('/api/dashboard/finance/sync/paypal').then((r) => r.json()).catch(() => null),
            ]);
            if (st?.ok) {
                setStripeSyncMeta({
                    lastSyncAt: st.lastSyncAt,
                    recordCount: st.recordCount,
                    movements: st.movements,
                });
            }
            if (pp?.ok) {
                setPaypalSyncMeta({
                    lastSyncAt: pp.lastSyncAt,
                    recordCount: pp.recordCount,
                    transactions: pp.transactions,
                });
            }
        } catch (error) {
            console.error('Errore di caricamento dati gateway:', error);
        } finally {
            setLoadingGateways(false);
        }
    };

    const runStripeSync = async () => {
        setSyncingStripe(true);
        setGatewaySyncMsg(null);
        try {
            const res = await fetch('/api/dashboard/finance/sync/stripe', { method: 'POST' });
            const data = await res.json();
            if (!data.ok && !data.movementsUpserted) {
                throw new Error(data.error || data.errors?.[0] || 'Sync Stripe fallita');
            }
                                            setGatewaySyncMsg(
                                                `Stripe: ${data.movementsUpserted ?? 0} movimenti · ${data.payoutsUpserted ?? 0} payout` +
                                                    (Array.isArray(data.accountsSynced)
                                                        ? ` · account: ${data.accountsSynced
                                                              .map(
                                                                  (a: { label: string; movementsUpserted: number }) =>
                                                                      `${a.label} (${a.movementsUpserted})`
                                                              )
                                                              .join(', ')}`
                                                        : '') +
                                                    ` · ${data.recordCount ?? 0} record dal 01/01/2026`
                                            );
            await loadGateways();
            setGatewayTableRefresh((n) => n + 1);
        } catch (e) {
            setGatewaySyncMsg(e instanceof Error ? e.message : 'Sync Stripe fallita');
        } finally {
            setSyncingStripe(false);
        }
    };

    const runPaypalSync = async () => {
        setSyncingPaypal(true);
        setGatewaySyncMsg(null);
        try {
            const res = await fetch('/api/dashboard/finance/sync/paypal', { method: 'POST' });
            const data = await res.json();
            if (data.apiForbidden) {
                setGatewaySyncMsg(
                    data.error ||
                        'La sincronizzazione in tempo reale è attiva tramite Webhook. Per caricare lo storico pregresso utilizza l\'upload del file CSV.'
                );
                return;
            }
            if (!data.ok && !(data.transactionsUpserted > 0)) {
                throw new Error(data.error || data.errors?.[0] || 'Sync PayPal fallita');
            }
            setGatewaySyncMsg(
                `PayPal: ${data.transactionsUpserted ?? 0} tx · ${data.feesUpserted ?? 0} fee · ${data.recordCount ?? 0} in cache`
            );
            await loadGateways();
            await loadLedger();
            setGatewayTableRefresh((n) => n + 1);
        } catch (e) {
            setGatewaySyncMsg(e instanceof Error ? e.message : 'Sync PayPal fallita');
        } finally {
            setSyncingPaypal(false);
        }
    };

    useEffect(() => {
        void loadLedger();
        void loadGateways();
    }, []);

    const handleSetDeadlineStatus = async (
        deadlineId: string,
        status: 'PENDING' | 'DUE_SOON' | 'PAID' | 'ARCHIVED' | 'SCADUTO'
    ) => {
        try {
            const res = await fetch('/api/dashboard/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_deadline_status',
                    deadlineId,
                    status,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setLedger(data.ledger);
                if (data.statements) setStatements(data.statements);
            }
        } catch (error) {
            console.error('Errore aggiornamento stato scadenza:', error);
        }
    };

    // Date Contabilità: rigorosamente GG/MM/AAAA (mai ISO / medium / anglosassone)
    const formatDate = (dateStr?: string) => formatFinanceDate(dateStr);
    const formatDateTime = (dateStr?: string) => formatFinanceDateTime(dateStr);

    // Calcolo scadenze: insoluti (SCADUTO) restano visibili; solo ARCHIVED nascosti.
    const allDeadlines = React.useMemo(() => {
        return getUpcomingDeadlines(
            ledger?.completedDeadlineIds || [],
            ledger?.deadlineStatusById || {}
        ).filter((item) => item.uiStatus !== 'ARCHIVED');
    }, [ledger?.completedDeadlineIds, ledger?.deadlineStatusById]);

    const urgentDeadlines = React.useMemo(() => {
        // Imminenti (0–10 gg) + insoluti (SCADUTO) in evidenza
        return allDeadlines
            .filter(
                (item) =>
                    item.uiStatus === 'SCADUTO' ||
                    (item.status === 'URGENT' && item.daysRemaining >= 0 && item.daysRemaining <= 10)
            )
            .sort((a, b) => a.daysRemaining - b.daysRemaining);
    }, [allDeadlines]);

    const filteredDeadlines = React.useMemo(() => {
        return allDeadlines.filter(item => {
            // Elenco attivo scadenziario: da 01/07/2026
            if (item.dueDate < '2026-07-01') return false;
            if (complianceFilter === 'ALL') return true;
            if (complianceFilter === 'FISC') {
                return (
                    item.category === 'IVA' ||
                    item.category === 'F24' ||
                    item.category === 'CONTABILITA'
                );
            }
            if (complianceFilter === 'ESTER') return item.category === 'ESTEROMETRO';
            if (complianceFilter === 'CORP') return item.category === 'BILANCIO' || item.category === 'STARTUP_INNOVATIVA' || item.category === 'DICHIARATIVI';
            return true;
        });
    }, [allDeadlines, complianceFilter]);

    const copyFinecoIban = async () => {
        try {
            await navigator.clipboard.writeText(FLOREMORIA_FINECO_BANK.iban);
            setIbanCopied(true);
            window.setTimeout(() => setIbanCopied(false), 2000);
        } catch (err) {
            console.error('Copia IBAN fallita:', err);
            alert('Impossibile copiare l\'IBAN');
        }
    };

    const copyFinecoBic = async () => {
        try {
            await navigator.clipboard.writeText(FLOREMORIA_FINECO_BANK.bicSwift);
            setBicCopied(true);
            window.setTimeout(() => setBicCopied(false), 2000);
        } catch (err) {
            console.error('Copia BIC fallita:', err);
            alert('Impossibile copiare il BIC/SWIFT');
        }
    };

    // Export Neon historical ledger (Prima Nota)
    const handleExportHistoricalCSV = async () => {
        setExportingLedger(true);
        try {
            const year = new Date().getFullYear();
            const res = await fetch(
                `/api/dashboard/finance/historical-ledger/export?format=csv&year=${year}`
            );
            if (!res.ok) throw new Error('Export CSV fallito');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `libro-giornale-${year}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Export CSV fallito');
        } finally {
            setExportingLedger(false);
        }
    };

    const handleExportHistoricalJSON = async () => {
        setExportingLedger(true);
        try {
            const year = new Date().getFullYear();
            const res = await fetch(
                `/api/dashboard/finance/historical-ledger?year=${year}&take=5000`
            );
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Export JSON fallito');
            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `libro-giornale-${year}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Export JSON fallito');
        } finally {
            setExportingLedger(false);
        }
    };

    // Statistiche residuali per blocchi CE/SP (tab fisco)
    const stats = React.useMemo(() => {
        let balanceCents = 0;
        let incomeCents = 0;

        const transactions = ledger?.transactions || [];

        for (const tx of transactions) {
            balanceCents += tx.amountCents;
            if (tx.amountCents > 0) {
                incomeCents += tx.amountCents;
            }
        }

        const displayBalanceCents =
            manualBalanceCents != null ? manualBalanceCents : balanceCents;

        return {
            balance: (displayBalanceCents / 100).toFixed(2),
            income: (incomeCents / 100).toFixed(2),
        };
    }, [ledger, manualBalanceCents]);

    const saveManualBalance = async () => {
        const euros = Number(String(balanceDraft).replace(',', '.'));
        if (!Number.isFinite(euros)) return;
        setSavingBalance(true);
        try {
            const res = await fetch('/api/dashboard/finance/fineco-balance', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ balanceEuros: euros }),
            });
            const parsed = await readJsonResponse<{
                ok?: boolean;
                balance?: { balanceCents: number; alignedAt: string };
                error?: string;
            }>(res);
            if (!parsed.ok || !parsed.data?.balance) {
                throw new Error(parsed.error || 'Salvataggio fallito');
            }
            setManualBalanceCents(parsed.data.balance.balanceCents);
            setManualBalanceAlignedAt(parsed.data.balance.alignedAt);
            setEditingBalance(false);
            await loadLedger();
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Salvataggio saldo fallito');
        } finally {
            setSavingBalance(false);
        }
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-4 md:p-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
                <div>
                    <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
                        Gestione Finanziaria e Prima Nota AI
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Entrate da Stripe/PayPal, uscite fioristi e spese documentate — riconciliazione su upload estratto Fineco.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setManualExpensePrefill(null);
                            setManualExpenseOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#c5a880] hover:bg-[#b8976c] text-white rounded-xl transition-colors text-sm font-semibold"
                    >
                        <Plus size={16} />
                        Registra Spesa / Documento
                    </button>
                    <button
                        type="button"
                        onClick={() => void loadLedger()}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-sm font-semibold"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Sincronizza
                    </button>
                    <Link
                        href="/dashboard/fornitori"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors text-sm font-semibold"
                    >
                        Gestione Fornitori
                    </Link>
                </div>
            </div>

            {/* Riquadro Fineco + dati societari */}
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Fineco e IBAN · Dati societari
                        </p>
                        <h3 className="text-base font-display font-bold text-slate-900">
                            {FLOREMORIA_LEGAL_ENTITY.legalName}
                        </h3>
                        <p className="text-sm text-slate-600">
                            Sede legale: {FLOREMORIA_LEGAL_ENTITY.registeredOffice}
                        </p>
                        <p className="text-xs text-slate-500">
                            P.IVA / C.F. {FLOREMORIA_LEGAL_ENTITY.vatNumber} · REA{' '}
                            {FLOREMORIA_LEGAL_ENTITY.reaNumber} · Capitale sociale{' '}
                            {FLOREMORIA_LEGAL_ENTITY.shareCapital}
                        </p>
                        <p className="text-xs text-slate-500">
                            Codice SDI:{' '}
                            <span className="font-mono font-semibold text-slate-800">
                                {FLOREMORIA_LEGAL_ENTITY.sdiCode}
                            </span>
                        </p>
                    </div>
                    <div className="shrink-0 font-mono text-sm space-y-2 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 min-w-[260px]">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                                Istituto
                            </span>
                            <div className="font-semibold text-slate-900 font-sans">
                                {FLOREMORIA_FINECO_BANK.institute}
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                                IBAN
                            </span>
                            <div className="font-semibold text-slate-900 tracking-wide">
                                {FLOREMORIA_FINECO_BANK.ibanDisplay}
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                                BIC / SWIFT
                            </span>
                            <div className="text-slate-800">
                                {FLOREMORIA_FINECO_BANK.bicSepa}{' '}
                                <span className="text-slate-400">(SEPA)</span> ·{' '}
                                {FLOREMORIA_FINECO_BANK.bicSwift}{' '}
                                <span className="text-slate-400">(SWIFT)</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {editingBalance ? (
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500">Saldo Fineco</span>
                            <input
                                autoFocus
                                value={balanceDraft}
                                onChange={(e) => setBalanceDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void saveManualBalance();
                                    if (e.key === 'Escape') setEditingBalance(false);
                                }}
                                className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm font-mono"
                            />
                            <button
                                type="button"
                                disabled={savingBalance}
                                onClick={() => void saveManualBalance()}
                                className="p-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                                title="Salva"
                            >
                                <Check size={14} />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setBalanceDraft(stats.balance);
                                setEditingBalance(true);
                            }}
                            className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-slate-800 hover:bg-slate-50 rounded-lg px-2 py-1 border border-slate-100"
                            title="Modifica saldo Fineco"
                        >
                            {formatEuroCents(manualBalanceCents)}
                            <Pencil size={12} className="text-slate-400" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => void copyFinecoIban()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                        <Copy size={13} />
                        {ibanCopied ? 'IBAN copiato!' : 'Copia IBAN'}
                    </button>
                    <button
                        type="button"
                        onClick={() => void copyFinecoBic()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                        <Copy size={13} />
                        {bicCopied ? 'BIC copiato!' : 'Copia BIC/SWIFT'}
                    </button>
                </div>
            </div>

            {/* Fascia di quadratura — 3 controlli */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Differenza Saldo Banca
                    </span>
                    {quadratura?.isBalanceSquared ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold">
                            <CheckCircle2 size={16} />
                            0,00 € Quadrato
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span
                                className={`text-xl font-bold font-mono ${
                                    (quadratura?.balanceDiffCents ?? 0) === 0
                                        ? 'text-slate-900'
                                        : 'text-amber-700'
                                }`}
                            >
                                {formatEuroCents(quadratura?.balanceDiffCents ?? null)}
                            </span>
                            {!editingBalance && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBalanceDraft(stats.balance);
                                        setEditingBalance(true);
                                    }}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                                    title="Allinea saldo manuale"
                                >
                                    <Pencil size={14} />
                                </button>
                            )}
                        </div>
                    )}
                    <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                        Reale {formatEuroCents(quadratura?.realBalanceCents ?? manualBalanceCents)} · Libro{' '}
                        {formatEuroCents(quadratura?.calculatedBalanceCents ?? null)}
                        {quadratura?.openingBalanceCents != null ? (
                            <>
                                <br />
                                Apertura {formatEuroCents(quadratura.openingBalanceCents)}
                                {quadratura.statementClosingCents != null
                                    ? ` · Ultima chiusura ${formatEuroCents(quadratura.statementClosingCents)}`
                                    : ''}
                            </>
                        ) : null}
                    </p>
                    {quadratura?.realBalanceAlignedAt || manualBalanceAlignedAt ? (
                        <p className="text-[10px] text-slate-400">
                            Reale allineato{' '}
                            {new Date(
                                quadratura?.realBalanceAlignedAt || manualBalanceAlignedAt || ''
                            ).toLocaleString('it-IT')}
                        </p>
                    ) : null}
                </div>

                <button
                    type="button"
                    onClick={() => setActiveTab('bank')}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left hover:border-[#c5a880] hover:ring-2 hover:ring-[#c5a880]/20 transition-all"
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Link2 size={12} />
                        Movimenti da Riconciliare
                    </span>
                    <p className="mt-1 text-2xl font-bold font-mono text-slate-900">
                        {quadratura?.unmatchedTotal ?? '—'}
                    </p>
                    <span className="text-[10px] text-[#c5a880] font-semibold">Apri tab Banca →</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('passivo')}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left hover:border-[#c5a880] hover:ring-2 hover:ring-[#c5a880]/20 transition-all"
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <FileWarning size={12} />
                        Documenti Mancanti
                    </span>
                    <p className="mt-1 text-2xl font-bold font-mono text-slate-900">
                        {quadratura?.missingDocuments ?? '—'}
                    </p>
                    <span className="text-[10px] text-[#c5a880] font-semibold">Apri tab Passivo →</span>
                </button>
            </div>

            <SaasForeignExpensesPanel
                open={saasDrawerOpen}
                onClose={() => setSaasDrawerOpen(false)}
                onTotalsChange={setSaasTotalCents}
            />
            <ManualExpenseModal
                open={manualExpenseOpen}
                prefill={manualExpensePrefill}
                onClose={() => {
                    setManualExpenseOpen(false);
                    setManualExpensePrefill(null);
                }}
                onSaved={() => void loadLedger()}
            />

            {/* 5 tab Contabilità */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/50">
                    {(
                        [
                            ['bank', 'Banca Fineco'],
                            ['prima-nota', 'Prima Nota'],
                            ['passivo', 'Passivo / Documenti'],
                            ['gateway', 'Stripe & PayPal'],
                            ['fisco', 'Fisco & Scadenze'],
                        ] as const
                    ).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveTab(id)}
                            className={`flex-1 min-w-[120px] py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                                activeTab === id
                                    ? 'border-[#c5a880] text-slate-900 bg-white'
                                    : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {activeTab === 'bank' && (
                    <div className="p-4 space-y-4">
                        <BankStatementsPanel variant="tab1" />
                        <div className="border-t border-slate-100 pt-4 space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <h4 className="text-sm font-bold text-slate-800">
                                    Movimenti estratto conto
                                </h4>
                                <input
                                    type="text"
                                    placeholder="Cerca causale, beneficiario, importo…"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full max-w-md px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm focus:border-[#c5a880] focus:ring-1 focus:ring-[#c5a880] transition-all"
                                />
                            </div>
                            <BankMovementsStatementTable searchTerm={searchTerm} />
                        </div>
                    </div>
                )}

                {activeTab === 'prima-nota' && (
                    <div>
                        <div className="p-4 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
                            <input
                                type="text"
                                placeholder="Cerca per descrizione, conto o riferimenti…"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full max-w-md px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm focus:border-[#c5a880] focus:ring-1 focus:ring-[#c5a880] transition-all"
                            />
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={exportingLedger}
                                    onClick={() => void handleExportHistoricalCSV()}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors text-sm font-semibold disabled:opacity-50"
                                >
                                    <Download size={16} />
                                    Esporta CSV
                                </button>
                                <button
                                    type="button"
                                    disabled={exportingLedger}
                                    onClick={() => void handleExportHistoricalJSON()}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors text-sm font-semibold disabled:opacity-50"
                                >
                                    <FileJson size={16} />
                                    Esporta JSON
                                </button>
                            </div>
                        </div>
                        <PrimaNotaTable
                            localEntries={ledger?.accountingEntries || []}
                            searchTerm={searchTerm}
                        />
                    </div>
                )}

                {activeTab === 'passivo' && (
                    <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                            <SdiInvoicesUploadBox onImported={() => void loadLedger()} />
                            <ReceivedInvoicesXlsxUploadBox onImported={() => void loadLedger()} />
                            <ForeignAutofattureUploadBox onImported={() => void loadLedger()} />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSaasDrawerOpen(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-sm font-semibold hover:bg-blue-100"
                            >
                                Gestione SaaS / Spese estere
                                {saasTotalCents > 0 && (
                                    <span className="font-mono text-xs">
                                        ({formatEuroCents(saasTotalCents)})
                                    </span>
                                )}
                            </button>
                        </div>
                        <FloristMissingInvoicesPanel
                            onLinkInvoice={(prefill) => {
                                setManualExpensePrefill({
                                    vendorName: prefill.vendorName,
                                    totalEuro: prefill.totalEuro,
                                    expenseDate: prefill.expenseDate,
                                    notes: prefill.notes,
                                });
                                setManualExpenseOpen(true);
                            }}
                        />
                    </div>
                )}

                {activeTab === 'gateway' && (
                    <div className="p-6 space-y-8 bg-white">
                        {loadingGateways || !gatewayData ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
                                <RefreshCw className="animate-spin mb-3 text-[#c5a880]" size={36} />
                                <p className="text-sm font-medium">Connessione ai gateway di pagamento in corso...</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                            <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                Stripe Real-time Balance
                                            </h4>
                                            <span className="text-[10px] font-bold uppercase bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-lg">Attivo</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-50 p-4 rounded-xl">
                                                <span className="text-xs text-slate-400 font-semibold block">Disponibile per payout</span>
                                                <span className="text-xl font-bold font-mono text-slate-900 block mt-1">
                                                    €{(gatewayData.stripe.balance.availableCents / 100).toFixed(2)}
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-4 rounded-xl">
                                                <span className="text-xs text-slate-400 font-semibold block">In elaborazione</span>
                                                <span className="text-xl font-bold font-mono text-slate-500 block mt-1">
                                                    €{(gatewayData.stripe.balance.pendingCents / 100).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                            <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${gatewayData.paypal.configured ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                                                PayPal Real-time Balance
                                            </h4>
                                            {gatewayData.paypal.configured ? (
                                                <span className="text-[10px] font-bold uppercase bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-lg">Configurato</span>
                                            ) : (
                                                <span className="text-[10px] font-bold uppercase bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg">Da Configurare</span>
                                            )}
                                        </div>
                                        {gatewayData.paypal.configured ? (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-slate-50 p-4 rounded-xl">
                                                    <span className="text-xs text-slate-400 font-semibold block">Disponibile</span>
                                                    <span className="text-xl font-bold font-mono text-slate-900 block mt-1">
                                                        €{(gatewayData.paypal.balance.availableCents / 100).toFixed(2)}
                                                    </span>
                                                </div>
                                                <div className="bg-slate-50 p-4 rounded-xl">
                                                    <span className="text-xs text-slate-400 font-semibold block">In sospeso</span>
                                                    <span className="text-xl font-bold font-mono text-slate-500 block mt-1">
                                                        €{(gatewayData.paypal.balance.pendingCents / 100).toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 p-4 rounded-xl flex items-center justify-center text-center h-[92px]">
                                                <p className="text-xs text-slate-500 max-w-sm">
                                                    Configura le variabili <strong>PAYPAL_CLIENT_ID</strong> e <strong>PAYPAL_CLIENT_SECRET</strong> per mostrare i saldi in tempo reale.
                                                </p>
                                            </div>
                                        )}
                                        <PaypalCsvUploadBox
                                            onImported={() => {
                                                void loadGateways();
                                                void loadLedger();
                                                setGatewayTableRefresh((n) => n + 1);
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                                        <div>
                                            <h4 className="text-lg font-bold text-slate-900">
                                                Sincronizzazione API Gateway (dal 01/01/2026)
                                            </h4>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                Movimenti Stripe COM/EU + PayPal (API, Webhook, CSV) —
                                                date reali, deduplicati, con lordo/fee/netto
                                            </p>
                                        </div>
                                        <span className="inline-flex self-start px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-indigo-50 border border-indigo-200 text-indigo-700">
                                            Sincronizzato da API
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            disabled={syncingStripe}
                                            onClick={() => void runStripeSync()}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                                        >
                                            {syncingStripe ? (
                                                <RefreshCw size={14} className="animate-spin" />
                                            ) : (
                                                <RefreshCw size={14} />
                                            )}
                                            Sincronizza Stripe COM + EU (dal 01/01/2026)
                                        </button>
                                        <button
                                            type="button"
                                            disabled={syncingPaypal}
                                            onClick={() => void runPaypalSync()}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
                                        >
                                            {syncingPaypal ? (
                                                <RefreshCw size={14} className="animate-spin" />
                                            ) : (
                                                <RefreshCw size={14} />
                                            )}
                                            Sincronizza PayPal (dal 01/01/2026)
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                                        <p>
                                            Stripe — ultimo sync:{' '}
                                            <strong>
                                                {stripeSyncMeta?.lastSyncAt
                                                    ? formatDateTime(stripeSyncMeta.lastSyncAt)
                                                    : 'mai'}
                                            </strong>{' '}
                                            · record:{' '}
                                            <strong>{stripeSyncMeta?.recordCount ?? 0}</strong>
                                        </p>
                                        <p>
                                            PayPal — ultimo sync:{' '}
                                            <strong>
                                                {paypalSyncMeta?.lastSyncAt
                                                    ? formatDateTime(paypalSyncMeta.lastSyncAt)
                                                    : 'mai'}
                                            </strong>{' '}
                                            · record:{' '}
                                            <strong>{paypalSyncMeta?.recordCount ?? 0}</strong>
                                        </p>
                                    </div>
                                    {gatewaySyncMsg && (
                                        <p className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                                            {gatewaySyncMsg}
                                        </p>
                                    )}

                                    <GatewaySyncTable refreshToken={gatewayTableRefresh} />
                                </div>

                                <details className="group border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                                    <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-5 py-4 bg-slate-50 hover:bg-slate-100">
                                        <span className="text-lg font-bold text-slate-900">
                                            Log grezzi checkout Stripe
                                        </span>
                                        <span className="text-[11px] font-semibold text-slate-500 group-open:hidden">
                                            Espandi
                                        </span>
                                    </summary>
                                    <div className="px-5 pt-2 pb-0 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => void loadGateways()}
                                            className="text-xs text-[#c5a880] hover:text-[#b0936b] font-bold flex items-center gap-1"
                                        >
                                            <RefreshCw size={12} />
                                            Aggiorna logs
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto border-t border-slate-100 p-5">
                                        <table className="w-full text-left border-collapse min-w-[800px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                    <th className="px-5 py-3">Orario</th>
                                                    <th className="px-5 py-3">Rif Ordine</th>
                                                    <th className="px-5 py-3">Cliente</th>
                                                    <th className="px-5 py-3 text-right">Importo</th>
                                                    <th className="px-5 py-3">Esito Pagamento</th>
                                                    <th className="px-5 py-3">Stato Sessione</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-sm">
                                                {gatewayData.stripe.transactions.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-5 py-8 text-center text-slate-400 italic">Nessuna sessione Stripe recente trovata.</td>
                                                    </tr>
                                                ) : (
                                                    gatewayData.stripe.transactions.map((tx: any) => {
                                                        const isSuccess = tx.paymentStatus === 'paid';
                                                        return (
                                                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                                                <td className="px-5 py-3.5 text-xs text-slate-500">
                                                                    {formatDateTime(tx.createdAt)}
                                                                </td>
                                                                <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-700">
                                                                    {tx.orderNumber}
                                                                </td>
                                                                <td className="px-5 py-3.5">
                                                                    <div className="font-semibold text-slate-800">{tx.customerName}</div>
                                                                    <div className="text-[10px] text-slate-400">{tx.customerEmail}</div>
                                                                </td>
                                                                <td className="px-5 py-3.5 text-right font-mono font-semibold">
                                                                    €{(tx.amountCents / 100).toFixed(2)}
                                                                </td>
                                                                <td className="px-5 py-3.5">
                                                                    {isSuccess ? (
                                                                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 uppercase">
                                                                            Successo
                                                                        </span>
                                                                    ) : (
                                                                        <div className="space-y-1">
                                                                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700 uppercase">
                                                                                Fallito / Rifiutato
                                                                            </span>
                                                                            {tx.errorMessage && (
                                                                                <p className="text-[10px] text-rose-500 max-w-[200px] leading-tight">{tx.errorMessage}</p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-5 py-3.5 text-xs font-medium text-slate-500 uppercase">
                                                                    {tx.status}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </details>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'fisco' && (
                    <div className="p-4 md:p-6 space-y-8 bg-white">
                        {/* Scadenziario — spostato qui da fondo pagina */}
                        <div className="space-y-6">
                            <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                                <div>
                                    <h3 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                                        <Calendar className="text-[#c5a880]" size={22} />
                                        Scadenziario &amp; Adempimenti S.r.l. (Startup Innovativa)
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Tracciamento automatico e allerta prioritaria 10 giorni prima di ogni adempimento fiscale e societario.
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 self-start lg:self-center">
                                    <button
                                        type="button"
                                        onClick={() => setComplianceFilter('ALL')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${complianceFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Tutti ({allDeadlines.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setComplianceFilter('FISC')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${complianceFilter === 'FISC' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Fiscale
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setComplianceFilter('ESTER')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${complianceFilter === 'ESTER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Esterometro
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setComplianceFilter('CORP')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${complianceFilter === 'CORP' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Bilancio &amp; Startup
                                    </button>
                                </div>
                            </div>

                            {urgentDeadlines.length > 0 && (
                                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                    <div className="flex items-start gap-3">
                                        <AlertOctagon className="text-rose-600 shrink-0 mt-0.5 animate-pulse" size={20} />
                                        <div>
                                            <span className="font-bold text-rose-800 text-sm">
                                                Attenzione: {urgentDeadlines.length} {urgentDeadlines.length === 1 ? 'scadenza urgente' : 'scadenze urgenti'}!
                                            </span>
                                            <p className="text-xs text-rose-700 leading-normal mt-0.5" suppressHydrationWarning>
                                                Prossima scadenza: <strong>{urgentDeadlines[0].title}</strong> {urgentDeadlines[0].daysRemaining < 0 ? 'scaduta il' : 'in scadenza il'} {formatDate(urgentDeadlines[0].dueDate)} ({urgentDeadlines[0].daysRemaining < 0 ? 'scaduta da' : 'mancano'} {Math.abs(urgentDeadlines[0].daysRemaining)} giorni).
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            <th className="px-5 py-3">Adempimento</th>
                                            <th className="px-5 py-3">Categoria</th>
                                            <th className="px-5 py-3">Frequenza</th>
                                            <th className="px-5 py-3">Descrizione</th>
                                            <th className="px-5 py-3">Data Scadenza</th>
                                            <th className="px-5 py-3">Tempo Rimanente</th>
                                            <th className="px-5 py-3 text-right">Stato</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {filteredDeadlines.map((item) => {
                                            const isCompleted = item.status === 'COMPLETED';
                                            const isUrgent = item.status === 'URGENT';

                                            return (
                                                <tr
                                                    key={item.id}
                                                    className={`hover:bg-slate-50/50 transition-colors ${isUrgent ? 'bg-rose-50/10 hover:bg-rose-50/20' : ''} ${isCompleted ? 'opacity-65' : ''}`}
                                                >
                                                    <td className="px-5 py-3.5 font-bold text-slate-900 max-w-[200px] truncate" title={item.title}>
                                                        {item.title}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                                            item.category === 'IVA' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                                            item.category === 'F24' ? 'bg-slate-50 border-slate-200 text-slate-700' :
                                                            item.category === 'CONTABILITA' ? 'bg-teal-50 border-teal-200 text-teal-700' :
                                                            item.category === 'ESTEROMETRO' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                                            item.category === 'BILANCIO' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                                                            item.category === 'STARTUP_INNOVATIVA' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                            'bg-purple-50 border-purple-200 text-purple-700'
                                                        }`}>
                                                            {item.category === 'CONTABILITA' ? 'CONTABILITÀ' : item.category}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-xs text-slate-500 font-bold uppercase">{item.frequency}</td>
                                                    <td className="px-5 py-3.5 text-xs text-slate-600 max-w-[280px] truncate" title={item.description}>
                                                        {item.description}
                                                        {item.externalRef ? (
                                                            <>
                                                                {' '}
                                                                <a
                                                                    href={item.externalRef}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-teal-700 underline font-semibold"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    Apri YouDoox
                                                                </a>
                                                            </>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-xs font-mono font-semibold text-slate-700" suppressHydrationWarning>
                                                        {formatDate(item.dueDate)}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-xs font-semibold">
                                                        {isCompleted ? (
                                                            <span className="text-slate-400 font-normal">—</span>
                                                        ) : item.daysRemaining < 0 ? (
                                                            <span className="text-rose-600 font-bold uppercase">Scaduto ({Math.abs(item.daysRemaining)} g fa)</span>
                                                        ) : item.daysRemaining === 0 ? (
                                                            <span className="text-rose-600 font-bold uppercase">Oggi!</span>
                                                        ) : (
                                                            <span className={item.daysRemaining <= 10 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                                                                {item.daysRemaining} {item.daysRemaining === 1 ? 'giorno' : 'giorni'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right">
                                                        <select
                                                            value={item.uiStatus}
                                                            onChange={(e) =>
                                                                void handleSetDeadlineStatus(
                                                                    item.id,
                                                                    e.target.value as
                                                                        | 'PENDING'
                                                                        | 'DUE_SOON'
                                                                        | 'PAID'
                                                                        | 'ARCHIVED'
                                                                        | 'SCADUTO'
                                                                )
                                                            }
                                                            className={`inline-flex px-2 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border cursor-pointer ${
                                                                item.uiStatus === 'PAID'
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                    : item.uiStatus === 'DUE_SOON' ||
                                                                        item.uiStatus === 'SCADUTO'
                                                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                                      : item.uiStatus === 'ARCHIVED'
                                                                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                                                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                                            }`}
                                                        >
                                                            <option value="SCADUTO">Scaduto</option>
                                                            <option value="DUE_SOON">In scadenza</option>
                                                            <option value="PAID">Pagato</option>
                                                            <option value="PENDING">Da completare</option>
                                                            <option value="ARCHIVED">Archiviato</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <TaxQuarterlyPanel />

                        {/* CE / SP / IRES (ex tab Bilancio) */}
                        <div className="space-y-8">
                            {statements?.contoEconomico?.source === 'historical_ledger' && (
                                <div className="rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-xs text-teal-900">
                                    Bilancio alimentato dal <strong>Registro Storico Permanente</strong> (Neon).
                                </div>
                            )}
                            {!statements ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
                                    <RefreshCw className="animate-spin mb-3 text-[#c5a880]" size={36} />
                                    <p className="text-sm font-medium">Elaborazione bilancio gestionale in corso...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                    <div className="border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                                        <h4 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                                            <TrendingUp className="text-emerald-600" size={20} />
                                            Conto Economico Gestionale (EBITDA)
                                        </h4>
                                        <div className="space-y-3.5 text-sm">
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-slate-600 font-medium">Ricavi da Vendite (e-commerce / B2B)</span>
                                                <span className="font-bold font-mono text-emerald-600">€{((statements?.contoEconomico?.ricaviVenditeCents || 0) / 100).toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-slate-100/60 pb-2">
                                                <span className="text-slate-500 text-xs">di cui Ordini Manuali &amp; B2B</span>
                                                <span className="font-mono text-slate-600 text-xs">€{(((statements?.contoEconomico?.ricaviVenditeCents || 0) - Number(stats.income) * 100) / 100).toFixed(2)}</span>
                                            </div>

                                            <div className="space-y-2 pt-2">
                                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Dettaglio Costi di Produzione</span>
                                                <div className="flex justify-between items-center py-1">
                                                    <span className="text-slate-600">Costi Fioristi Partner</span>
                                                    <span className="font-mono text-rose-600">-€{((statements?.contoEconomico?.costiFioristiCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-1">
                                                    <span className="text-slate-600">Commissioni Stripe</span>
                                                    <span className="font-mono text-rose-600">-€{((statements?.contoEconomico?.costiStripeCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-1">
                                                    <span className="text-slate-600">Software SaaS (Cursor, Antigravity, Claude, ecc.)</span>
                                                    <span className="font-mono text-rose-600">-€{((statements?.contoEconomico?.costiSaasCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-1 border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Servizi Pubblicitari (Meta, Google Ads, ecc.)</span>
                                                    <span className="font-mono text-rose-600">-€{((statements?.contoEconomico?.costiMarketingCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center pt-3 font-bold text-slate-900 border-t border-slate-200">
                                                <span>Totale Costi della Produzione</span>
                                                <span className="font-mono">€{((statements?.contoEconomico?.totaleCostiCents || 0) / 100).toFixed(2)}</span>
                                            </div>

                                            <div className="flex justify-between items-center p-4 rounded-xl bg-slate-50 border border-slate-100 mt-4 font-display font-bold text-lg text-slate-900">
                                                <span>Margine Operativo Lordo (EBITDA)</span>
                                                <span className={`font-mono ${(statements?.contoEconomico?.ebitdaCents || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    €{((statements?.contoEconomico?.ebitdaCents || 0) / 100).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                                        <h4 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                                            <DollarSign className="text-[#c5a880]" size={20} />
                                            Stato Patrimoniale Gestionale
                                        </h4>
                                        <div className="space-y-4 text-sm">
                                            <div className="space-y-2">
                                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">ATTIVITÀ (Impieghi)</span>
                                                <div className="flex justify-between items-center py-1">
                                                    <span className="text-slate-600">Disponibilità Liquide (Banca FinecoBank)</span>
                                                    <span className="font-mono font-semibold text-slate-800">€{((statements?.statoPatrimoniale?.cassaBancaCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-1 border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Crediti v/Clienti (Ordini Manuali/B2B in attesa)</span>
                                                    <span className="font-mono font-semibold text-slate-800">€{((statements?.statoPatrimoniale?.creditiClientiCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">PASSIVITÀ &amp; PATRIMONIO NETTO (Fonti)</span>
                                                <div className="flex justify-between items-center py-1">
                                                    <span className="text-slate-600">Debiti v/Fornitori (Fatture passive inevase nel DB)</span>
                                                    <span className="font-mono text-rose-600">€{((statements?.statoPatrimoniale?.debitiFornitoriCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-1">
                                                    <span className="text-slate-600">Debiti Tributari (IVA Netta a Debito + Ritenute + Imposte Stimate)</span>
                                                    <span className="font-mono text-rose-600">€{((statements?.statoPatrimoniale?.debitiTributariCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-1 border-b border-slate-100 pb-2">
                                                    <span className="text-slate-600">Patrimonio Netto (Capitale Sociale + Utile Stimato)</span>
                                                    <span className="font-mono font-semibold text-emerald-600">€{((statements?.statoPatrimoniale?.patrimonioNettoCents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center p-3.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 text-sm">
                                                <span>Capitale Sociale Deliberato e Versato</span>
                                                <span className="font-mono">€11.410,00 i.v.</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="xl:col-span-2 bg-slate-900 rounded-2xl p-6 text-white space-y-6">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
                                            <div>
                                                <h4 className="text-lg font-bold flex items-center gap-2">
                                                    <Cpu className="text-[#c5a880]" size={20} />
                                                    Stima Accantonamenti Fiscali (IRES &amp; IRAP)
                                                </h4>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    Stima preventiva automatica in base al fatturato reale e ai costi registrati per l&apos;esercizio in corso.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
                                                        JSON.stringify(statements, null, 2)
                                                    )}`;
                                                    const downloadAnchor = document.createElement('a');
                                                    downloadAnchor.setAttribute('href', jsonString);
                                                    downloadAnchor.setAttribute('download', `Bilancio_FidoCommercialista_${new Date().toISOString().split('T')[0]}.json`);
                                                    document.body.appendChild(downloadAnchor);
                                                    downloadAnchor.click();
                                                    downloadAnchor.remove();
                                                }}
                                                className="px-4 py-2 bg-[#c5a880] hover:bg-[#b0936b] text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors"
                                            >
                                                Esporta per FidoCommercialista
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="bg-slate-800/50 border border-slate-800 p-5 rounded-xl space-y-2">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stima Imposta IRES (24%)</span>
                                                <h5 className="text-2xl font-bold font-mono text-rose-400">€{((statements?.stimaImposte?.iresCents || 0) / 100).toFixed(2)}</h5>
                                                <p className="text-[10px] text-slate-500 leading-normal">Calcolata sull&apos;utile prima delle imposte gestionale.</p>
                                            </div>

                                            <div className="bg-slate-800/50 border border-slate-800 p-5 rounded-xl space-y-2">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stima Imposta IRAP (3.9%)</span>
                                                <h5 className="text-2xl font-bold font-mono text-rose-400">€{((statements?.stimaImposte?.irapCents || 0) / 100).toFixed(2)}</h5>
                                                <p className="text-[10px] text-slate-500 leading-normal">Calcolata sul valore netto della produzione (ricavi escluse commissioni e servizi SaaS).</p>
                                            </div>

                                            <div className="bg-[#c5a880]/10 border border-[#c5a880]/30 p-5 rounded-xl space-y-2">
                                                <span className="text-[10px] font-bold text-[#c5a880] uppercase tracking-widest">Utile Netto Stimato (Post-Imposte)</span>
                                                <h5 className={`text-2xl font-bold font-mono ${(statements?.stimaImposte?.utileNettoCents || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    €{((statements?.stimaImposte?.utileNettoCents || 0) / 100).toFixed(2)}
                                                </h5>
                                                <p className="text-[10px] text-[#c5a880]/70 leading-normal">Fondi netti stimati destinabili a riserva o reinvestimento.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <details className="group rounded-2xl border border-slate-100 overflow-hidden">
                            <summary className="cursor-pointer list-none px-5 py-4 bg-slate-50 text-sm font-bold text-slate-800 hover:bg-slate-100">
                                Archivio Storico Fiscale
                            </summary>
                            <div className="border-t border-slate-100">
                                <HistoricalFiscalArchivePanel />
                            </div>
                        </details>
                    </div>
                )}
            </div>
        </div>
    );
}

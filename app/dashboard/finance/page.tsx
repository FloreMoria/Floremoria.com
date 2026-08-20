'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
    DollarSign, 
    TrendingUp, 
    TrendingDown, 
    Cpu, 
    CheckCircle2, 
    AlertTriangle, 
    Download, 
    Plus, 
    FileText, 
    RefreshCw, 
    FileJson, 
    Settings, 
    Calendar,
    CheckSquare,
    Square,
    AlertOctagon,
    Pencil,
    Check,
} from 'lucide-react';
import type { FinancialLedger, BankTransaction, AccountingEntry } from '@/lib/financial/types';
import { getUpcomingDeadlines } from '@/lib/financial/compliance/deadlines';
import TaxQuarterlyPanel from './TaxQuarterlyPanel';
import BankStatementsPanel from '@/components/dashboard/BankStatementsPanel';
import SaasForeignExpensesPanel from '@/components/dashboard/SaasForeignExpensesPanel';
import ManualExpenseModal, {
    type ManualExpensePrefill,
} from '@/components/dashboard/ManualExpenseModal';
import SdiInvoicesUploadBox from '@/components/dashboard/SdiInvoicesUploadBox';
import ReceivedInvoicesXlsxUploadBox from '@/components/dashboard/ReceivedInvoicesXlsxUploadBox';
import FloristMissingInvoicesPanel from '@/components/dashboard/FloristMissingInvoicesPanel';
import {
    FLOREMORIA_FINECO_BANK,
    FLOREMORIA_LEGAL_ENTITY,
} from '@/lib/financial/companyBankDetails';
import { readJsonResponse } from '@/lib/http/readJsonResponse';

export default function FinanceDashboardPage() {
    const [ledger, setLedger] = useState<FinancialLedger>({ transactions: [], accountingEntries: [] });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<
        'transactions' | 'accounting' | 'statements' | 'gateways' | 'tax' | 'florist-invoices'
    >('transactions');
    const [statements, setStatements] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Gateways live status
    const [gatewayData, setGatewayData] = useState<any>(null);
    const [loadingGateways, setLoadingGateways] = useState(true);

    // Compliance state
    const [complianceFilter, setComplianceFilter] = useState<'ALL' | 'FISC' | 'ESTER' | 'CORP'>('ALL');
    const [processingManual, setProcessingManual] = useState(false);

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
        } catch (error) {
            console.error('Errore di caricamento dati gateway:', error);
        } finally {
            setLoadingGateways(false);
        }
    };

    useEffect(() => {
        void loadLedger();
        void loadGateways();
    }, []);

    // Gestione aggiornamento stato scadenze
    const handleToggleDeadline = async (deadlineId: string) => {
        try {
            const res = await fetch('/api/dashboard/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'toggle_deadline',
                    deadlineId
                })
            });
            const data = await res.json();
            if (data.ok) {
                setLedger(data.ledger);
                if (data.statements) setStatements(data.statements);
            }
        } catch (error) {
            console.error('Errore aggiornamento scadenza:', error);
        }
    };

    // Helper sicuri per formattazione date (evitano crash RangeError)
    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '—';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '—';
            return date.toLocaleDateString('it-IT', { dateStyle: 'medium' });
        } catch {
            return '—';
        }
    };

    const formatDateTime = (dateStr?: string) => {
        if (!dateStr) return '—';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '—';
            return date.toLocaleDateString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
        } catch {
            return '—';
        }
    };

    // Calcolo scadenze e scadenze urgenti
    const allDeadlines = React.useMemo(() => {
        return getUpcomingDeadlines(ledger?.completedDeadlineIds || []);
    }, [ledger?.completedDeadlineIds]);

    const urgentDeadlines = React.useMemo(() => {
        return allDeadlines.filter(item => item.status === 'URGENT');
    }, [allDeadlines]);

    const filteredDeadlines = React.useMemo(() => {
        return allDeadlines.filter(item => {
            if (complianceFilter === 'ALL') return true;
            if (complianceFilter === 'FISC') return item.category === 'IVA' || item.category === 'F24';
            if (complianceFilter === 'ESTER') return item.category === 'ESTEROMETRO';
            if (complianceFilter === 'CORP') return item.category === 'BILANCIO' || item.category === 'STARTUP_INNOVATIVA' || item.category === 'DICHIARATIVI';
            return true;
        });
    }, [allDeadlines, complianceFilter]);

    // Elaborazione ordini manuali
    const handleProcessManualOrders = async () => {
        setProcessingManual(true);
        try {
            const res = await fetch('/api/dashboard/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'process_manual_orders' })
            });
            const data = await res.json();
            if (data.ok) {
                alert(`Riconciliati con successo ${data.processedCount} ordini manuali!`);
                setLedger(data.ledger);
                if (data.statements) setStatements(data.statements);
            }
        } catch (error) {
            alert('Errore elaborazione ordini manuali');
        } finally {
            setProcessingManual(false);
        }
    };

    // Esportazione CSV per il commercialista
    const handleExportCSV = () => {
        const entries = ledger?.accountingEntries || [];
        if (!entries.length) return;
        const headers = ['Data', 'Descrizione', 'Conto Dare', 'Conto Avere', 'Importo Lordo (EUR)', 'IVA Scorporata (EUR)', 'Reverse Charge Estero', 'Fattura/Rif Ordine'];
        const rows = entries.map(e => [
            e.date,
            `"${(e.description || '').replace(/"/g, '""')}"`,
            e.dareAccount || '',
            e.avereAccount || '',
            (e.amountCents / 100).toFixed(2),
            (e.vatAmountCents / 100).toFixed(2),
            e.isForeignService ? 'SI' : 'NO',
            e.invoiceReference || ''
        ]);
        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Prima_Nota_FloreMoria_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Esportazione JSON strutturato
    const handleExportJSON = () => {
        const entries = ledger?.accountingEntries || [];
        if (!entries.length) return;
        const jsonContent = JSON.stringify(entries, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Prima_Nota_FloreMoria_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Statistiche calcolate a runtime
    const stats = React.useMemo(() => {
        let balanceCents = 0;
        let incomeCents = 0;
        let expenseCents = 0;
        let foreignSaasCents = 0;
        let reconciledCount = 0;

        const transactions = ledger?.transactions || [];
        const accountingEntries = ledger?.accountingEntries || [];

        for (const tx of transactions) {
            balanceCents += tx.amountCents;
            if (tx.amountCents > 0) {
                incomeCents += tx.amountCents;
            } else {
                expenseCents += Math.abs(tx.amountCents);
            }

            if (tx.category && tx.category !== 'UNRECONCILED') {
                reconciledCount++;
            }
        }

        for (const entry of accountingEntries) {
            if (entry.isForeignService && (entry.dareAccount || '').includes('Software')) {
                foreignSaasCents += entry.amountCents;
            }
        }

        const recRate = transactions.length 
            ? Math.round((reconciledCount / transactions.length) * 100) 
            : 100;

        const displayBalanceCents =
            manualBalanceCents != null ? manualBalanceCents : balanceCents;
        const saasDisplayCents = Math.max(foreignSaasCents, saasTotalCents);

        return {
            balance: (displayBalanceCents / 100).toFixed(2),
            balanceIsManual: manualBalanceCents != null,
            income: (incomeCents / 100).toFixed(2),
            expense: (expenseCents / 100).toFixed(2),
            foreignSaas: (saasDisplayCents / 100).toFixed(2),
            recRate
        };
    }, [ledger, manualBalanceCents, saasTotalCents]);

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
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Salvataggio saldo fallito');
        } finally {
            setSavingBalance(false);
        }
    };

    // Filtraggio transazioni/scritture
    const filteredTransactions = (ledger?.transactions || []).filter(t => {
        const q = searchTerm.toLowerCase();
        return (
            t.counterpartyName.toLowerCase().includes(q) ||
            (t.reference || '').toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q)
        );
    });

    const filteredEntries = (ledger?.accountingEntries || []).filter(e => {
        const q = searchTerm.toLowerCase();
        return (
            e.description.toLowerCase().includes(q) ||
            e.dareAccount.toLowerCase().includes(q) ||
            e.avereAccount.toLowerCase().includes(q) ||
            (e.invoiceReference || '').toLowerCase().includes(q)
        );
    });

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
                        onClick={loadLedger}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-sm font-semibold"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Sincronizza
                    </button>
                    <button
                        onClick={handleProcessManualOrders}
                        disabled={processingManual}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors text-sm font-semibold disabled:opacity-50"
                    >
                        <Cpu size={16} />
                        Riconcilia Ordini Manuali
                    </button>
                    <button
                        onClick={handleExportCSV}
                        disabled={!ledger.accountingEntries.length}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors text-sm font-semibold disabled:opacity-50"
                    >
                        <Download size={16} />
                        Esporta CSV
                    </button>
                    <button
                        onClick={handleExportJSON}
                        disabled={!ledger.accountingEntries.length}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors text-sm font-semibold disabled:opacity-50"
                    >
                        <FileJson size={16} />
                        Esporta JSON
                    </button>
                    <Link
                        href="/dashboard/fornitori"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors text-sm font-semibold"
                    >
                        Gestione Fornitori
                    </Link>
                </div>
            </div>

            {/* Coordinate bancarie FinecoBank */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Conto Corrente Operativo (FinecoBank)</h3>
                        <p className="mt-1 text-lg font-display font-bold text-slate-900">{FLOREMORIA_FINECO_BANK.institute}</p>
                        <p className="text-sm text-slate-600 mt-1">{FLOREMORIA_FINECO_BANK.accountHolder}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{FLOREMORIA_LEGAL_ENTITY.registeredOffice}</p>
                        <p className="text-xs text-slate-500">P.IVA / C.F. {FLOREMORIA_LEGAL_ENTITY.vatNumber}</p>
                        <p className="text-xs text-slate-500">Codice SDI: <span className="font-mono font-semibold text-slate-800">{FLOREMORIA_LEGAL_ENTITY.sdiCode}</span></p>
                    </div>
                    <div className="font-mono text-sm space-y-1 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                        <div><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">IBAN</span><div className="font-semibold text-slate-900 tracking-wide">{FLOREMORIA_FINECO_BANK.ibanDisplay}</div></div>
                        <div className="pt-1"><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">BIC / SWIFT</span><div className="text-slate-800">{FLOREMORIA_FINECO_BANK.bicSepa} <span className="text-slate-400">(SEPA)</span> · {FLOREMORIA_FINECO_BANK.bicSwift} <span className="text-slate-400">(SWIFT)</span></div></div>
                    </div>
                </div>
                <BankStatementsPanel />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                    <p className="font-bold uppercase tracking-wider text-emerald-800 text-[10px]">Entrate native</p>
                    <p className="text-emerald-900 mt-1 leading-relaxed">
                        Incassi tracciati dai webhook Stripe/PayPal all&apos;acquisto cliente (tab Stato Stripe &amp; PayPal).
                    </p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                    <p className="font-bold uppercase tracking-wider text-amber-800 text-[10px]">Uscite maturate</p>
                    <p className="text-amber-900 mt-1 leading-relaxed">
                        Compensi fiorista su ordini confermati; liquidazione abbinata ai bonifici sull&apos;estratto Fineco.
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="font-bold uppercase tracking-wider text-slate-600 text-[10px]">Quadratura bancaria</p>
                    <p className="text-slate-700 mt-1 leading-relaxed">
                        Carica PDF/CSV Fineco per matching payout, bonifici partner, SaaS/imposte e spese manuali.
                    </p>
                </div>
            </div>

            {/* Metrics cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo FinecoBank</span>
                        {editingBalance ? (
                            <div className="mt-1 flex items-center gap-2">
                                <span className="text-slate-500 font-mono">€</span>
                                <input
                                    autoFocus
                                    value={balanceDraft}
                                    onChange={(e) => setBalanceDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') void saveManualBalance();
                                        if (e.key === 'Escape') setEditingBalance(false);
                                    }}
                                    className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-lg font-bold font-mono"
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
                            <div className="mt-1 flex items-center gap-2">
                                <h3 className="text-2xl font-bold font-mono text-slate-900">€{stats.balance}</h3>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBalanceDraft(stats.balance);
                                        setEditingBalance(true);
                                    }}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                                    title="Modifica saldo manuale"
                                >
                                    <Pencil size={14} />
                                </button>
                            </div>
                        )}
                        {stats.balanceIsManual && manualBalanceAlignedAt && !editingBalance && (
                            <p className="text-[10px] text-slate-400 mt-1">
                                Allineato {new Date(manualBalanceAlignedAt).toLocaleString('it-IT')}
                            </p>
                        )}
                    </div>
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-700 shrink-0">
                        <DollarSign size={24} />
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Entrate Totali</span>
                        <h3 className="text-2xl font-bold font-mono text-emerald-600 mt-1">€{stats.income}</h3>
                    </div>
                    <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                        <TrendingUp size={24} />
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Uscite Totali</span>
                        <h3 className="text-2xl font-bold font-mono text-rose-600 mt-1">€{stats.expense}</h3>
                    </div>
                    <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
                        <TrendingDown size={24} />
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setSaasDrawerOpen(true)}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between text-left hover:border-blue-300 hover:ring-2 hover:ring-blue-100 transition-all"
                >
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Spese SaaS / Estere</span>
                        <h3 className="text-2xl font-bold font-mono text-blue-600 mt-1">€{stats.foreignSaas}</h3>
                        <span className="text-[10px] text-blue-500 font-semibold">Apri gestione →</span>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                        <Settings size={24} />
                    </div>
                </button>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tasso Riconciliazione</span>
                        <h3 className="text-2xl font-bold font-mono text-amber-600 mt-1">{stats.recRate}%</h3>
                    </div>
                    <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                        <CheckCircle2 size={24} />
                    </div>
                </div>
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

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <SdiInvoicesUploadBox onImported={() => void loadLedger()} />
                <ReceivedInvoicesXlsxUploadBox onImported={() => void loadLedger()} />
            </div>

            {/* Tabs content tables */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/50">
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`flex-1 min-w-[140px] py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'transactions' ? 'border-[#c5a880] text-slate-900 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Movimenti Bancari Estratto Conto ({(ledger?.transactions || []).length})
                    </button>
                    <button
                        onClick={() => setActiveTab('accounting')}
                        className={`flex-1 min-w-[140px] py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'accounting' ? 'border-[#c5a880] text-slate-900 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Scritture di Prima Nota ({(ledger?.accountingEntries || []).length})
                    </button>
                    <button
                        onClick={() => setActiveTab('florist-invoices')}
                        className={`flex-1 min-w-[140px] py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'florist-invoices' ? 'border-[#c5a880] text-slate-900 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Fioristi in attesa di Fattura
                    </button>
                    <button
                        onClick={() => setActiveTab('statements')}
                        className={`flex-1 min-w-[140px] py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'statements' ? 'border-[#c5a880] text-slate-900 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Simulazione Bilancio &amp; Imposte
                    </button>
                    <button
                        onClick={() => setActiveTab('gateways')}
                        className={`flex-1 min-w-[140px] py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'gateways' ? 'border-[#c5a880] text-slate-900 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Stato Stripe &amp; PayPal
                    </button>
                    <button
                        onClick={() => setActiveTab('tax')}
                        className={`flex-1 min-w-[140px] py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'tax' ? 'border-[#c5a880] text-slate-900 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Chiusura Trimestrale &amp; Fisco
                    </button>
                </div>

                {activeTab !== 'statements' &&
                    activeTab !== 'gateways' &&
                    activeTab !== 'tax' &&
                    activeTab !== 'florist-invoices' && (
                    <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between">
                        <input
                            type="text"
                            placeholder="Cerca per emittente, causale, conto o riferimenti..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full max-w-md px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm focus:border-[#c5a880] focus:ring-1 focus:ring-[#c5a880] transition-all"
                        />
                    </div>
                )}

                {activeTab === 'transactions' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                    <th className="px-5 py-3">ID Transazione</th>
                                    <th className="px-5 py-3">Data</th>
                                    <th className="px-5 py-3">Controparte</th>
                                    <th className="px-5 py-3">Canale</th>
                                    <th className="px-5 py-3">Causale bancaria</th>
                                    <th className="px-5 py-3 text-right">Importo</th>
                                    <th className="px-5 py-3">Stato Riconciliazione</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-8 text-center text-slate-400 italic">Nessun movimento bancario registrato.</td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map((tx) => {
                                        const cat = (tx.category || '').toUpperCase();
                                        const status =
                                            cat && cat !== 'UNRECONCILED'
                                                ? 'reconciled'
                                                : cat === 'UNRECONCILED'
                                                  ? 'unmatched'
                                                  : 'pending';
                                        
                                        return (
                                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-700">{tx.id}</td>
                                                <td className="px-5 py-3.5 text-xs text-slate-500" suppressHydrationWarning>
                                                    {formatDateTime(tx.emittedAt)}
                                                </td>
                                                <td className="px-5 py-3.5 font-semibold text-slate-800">{tx.counterpartyName}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                                        {tx.side}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 font-mono text-xs text-slate-600 max-w-[300px] truncate" title={tx.reference || ''}>
                                                    {tx.reference || '—'}
                                                </td>
                                                <td className={`px-5 py-3.5 font-bold font-mono text-right text-sm ${tx.amountCents > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                                                    {tx.amountCents > 0 ? '+' : ''}{(tx.amountCents / 100).toFixed(2)} €
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    {status === 'reconciled' ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
                                                            <CheckCircle2 size={12} />
                                                            Riconciliato
                                                        </span>
                                                    ) : status === 'unmatched' ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wide">
                                                            <AlertTriangle size={12} />
                                                            Non abbinato
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
                                                            <AlertTriangle size={12} />
                                                            In attesa
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'accounting' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                    <th className="px-5 py-3">Data Reg.</th>
                                    <th className="px-5 py-3">Descrizione Voce</th>
                                    <th className="px-5 py-3">Conto Dare</th>
                                    <th className="px-5 py-3">Conto Avere</th>
                                    <th className="px-5 py-3 text-right">Lordo (Dare)</th>
                                    <th className="px-5 py-3 text-right">IVA</th>
                                    <th className="px-5 py-3">Regime</th>
                                    <th className="px-5 py-3">Rif. Ordine/Fattura</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {filteredEntries.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-8 text-center text-slate-400 italic">Nessuna scrittura di Prima Nota registrata.</td>
                                    </tr>
                                ) : (
                                    filteredEntries.map((entry) => (
                                        <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-3.5 text-xs text-slate-500">{entry.date}</td>
                                            <td className="px-5 py-3.5 font-medium text-slate-800 max-w-[280px] truncate" title={entry.description}>
                                                {entry.description}
                                            </td>
                                            <td className="px-5 py-3.5 text-xs font-mono text-slate-600">{entry.dareAccount}</td>
                                            <td className="px-5 py-3.5 text-xs font-mono text-slate-600">{entry.avereAccount}</td>
                                            <td className="px-5 py-3.5 font-bold font-mono text-right text-slate-950">
                                                {(entry.amountCents / 100).toFixed(2)} €
                                            </td>
                                            <td className="px-5 py-3.5 font-mono text-right text-slate-600">
                                                {entry.vatAmountCents > 0 ? `${(entry.vatAmountCents / 100).toFixed(2)} €` : '—'}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {entry.isForeignService ? (
                                                    <span className="inline-flex px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[9px] font-bold uppercase tracking-wider">
                                                        Reverse Charge
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600 text-[9px] font-bold uppercase tracking-wider">
                                                        Standard IT
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {entry.invoiceReference ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold font-mono">
                                                        <FileText size={11} />
                                                        {entry.invoiceReference}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'statements' && (
                    <div className="p-6 space-y-8 bg-white">
                        {!statements ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
                                <RefreshCw className="animate-spin mb-3 text-[#c5a880]" size={36} />
                                <p className="text-sm font-medium">Elaborazione bilancio gestionale in corso...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                {/* CONTO ECONOMICO */}
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

                                {/* STATO PATRIMONIALE */}
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

                                {/* STIMA IMPOSTE (FULL WIDTH CARD) */}
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
                                            className="px-4 py-2 bg-[#c5a880] hover:bg-[#b0936b] text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors animate-pulse"
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
                )}

                {activeTab === 'gateways' && (
                    <div className="p-6 space-y-8 bg-white">
                        {loadingGateways || !gatewayData ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
                                <RefreshCw className="animate-spin mb-3 text-[#c5a880]" size={36} />
                                <p className="text-sm font-medium">Connessione ai gateway di pagamento in corso...</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {/* Saldi in tempo reale */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Stripe Card */}
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

                                    {/* PayPal Card */}
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
                                    </div>
                                </div>

                                {/* Ultimi tentativi e transazioni su Stripe */}
                                <div className="border border-slate-100 rounded-2xl shadow-sm overflow-hidden space-y-4 p-5">
                                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                        <h4 className="text-lg font-bold text-slate-900">
                                            Log Recenti Tentativi di Pagamento (Stripe)
                                        </h4>
                                        <button 
                                            onClick={loadGateways}
                                            className="text-xs text-[#c5a880] hover:text-[#b0936b] font-bold flex items-center gap-1"
                                        >
                                            <RefreshCw size={12} />
                                            Aggiorna logs
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
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
                                </div>

                                {/* Movimenti Reali Stripe (Contabilità Centesimi) */}
                                <div className="border border-slate-100 rounded-2xl shadow-sm overflow-hidden space-y-4 p-5">
                                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                        <h4 className="text-lg font-bold text-slate-900">
                                            Movimenti Reali Stripe Registrati (Contabilità al Centesimo)
                                        </h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[800px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                    <th className="px-5 py-3">Transazione ID</th>
                                                    <th className="px-5 py-3">Codice Ordine</th>
                                                    <th className="px-5 py-3">Data</th>
                                                    <th className="px-5 py-3 text-right">Lordo (Ricavo)</th>
                                                    <th className="px-5 py-3 text-right">Commissione Stripe (Fee)</th>
                                                    <th className="px-5 py-3 text-right">Netto Incassato</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-sm">
                                                {!gatewayData.stripe.realTransactions || gatewayData.stripe.realTransactions.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-5 py-8 text-center text-slate-400 italic">Nessun movimento Stripe reale registrato.</td>
                                                    </tr>
                                                ) : (
                                                    gatewayData.stripe.realTransactions.map((tx: any) => {
                                                        return (
                                                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                                                <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                                                                    {tx.stripeTransactionId}
                                                                </td>
                                                                <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-700">
                                                                    {tx.orderNumber}
                                                                </td>
                                                                <td className="px-5 py-3.5 text-xs text-slate-500">
                                                                    {formatDateTime(tx.createdAt)}
                                                                </td>
                                                                <td className="px-5 py-3.5 text-right font-mono text-slate-800">
                                                                    €{(tx.grossAmount || 0).toFixed(2)}
                                                                </td>
                                                                <td className="px-5 py-3.5 text-right font-mono text-rose-600">
                                                                    -€{(tx.stripeFee || 0).toFixed(2)}
                                                                </td>
                                                                <td className="px-5 py-3.5 text-right font-mono text-emerald-700 font-semibold">
                                                                    €{(tx.netAmount || 0).toFixed(2)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'florist-invoices' && (
                    <div className="p-4">
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

                {activeTab === 'tax' && <TaxQuarterlyPanel />}
            </div>

            {/* Scadenziario & Adempimenti S.r.l. Widget */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
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

                    {/* Category filter */}
                    <div className="flex flex-wrap gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 self-start lg:self-center">
                        <button
                            onClick={() => setComplianceFilter('ALL')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${complianceFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Tutti ({allDeadlines.length})
                        </button>
                        <button
                            onClick={() => setComplianceFilter('FISC')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${complianceFilter === 'FISC' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Fiscale
                        </button>
                        <button
                            onClick={() => setComplianceFilter('ESTER')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${complianceFilter === 'ESTER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Esterometro
                        </button>
                        <button
                            onClick={() => setComplianceFilter('CORP')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${complianceFilter === 'CORP' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Bilancio &amp; Startup
                        </button>
                    </div>
                </div>

                {/* High urgency alert banner if any urgent deadline exists */}
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

                {/* Deadlines Table/List */}
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
                                                item.category === 'ESTEROMETRO' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                                item.category === 'BILANCIO' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                                                item.category === 'STARTUP_INNOVATIVA' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                'bg-purple-50 border-purple-200 text-purple-700'
                                            }`}>
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-xs text-slate-500 font-bold uppercase">{item.frequency}</td>
                                        <td className="px-5 py-3.5 text-xs text-slate-600 max-w-[280px] truncate" title={item.description}>
                                            {item.description}
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
                                            <button
                                                onClick={() => handleToggleDeadline(item.id)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                                                    isCompleted 
                                                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                                        : isUrgent 
                                                        ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm' 
                                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                                }`}
                                            >
                                                {isCompleted ? (
                                                    <>
                                                        <CheckSquare size={13} />
                                                        Inviato
                                                    </>
                                                ) : (
                                                    <>
                                                        <Square size={13} />
                                                        Da Inviare
                                                    </>
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}

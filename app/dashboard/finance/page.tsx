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
    ShieldAlert 
} from 'lucide-react';
import type { FinancialLedger } from '@/lib/financial/ledgerStore';
import type { BankTransaction, AccountingEntry } from '@/lib/financial/types';

export default function FinanceDashboardPage() {
    const [ledger, setLedger] = useState<FinancialLedger>({ transactions: [], accountingEntries: [] });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'transactions' | 'accounting'>('transactions');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Simulator states
    const [simType, setSimType] = useState<'income_b2b' | 'income_stripe' | 'expense_saas' | 'expense_partner'>('income_stripe');
    const [simAmount, setSimAmount] = useState('100.00');
    const [simCounterparty, setSimCounterparty] = useState('Stripe Payments UK Ltd');
    const [simReference, setSimReference] = useState('STRIPE PAYOUT po_998877');
    const [simulating, setSimulating] = useState(false);
    const [lastSimResult, setLastSimResult] = useState<any>(null);
    const [processingManual, setProcessingManual] = useState(false);

    // Caricamento dati
    const loadLedger = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/dashboard/finance');
            const data = await res.json();
            if (data.ok && data.ledger) {
                setLedger(data.ledger);
            }
        } catch (error) {
            console.error('Errore di caricamento ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadLedger();
    }, []);

    // Aggiornamento parametri simulatore in base al tipo selezionato
    useEffect(() => {
        switch (simType) {
            case 'income_stripe':
                setSimAmount('98.00');
                setSimCounterparty('Stripe Payments UK Ltd');
                setSimReference('STRIPE PAYOUT po_test_99');
                break;
            case 'income_b2b':
                setSimAmount('450.00');
                setSimCounterparty('Milano Fioriti B2B');
                setSimReference('PT-MI-26-001 CONSEGNA CIMITERO');
                break;
            case 'expense_saas':
                setSimAmount('20.00');
                setSimCounterparty('Anysphere Inc. (Cursor)');
                setSimReference('CURSOR SUBSCRIPTION INVOICE #5512');
                break;
            case 'expense_partner':
                setSimAmount('120.00');
                setSimCounterparty('Fiorista Bergamo S.r.l.');
                setSimReference('COMPETENZE POSA PT-BG-26-003');
                break;
        }
    }, [simType]);

    // Invio transazione simulata
    const handleSimulate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSimulating(true);
        setLastSimResult(null);

        try {
            const amountCents = Math.round(parseFloat(simAmount) * 100);
            const side = simType.startsWith('expense_') ? 'card' : 'sepa';

            const res = await fetch('/api/dashboard/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'simulate_transaction',
                    amountCents: simType.startsWith('expense_') ? -amountCents : amountCents,
                    side,
                    reference: simReference,
                    counterpartyName: simCounterparty
                })
            });

            const data = await res.json();
            if (data.ok) {
                setLastSimResult(data.reconciliation);
                setLedger(data.ledger);
            } else {
                alert('Errore simulazione: ' + data.error);
            }
        } catch (error) {
            alert('Errore di connessione API');
        } finally {
            setSimulating(false);
        }
    };

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
            }
        } catch (error) {
            alert('Errore elaborazione ordini manuali');
        } finally {
            setProcessingManual(false);
        }
    };

    // Esportazione CSV per il commercialista
    const handleExportCSV = () => {
        if (!ledger.accountingEntries.length) return;
        const headers = ['Data', 'Descrizione', 'Conto Dare', 'Conto Avere', 'Importo Lordo (EUR)', 'IVA Scorporata (EUR)', 'Reverse Charge Estero', 'Fattura/Rif Ordine'];
        const rows = ledger.accountingEntries.map(e => [
            e.date,
            `"${e.description.replace(/"/g, '""')}"`,
            e.dareAccount,
            e.avereAccount,
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
        if (!ledger.accountingEntries.length) return;
        const jsonContent = JSON.stringify(ledger.accountingEntries, null, 2);
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

        for (const tx of ledger.transactions) {
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

        for (const entry of ledger.accountingEntries) {
            if (entry.isForeignService && entry.dareAccount.includes('Software')) {
                foreignSaasCents += entry.amountCents;
            }
        }

        const recRate = ledger.transactions.length 
            ? Math.round((reconciledCount / ledger.transactions.length) * 100) 
            : 100;

        return {
            balance: (balanceCents / 100).toFixed(2),
            income: (incomeCents / 100).toFixed(2),
            expense: (expenseCents / 100).toFixed(2),
            foreignSaas: (foreignSaasCents / 100).toFixed(2),
            recRate
        };
    }, [ledger]);

    // Filtraggio transazioni/scritture
    const filteredTransactions = ledger.transactions.filter(t => {
        const q = searchTerm.toLowerCase();
        return (
            t.counterpartyName.toLowerCase().includes(q) ||
            (t.reference || '').toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q)
        );
    });

    const filteredEntries = ledger.accountingEntries.filter(e => {
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
                        Riconciliazione automatica estratti conto, scomputo Stripe e fatture passive per FloreMoria S.r.l.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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

            {/* Metrics cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo Qonto</span>
                        <h3 className="text-2xl font-bold font-mono text-slate-900 mt-1">€{stats.balance}</h3>
                    </div>
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-700">
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
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Spese SaaS / Estere</span>
                        <h3 className="text-2xl font-bold font-mono text-blue-600 mt-1">€{stats.foreignSaas}</h3>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                        <Settings size={24} />
                    </div>
                </div>
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

            {/* Ingestion simulator & last result */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Simulator form */}
                <div className="lg:col-span-2 bg-[#FAF9F6] border border-[#c5a880]/30 rounded-3xl p-6 shadow-sm">
                    <h3 className="text-lg font-display font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <Plus size={20} className="text-[#c5a880]" />
                        Simulatore Webhook Ingestione Movimento Bancario
                    </h3>
                    <form onSubmit={handleSimulate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo Transazione Bancaria</label>
                            <select 
                                value={simType} 
                                onChange={(e) => setSimType(e.target.value as any)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                            >
                                <option value="income_stripe">Entrata: Payout Stripe (Riconciliazione Lordo + Trattenuta Fees)</option>
                                <option value="income_b2b">Entrata: Bonifico B2B Partner (Match con codice ordine)</option>
                                <option value="expense_saas">Uscita: Addebito Carta SaaS Estero (Reverse Charge)</option>
                                <option value="expense_partner">Uscita: Bonifico Posa Fiorista Partner (Costo operativo)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Importo Effettivo Bancario (€)</label>
                            <input 
                                type="number" 
                                step="0.01" 
                                value={simAmount}
                                onChange={(e) => setSimAmount(e.target.value)}
                                required 
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Emittente / Controparte</label>
                            <input 
                                type="text" 
                                value={simCounterparty} 
                                onChange={(e) => setSimCounterparty(e.target.value)}
                                required 
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Causale / Riferimento (Concept/Reference)</label>
                            <input 
                                type="text" 
                                value={simReference} 
                                onChange={(e) => setSimReference(e.target.value)}
                                required 
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <button
                                type="submit"
                                disabled={simulating}
                                className="w-full py-3 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                            >
                                {simulating ? 'Ingestione in corso...' : 'Invia Webhook Simulato (Ingestione Qonto)'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Simulation result */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-display font-bold text-slate-800 uppercase tracking-wide mb-4">
                            Esito Elaborazione AI Engine
                        </h3>
                        {lastSimResult ? (
                            <div className="space-y-4">
                                <div className={`p-4 rounded-2xl border ${lastSimResult.isReconciled ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                    <div className="flex items-center gap-2">
                                        {lastSimResult.isReconciled ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                                        <span className="font-bold text-sm">
                                            {lastSimResult.isReconciled ? 'Transazione Riconciliata' : 'Transazione Non Abbinata'}
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1.5 font-medium leading-relaxed">{lastSimResult.notes}</p>
                                </div>
                                <div className="text-xs space-y-2 bg-slate-50 p-4 rounded-2xl font-mono">
                                    <p><strong>Tipo Match:</strong> {lastSimResult.type}</p>
                                    <p><strong>Punteggio Score:</strong> {lastSimResult.matchingScore}%</p>
                                    {lastSimResult.orderId && <p><strong>ID Ordine Collegato:</strong> {lastSimResult.orderId.slice(0, 12)}...</p>}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
                                <Cpu size={40} className="stroke-[1.5] mb-3 text-slate-300" />
                                <p className="text-sm font-medium">Invia una transazione simulata per visualizzare l&apos;esito e la scomposizione contabile in tempo reale.</p>
                            </div>
                        )}
                    </div>
                    <div className="text-[10px] text-slate-400 leading-normal flex items-start gap-1.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                        <ShieldAlert size={14} className="shrink-0 text-slate-400 mt-0.5" />
                        <span>Gli ordini di TEST (isTest: true) sono rigorosamente protetti ed esclusi da tutti i conteggi per evitare inquinamento fiscale.</span>
                    </div>
                </div>
            </div>

            {/* Tabs content tables */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="flex border-b border-slate-200 bg-slate-50/50">
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`flex-1 py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'transactions' ? 'border-[#c5a880] text-slate-900 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Movimenti Bancari Estratto Conto ({filteredTransactions.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('accounting')}
                        className={`flex-1 py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'accounting' ? 'border-[#c5a880] text-slate-900 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Scritture di Prima Nota ({filteredEntries.length})
                    </button>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between">
                    <input
                        type="text"
                        placeholder="Cerca per emittente, causale, conto o riferimenti..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full max-w-md px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm focus:border-[#c5a880] focus:ring-1 focus:ring-[#c5a880] transition-all"
                    />
                </div>

                {activeTab === 'transactions' ? (
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
                                        const isRec = tx.category && tx.category !== 'UNRECONCILED';
                                        
                                        return (
                                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-700">{tx.id}</td>
                                                <td className="px-5 py-3.5 text-xs text-slate-500">
                                                    {new Date(tx.emittedAt).toLocaleDateString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
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
                                                    {isRec ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
                                                            <CheckCircle2 size={12} />
                                                            Riconciliato ({tx.category})
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
                                                            <AlertTriangle size={12} />
                                                            Da Verificare
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
                ) : (
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
            </div>
        </div>
    );
}

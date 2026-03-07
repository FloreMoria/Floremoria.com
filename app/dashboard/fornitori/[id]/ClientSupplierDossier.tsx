'use client';

import { useState } from 'react';
import { PaymentStatus, Supplier, SupplierInvoice } from '@prisma/client';
import { ArrowLeft, Building2, Euro, Globe, Mail, MapPin, Phone, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Props {
    supplier: Supplier;
    initialInvoices: SupplierInvoice[];
}

export default function ClientSupplierDossier({ supplier, initialInvoices }: Props) {
    const [invoices, setInvoices] = useState(initialInvoices);

    const handlePaymentToggle = async (invoiceId: string, currentStatus: PaymentStatus) => {
        const nextStatus = currentStatus === 'UNPAID' ? 'PROCESSING' : currentStatus === 'PROCESSING' ? 'PAID' : 'UNPAID';

        try {
            setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: nextStatus } : inv));
            const res = await fetch(`/api/dashboard/invoices/${invoiceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus })
            });
            if (!res.ok) throw new Error('Failed to update invoice status');
        } catch (error) {
            console.error(error);
            setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: currentStatus } : inv));
            alert("Errore nell'aggiornamento dello stato della fattura.");
        }
    };

    return (
        <div className="space-y-8">
            {/* Header / Nav */}
            <div className="flex items-center gap-4 mb-4">
                <Link href="/dashboard/fornitori" className="p-2 border border-gray-200 rounded-full hover:bg-gray-50 text-gray-500 hover:text-black transition-colors">
                    <ArrowLeft size={18} />
                </Link>
                <div>
                    <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest leading-none mb-1">Dossier Fornitore</div>
                    <h1 className="text-3xl font-display font-bold text-gray-900 leading-none mb-2">DOSSIER FORNITORE - {supplier.uniqueCode || 'N/D'}</h1>
                    <h2 className="text-2xl font-bold text-gray-800">{supplier.companyName}</h2>
                </div>
            </div>

            {/* Vendor Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col gap-3">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Globe size={14} className="text-blue-500" /> Dati Aziendali
                    </div>
                    {supplier.contactName && <div><span className="text-xs text-gray-500 block">Referente</span><span className="font-semibold">{supplier.contactName}</span></div>}
                    <div><span className="text-xs text-gray-500 block">Categoria</span><span className="font-semibold">{supplier.category}</span></div>
                    <div><span className="text-xs text-gray-500 block">Email</span><span className="font-medium inline-flex items-center gap-1.5"><Mail size={12} />{supplier.email || '-'}</span></div>
                    <div><span className="text-xs text-gray-500 block">Telefono</span><span className="font-medium inline-flex items-center gap-1.5"><Phone size={12} />{supplier.phone || '-'}</span></div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col gap-3">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <MapPin size={14} className="text-emerald-500" /> Dati Fiscali
                    </div>
                    <div><span className="text-xs text-gray-500 block">Partita IVA</span><span className="font-mono">{supplier.vatNumber || '-'}</span></div>
                    <div><span className="text-xs text-gray-500 block">Codice Fiscale</span><span className="font-mono">{supplier.taxCode || '-'}</span></div>
                    <div><span className="text-xs text-gray-500 block">SDI</span><span className="font-mono">{supplier.sdiCode || '-'}</span></div>
                    <div><span className="text-xs text-gray-500 block">PEC</span><span className="font-medium text-[11px]">{supplier.pecAddress || '-'}</span></div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col gap-3">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Building2 size={14} className="text-fm-gold" /> Pagamento Affidato
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 block mb-1">IBAN</span>
                        {supplier.iban ? <span className="font-mono text-xs bg-blue-50 text-blue-800 px-2 py-1 rounded border border-blue-100">{supplier.iban}</span> : '-'}
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 block mt-2 mb-1">PayPal</span>
                        {supplier.paypalEmail ? <span className="font-medium text-xs bg-sky-50 text-sky-800 px-2 py-1 rounded border border-sky-100">{supplier.paypalEmail}</span> : '-'}
                    </div>
                </div>
            </div>

            {/* Invoices Table */}
            <div className="space-y-4 pt-8">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Euro size={20} className="text-fm-gold" />
                    Registro Fatture Passive
                </h2>

                <div className="bg-white border text-left border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto w-full custom-scrollbar">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50/70 border-b border-gray-100 text-gray-500">
                                    <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap">N. Fattura</th>
                                    <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap">Azienda</th>
                                    <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap">Data</th>
                                    <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider">Causale</th>
                                    <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap">Dati Pagamento</th>
                                    <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap text-right">Importo</th>
                                    <th className="font-semibold py-3 px-4 uppercase text-[10px] tracking-wider whitespace-nowrap text-center">STATO PAGAMENTO</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {invoices.length === 0 ? (
                                    <tr><td colSpan={7} className="p-8 text-center text-gray-500">Nessuna fattura registrata per questo fornitore.</td></tr>
                                ) : (
                                    invoices.map((invoice) => (
                                        <tr key={invoice.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="py-3 px-4 font-bold text-gray-900 text-xs">{invoice.invoiceNumber}</td>
                                            <td className="py-3 px-4 text-gray-800 text-xs font-medium">{supplier.companyName}</td>
                                            <td className="py-3 px-4 text-gray-600 font-medium text-xs">{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                                            <td className="py-3 px-4 font-medium text-gray-800 text-xs truncate max-w-[200px]" title={invoice.reason}>{invoice.reason}</td>
                                            <td className="py-3 px-4 text-gray-600 text-xs max-w-[150px] truncate" title={invoice.paymentDetails || supplier.iban || ''}>
                                                {invoice.paymentDetails || supplier.iban || supplier.paypalEmail || '-'}
                                            </td>
                                            <td className="py-3 px-4 text-right font-semibold text-gray-900 whitespace-nowrap">
                                                <span className="flex items-center justify-end gap-0.5 text-sm">
                                                    <Euro size={14} className="text-fm-gold" />{Number(invoice.amount).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePaymentToggle(invoice.id, invoice.status); }}
                                                    className={`inline-flex items-center justify-center px-2.5 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all hover:scale-105 active:scale-95 whitespace-nowrap shadow-sm border ${invoice.status === 'UNPAID' ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300' :
                                                        invoice.status === 'PROCESSING' ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 hover:border-orange-300' :
                                                            'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                                                        }`}
                                                >
                                                    {invoice.status === 'UNPAID' ? 'Da Pagare' :
                                                        invoice.status === 'PROCESSING' ? 'In Pagamento' : 'Pagato'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

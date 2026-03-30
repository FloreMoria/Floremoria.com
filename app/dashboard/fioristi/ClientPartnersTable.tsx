'use client';

import { useState } from 'react';
import { Partner, PaymentStatus } from '@prisma/client';
import { Edit2, Building2, UserCircle2, X, Check, MapPin, Phone, MessageCircle, Mail, Globe, Clock, FileText, CreditCard, Filter, Download, Star, Camera, Image as ImageIcon, Calendar } from 'lucide-react';
import Link from 'next/link';
import { exportToCSV } from '@/lib/utils';

export type ExtendedPartner = Partner & { orders?: any[] };

interface Props {
    initialPartners: ExtendedPartner[];
}

export default function ClientPartnersTable({ initialPartners }: Props) {
    const [partners, setPartners] = useState<ExtendedPartner[]>(initialPartners);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'ANAGRAFICA' | 'MISSIONI' | 'FINANZA'>('ANAGRAFICA');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

    // Filters state
    const [showFilters, setShowFilters] = useState(false);
    const [filterSearch, setFilterSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');

    const [formData, setFormData] = useState<ExtendedPartner>({
        id: '',
        shopName: '',
        ownerName: '',
        uniqueCode: null,
        province: '',
        coverageArea: '',
        whatsappNumber: '',
        address: '',
        iban: '',
        vatNumber: '',
        taxCode: '',
        sdiCode: '',
        pecAddress: '',
        activeOrders: 0,
        adminRating: 5.0,
        internalNotes: '',
        isActive: true,
        paymentStatus: 'UNPAID',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        orders: [],
    });

    const openDrawer = (partner?: ExtendedPartner) => {
        if (partner) {
            setFormData(partner);
        } else {
            setFormData({
                id: '',
                shopName: '',
                ownerName: '',
                uniqueCode: null,
                province: '',
                coverageArea: '',
                whatsappNumber: '',
                address: '',
                iban: '',
                vatNumber: '',
                taxCode: '',
                sdiCode: '',
                pecAddress: '',
                activeOrders: 0,
                adminRating: 5.0,
                internalNotes: '',
                isActive: true,
                paymentStatus: 'UNPAID',
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
                orders: [],
            });
        }
        setActiveTab('ANAGRAFICA');
        setIsDrawerOpen(true);
    };

    const closeDrawer = () => setIsDrawerOpen(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const isUpdate = formData.id !== '';
        const url = isUpdate ? `/api/dashboard/partners/${formData.id}` : '/api/dashboard/partners';
        const method = isUpdate ? 'PUT' : 'POST';

        try {
            // Remove unnecessary IDs if POSTing new
            const submitData = { ...formData };
            if (!isUpdate) delete (submitData as any).id;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submitData)
            });

            if (res.ok) {
                const savedItem = await res.json();
                if (isUpdate) {
                    setPartners((prev: Partner[]) => prev.map(p => p.id === savedItem.id ? savedItem : p));
                } else {
                    setPartners((prev: Partner[]) => [savedItem, ...prev]);
                    setFormData((prev: Partner) => ({ ...prev, id: savedItem.id }));
                }
                setIsSuccess(true);
                setTimeout(() => setIsSuccess(false), 2500);
            } else {
                alert('Errore di salvataggio del fiorista.');
            }
        } catch (e) {
            alert('Errore di rete. Controllare la connessione.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleInlineState = async (partner: Partner, e: React.MouseEvent) => {
        e.stopPropagation();
        const newActiveState = !partner.isActive;
        // Optimistic UI Update
        setPartners((prev: Partner[]) => prev.map(p => p.id === partner.id ? { ...p, isActive: newActiveState } : p));

        try {
            await fetch(`/api/dashboard/partners/${partner.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: newActiveState })
            });
        } catch {
            // Revert on fail
            setPartners((prev: ExtendedPartner[]) => prev.map(p => p.id === partner.id ? { ...p, isActive: !newActiveState } : p));
        }
    };

    const handleSaveOrderDetails = async (e: React.FormEvent, order: any) => {
        e.preventDefault();
        setSavingOrderId(order.id);
        const form = e.target as HTMLFormElement;
        const cemeteryName = (form.elements.namedItem('cemeteryName') as HTMLInputElement).value;
        const gravePosition = (form.elements.namedItem('gravePosition') as HTMLInputElement).value;
        const deliveryDate = (form.elements.namedItem('deliveryDate') as HTMLInputElement).value;

        try {
            const res = await fetch(`/api/dashboard/orders/${order.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cemeteryName, gravePosition, deliveryDate })
            });
            if (res.ok) {
                const updated = await res.json();
                
                // Aggiorniamo Form Data State
                const updatedOrders = formData.orders?.map(o => o.id === order.id ? {...o, cemeteryName: updated.cemeteryName, gravePosition: updated.gravePosition, deliveryDate: updated.deliveryDate} : o) || [];
                const updatedFormData = { ...formData, orders: updatedOrders };
                setFormData(updatedFormData);
                
                // Aggiorniamo Master Table State
                setPartners(prev => prev.map(p => p.id === formData.id ? updatedFormData : p));
                
                alert('Coordinate Missione aggiornate con successo!');
            }
        } catch {
            alert('Errore aggiornamento missione');
        } finally {
            setSavingOrderId(null);
        }
    };

    const togglePaymentStatus = async (order: any, newStatus: string) => {
        try {
            const res = await fetch(`/api/dashboard/orders/${order.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partnerPaymentStatus: newStatus })
            });
            if (res.ok) {
                const updatedOrders = formData.orders?.map(o => o.id === order.id ? {...o, partnerPaymentStatus: newStatus} : o) || [];
                const updatedFormData = { ...formData, orders: updatedOrders };
                setFormData(updatedFormData);
                setPartners(prev => prev.map(p => p.id === formData.id ? updatedFormData : p));
            }
        } catch {
            alert('Errore stato pagamento');
        }
    };

    const sortedPartners = [...partners].sort((a, b) => a.shopName.localeCompare(b.shopName)).filter(p => {
        const matchSearch = p.shopName.toLowerCase().includes(filterSearch.toLowerCase()) || p.ownerName.toLowerCase().includes(filterSearch.toLowerCase()) || (p.coverageArea || '').toLowerCase().includes(filterSearch.toLowerCase());
        const matchStatus = filterStatus === 'ALL' || (filterStatus === 'ACTIVE' && p.isActive) || (filterStatus === 'INACTIVE' && !p.isActive);
        return matchSearch && matchStatus;
    });

    const handleExportCSV = () => {
        const exportData = sortedPartners.map(p => ({
            ID: p.id,
            Codice: p.uniqueCode || '-',
            Negozio: p.shopName,
            Titolare: p.ownerName,
            Provincia: p.province || '-',
            Area: p.coverageArea || 'Non definita',
            WhatsApp: p.whatsappNumber || '-',
            OrdiniAttivi: p.activeOrders,
            Stato: p.isActive ? 'Attivo' : 'Pausa'
        }));
        exportToCSV(exportData, 'fioristi_export.csv');
    };

    return (
        <div className="relative fade-in">
            {/* Action Bar */}
            <div className="flex justify-between items-center mb-6">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    {partners.length} Fioristi Operativi
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full text-sm font-semibold transition-colors shadow-sm ${showFilters ? 'bg-gray-100 text-black shadow-inner' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                        <Filter size={15} className={`${showFilters ? 'text-black' : 'text-gray-500'}`} /> Filtri avanzati
                    </button>
                    <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm">
                        <Download size={15} className="text-gray-500" /> Scarica CSV
                    </button>
                    <button
                        onClick={() => openDrawer()}
                        className="flex items-center gap-2 bg-black text-white px-5 py-2 rounded-full text-[14px] font-semibold tracking-wide shadow-md hover:scale-105 transition-all ml-2"
                    >
                        <Building2 size={16} /> Registra Fiorista
                    </button>
                </div>
            </div>

            {/* Pannello Filtri Expandibile */}
            {showFilters && (
                <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 mb-6 animate-in fade-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ricerca Testuale</label>
                            <input type="text" placeholder="Nome negozio, titolare o area..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className="w-full border-gray-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-black" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Stato Operativo</label>
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full border-gray-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-black">
                                <option value="ALL">Tutti gli stati</option>
                                <option value="ACTIVE">Solo Operativi (Attivi)</option>
                                <option value="INACTIVE">Solo In Pausa (Inattivi)</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Partner Table (Full Width) */}
            <div className="bg-white border text-left border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto w-full custom-scrollbar">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500">
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider">Codice</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider">Provincia</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider">Nome Fiorista / Negozio</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider">Area di Copertura</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider">Contatto Rapido</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider text-center">Ordini Attivi</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider text-center">Rating Admin</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider text-center">Stato</th>
                                <th className="font-semibold py-4 px-4 uppercase text-[11px] tracking-wider text-right w-24">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedPartners.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-gray-400">Nessun fiorista inserito. Clicca "Registra Fiorista"</td></tr>
                            ) : sortedPartners.map(partner => (
                                <tr key={partner.id} onClick={() => openDrawer(partner)} className="hover:bg-gray-50/50 transition-colors group cursor-pointer border-b border-dashed border-gray-100 last:border-0">
                                    <td className="py-3 px-4">
                                        <div className="font-mono text-xs font-bold bg-gray-100 px-2 py-1 rounded-md text-gray-700 whitespace-nowrap">{partner.uniqueCode || 'N/D'}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="font-bold text-gray-800 text-sm">{partner.province || 'XX'}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                                                <UserCircle2 size={24} className="text-gray-400" />
                                            </div>
                                            <div className="flex flex-col">
                                                <div className="font-semibold text-gray-900">{partner.shopName}</div>
                                                <div className="text-xs text-gray-500 font-medium">{partner.ownerName}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        {partner.coverageArea ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-gray-50 text-gray-700 border border-gray-200 whitespace-nowrap">
                                                <MapPin size={12} /> {partner.coverageArea}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4">
                                        {partner.whatsappNumber ? (
                                            <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                                                <MessageCircle size={15} className="text-emerald-500" />
                                                {partner.whatsappNumber}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 text-xs">Mancante</span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold border border-gray-200">
                                            {partner.activeOrders}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="inline-flex items-center gap-1 font-semibold text-gray-800">
                                            <Star size={14} className="text-[#D4AF37]" fill="currentColor" />
                                            {partner.adminRating.toFixed(1)}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={(e) => toggleInlineState(partner, e)}
                                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${partner.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                                role="switch"
                                                aria-checked={partner.isActive}
                                            >
                                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${partner.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </button>
                                            <span className={`text-[11px] font-semibold uppercase tracking-wider ${partner.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                {partner.isActive ? 'Attivo' : 'Pausa'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); openDrawer(partner); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <Edit2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* OVERLAY SFONDO DRAWER (Invisibile per click-to-close) */}
            {isDrawerOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={closeDrawer}
                ></div>
            )}

            {/* CREATOR DRAWER */}
            <div className={`fixed top-16 right-0 w-[50vw] h-[calc(100vh-4rem)] bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header DEDICATO */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">{formData.id ? `Modifica Fiorista / ${formData.uniqueCode || 'N/D'}` : 'Nuovo Fiorista'}</div>
                        {formData.id ? (
                            <Link href={`/dashboard/fioristi/${formData.id}`} className="group flex flex-col gap-0.5 transition-colors cursor-pointer" title="Apri Dossier Completo">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {formData.ownerName}
                                    <span className="text-xs ml-2 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Apri ↳</span>
                                </h2>
                                <p className="text-gray-500 font-medium flex items-center gap-1.5"><Building2 size={13} className="text-fm-gold" /> {formData.shopName}</p>
                                <p className="text-gray-400 text-xs mt-1">
                                    <span className="font-bold">Codice:</span> {formData.uniqueCode || '-'} | <span className="font-bold">Provincia:</span> {formData.province || '-'}
                                </p>
                            </Link>
                        ) : (
                            <h3 className="text-xl font-display font-semibold text-gray-900 flex items-center gap-2">
                                <Building2 size={20} className="text-fm-gold" /> DOSSIER FIORISTA
                            </h3>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="submit"
                            form="partnerForm"
                            disabled={isSubmitting || isSuccess}
                            className={`!bg-blue-600 !text-white !font-bold py-2 px-6 rounded-md transition-all flex items-center gap-2 shadow-sm ${isSuccess ? '!bg-yellow-500 hover:!bg-yellow-600' : 'hover:!bg-blue-700'} ${isSubmitting ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            {isSubmitting ? (
                                <>SALVATAGGIO...</>
                            ) : isSuccess ? (
                                <>SALVATO!</>
                            ) : (
                                <>SALVA</>
                            )}
                        </button>
                        <button type="button" onClick={closeDrawer} className="p-2.5 bg-white rounded-full text-gray-400 hover:text-black hover:bg-gray-200 shadow-sm transition-all border border-gray-100">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body Tabs Nav forzato */}
                <div className="flex items-center gap-6 px-6 pt-4 border-b border-gray-100 uppercase tracking-widest text-[11px] font-bold shrink-0">
                    <button onClick={() => setActiveTab('ANAGRAFICA')} className={`pb-3 border-b-2 transition-colors ${activeTab === 'ANAGRAFICA' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>Anagrafica & Bot</button>
                    <button onClick={() => setActiveTab('MISSIONI')} className={`pb-3 border-b-2 transition-colors ${activeTab === 'MISSIONI' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>
                        Ordini ({(formData.orders || []).length})
                    </button>
                    <button onClick={() => setActiveTab('FINANZA')} className={`pb-3 border-b-2 transition-colors ${activeTab === 'FINANZA' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>Amministrazione</button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar text-sm pb-10 bg-[#FAFAFA]">
                    
                    {/* TAB: ANAGRAFICA (E Nuovo Fiorista se id vuoto) */}
                    <form id="partnerForm" onSubmit={handleSubmit} className={activeTab === 'ANAGRAFICA' ? 'space-y-5 block' : 'hidden'}>

                        {/* Sezione Pubblica / Operativa */}
                        <div className="space-y-5">
                            <h4 className="flex items-center gap-2 font-bold text-gray-800 uppercase tracking-wide border-b pb-2">
                                <UserCircle2 size={16} className="text-gray-400" /> Dati Operativi (Bot WhatsApp)
                            </h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nome Negozio</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.shopName || ''}
                                        onChange={e => setFormData({ ...formData, shopName: e.target.value })}
                                        placeholder="Le Rose di Como..."
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Titolare / Fiorista</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.ownerName || ''}
                                        onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                                        placeholder="Nome e Cognome..."
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Provincia [OBBLIGATORIO]</label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={2}
                                        value={formData.province || ''}
                                        onChange={e => setFormData({ ...formData, province: e.target.value.toUpperCase() })}
                                        placeholder="Es. RM, MI, CO"
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-amber-500 transition-all font-bold uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Numero WhatsApp (Es. +39...)</label>
                                    <div className="relative">
                                        <MessageCircle size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                                        <input
                                            type="text"
                                            value={formData.whatsappNumber || ''}
                                            onChange={e => setFormData({ ...formData, whatsappNumber: e.target.value })}
                                            placeholder="+39 333 1234567"
                                            className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Area di Copertura</label>
                                    <div className="relative">
                                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                                        <input
                                            type="text"
                                            value={formData.coverageArea || ''}
                                            onChange={e => setFormData({ ...formData, coverageArea: e.target.value })}
                                            placeholder="Provincia di Milano..."
                                            className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Indirizzo Fisico</label>
                                    <input
                                        type="text"
                                        value={formData.address || ''}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                        placeholder="Via Roma 123..."
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Dettagli Pagamento (IBAN/PayPal)</label>
                                <div className="relative">
                                    <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={formData.iban || ''}
                                        onChange={e => setFormData({ ...formData, iban: e.target.value })}
                                        placeholder="IT00 X0000 0000 0000 0000 0000"
                                        className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Dati Fiscali e Fatturazione */}
                        <div className="space-y-5 bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                            <h4 className="flex items-center gap-2 font-bold text-blue-800 uppercase tracking-wide border-b border-blue-200 pb-2">
                                <FileText size={16} className="text-blue-600" /> Dati Fiscali e Fatturazione
                            </h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Partita IVA</label>
                                    <input
                                        type="text"
                                        maxLength={11}
                                        value={formData.vatNumber || ''}
                                        onChange={e => setFormData({ ...formData, vatNumber: e.target.value.replace(/\D/g, '') })}
                                        placeholder="Es. 01234567890"
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                    />
                                    <p className="mt-1.5 text-[10px] text-gray-400 font-medium">es. 01234567890 (11 numeri)</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Codice Fiscale</label>
                                    <input
                                        type="text"
                                        maxLength={16}
                                        value={formData.taxCode || ''}
                                        onChange={e => setFormData({ ...formData, taxCode: e.target.value.toUpperCase() })}
                                        placeholder="Es. RSSMRA..."
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono uppercase"
                                    />
                                    <p className="mt-1.5 text-[10px] text-gray-400 font-medium">16 caratteri o 11 numeri se società</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Codice SDI</label>
                                    <input
                                        type="text"
                                        maxLength={7}
                                        value={formData.sdiCode || ''}
                                        onChange={e => setFormData({ ...formData, sdiCode: e.target.value.toUpperCase() })}
                                        placeholder="Es. M5UXCR1"
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono uppercase"
                                    />
                                    <p className="mt-1.5 text-[10px] text-gray-400 font-medium">es. M5UXCR1 (7 caratteri)</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Indirizzo PEC</label>
                                    <input
                                        type="email"
                                        value={formData.pecAddress || ''}
                                        onChange={e => setFormData({ ...formData, pecAddress: e.target.value })}
                                        placeholder="email@pec.it"
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                    <p className="mt-1.5 text-[10px] text-gray-400 font-medium">es. fiorista@pec.it</p>
                                </div>
                            </div>
                        </div>

                        {/* Area Privata / Admin Only */}
                        <div className="space-y-5 bg-amber-50/50 p-5 rounded-2xl border border-amber-100">
                            <h4 className="flex items-center gap-2 font-bold text-amber-800 uppercase tracking-wide border-b border-amber-200 pb-2">
                                <FileText size={16} className="text-amber-600" /> Area Privata Admin
                            </h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rating Admin (0 - 5)</label>
                                    <div className="relative">
                                        <Star size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]" />
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="5"
                                            value={formData.adminRating}
                                            onChange={e => setFormData({ ...formData, adminRating: parseFloat(e.target.value) || 0 })}
                                            className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-bold"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ordini in Carico (Counter)</label>
                                    <input
                                        type="number"
                                        value={formData.activeOrders}
                                        onChange={e => setFormData({ ...formData, activeOrders: parseInt(e.target.value) || 0 })}
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 bg-gray-50 text-gray-600 font-bold"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Note Interne (Non API)</label>
                                <textarea
                                    value={formData.internalNotes || ''}
                                    onChange={e => setFormData({ ...formData, internalNotes: e.target.value })}
                                    placeholder="Annotazioni su ritardi, affidabilità, sconti pattuiti... mai visibili"
                                    className="w-full border-amber-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-amber-500 transition-all min-h-[100px] resize-none bg-white text-gray-700"
                                />
                            </div>
                        </div>

                    </form>

                    {/* TAB: MISSIONI E PROVE VISIVE */}
                    {activeTab === 'MISSIONI' && (
                        <div className="space-y-6">
                            {(formData.orders || []).length === 0 ? (
                                <div className="text-center py-10 bg-white rounded-2xl border border-gray-200 shadow-sm">
                                    <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">Ancora nessun ordine assegnato a questo fiorista.</p>
                                </div>
                            ) : (
                                (formData.orders || []).map((order) => {
                                    const productName = order.items?.[0]?.product?.name || 'Prodotto Sconosciuto';
                                    return (
                                    <div key={order.id} className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden flex flex-col">
                                        <div className="bg-blue-50/50 px-5 py-3 border-b border-blue-100 flex items-center justify-between">
                                             <div>
                                                 <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block">ID Ordine</span>
                                                 <span className="font-mono font-bold text-gray-800">{order.orderNumber || order.id.slice(0,8).toUpperCase()}</span>
                                             </div>
                                             <div className="text-right flex flex-col items-end">
                                                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Defunto</span>
                                                 <span className="font-semibold text-gray-800">{order.deceasedName}</span>
                                                 {(order.latitude && order.longitude) && (
                                                     <a href={`https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`} target="_blank" rel="noopener noreferrer" className="mt-2 text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-200 transition-colors flex items-center gap-1">
                                                         📍 Apri Navigatore
                                                     </a>
                                                 )}
                                             </div>
                                        </div>

                                        <div className="p-5 flex flex-col md:flex-row gap-6">
                                             {/* Modulo Dati Estesi e Modifica Ordine */}
                                             <div className="flex-1 space-y-5">
                                                 
                                                 {/* Box Info Ordine */}
                                                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Prodotto Acquistato</span>
                                                            <span className="text-sm font-semibold text-gray-900">{productName}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Utente Appaltante</span>
                                                            <span className="text-sm font-semibold text-gray-900">{order.buyerFullName || order.user?.name || 'Utente Sconosciuto'}</span>
                                                        </div>
                                                    </div>
                                                    {(order.ticketMessage || order.additionalInstructions) && (
                                                        <div className="pt-3 border-t border-gray-200/50 space-y-2">
                                                            {order.ticketMessage && (
                                                                <div className="flex gap-2">
                                                                    <MessageCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
                                                                    <p className="text-xs italic text-gray-600">"{order.ticketMessage}"</p>
                                                                </div>
                                                            )}
                                                            {order.additionalInstructions && (
                                                                <div className="flex gap-2">
                                                                    <Check size={14} className="text-orange-500 shrink-0 mt-0.5" />
                                                                    <p className="text-xs text-gray-600"><span className="font-semibold">Note:</span> {order.additionalInstructions}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                 </div>

                                                 <form onSubmit={(e) => handleSaveOrderDetails(e, order)} className="space-y-4">
                                                     <div className="grid grid-cols-2 gap-3">
                                                         <div>
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase">Cimitero (Target)</label>
                                                            <input type="text" name="cemeteryName" defaultValue={order.cemeteryName} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none" required />
                                                         </div>
                                                         <div>
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Posizione Tomba</label>
                                                            {!order.gravePosition ? (
                                                                <div className="bg-orange-50 text-orange-700 text-xs p-2 rounded-lg border border-orange-200 font-medium">
                                                                    ⚠️ Posizione incerta. Se presente, consulta il custode. Se assente, contatta l'assistenza per supporto telefonico.
                                                                </div>
                                                            ) : (
                                                                <input type="text" name="gravePosition" defaultValue={order.gravePosition} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none bg-gray-50" />
                                                            )}
                                                         </div>
                                                     </div>
                                                     <div>
                                                         <label className="text-[10px] font-bold text-gray-400 uppercase">Data Target Consegna</label>
                                                         <input type="date" name="deliveryDate" defaultValue={order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : ''} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none" required />
                                                     </div>
                                                     <button type="submit" disabled={savingOrderId === order.id} className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2 rounded-lg text-xs transition duration-200 disabled:opacity-50">
                                                         {savingOrderId === order.id ? 'Salvataggio...' : 'Applica Modifiche Ordine'}
                                                     </button>
                                                 </form>
                                             </div>

                                             {/* Preview Foto Assegnate (Grandi) */}
                                             <div className="md:w-[320px] shrink-0 bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col items-center">
                                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Prove Visive (S3)</div>
                                                {order.photos && order.photos.length > 0 ? (
                                                    <div className="flex gap-3 w-full overflow-x-auto pb-2 custom-scrollbar snap-x">
                                                        {order.photos.map((photo: string, idx: number) => (
                                                            <img key={idx} src={photo} alt="Prova visiva fiorista" className="w-[140px] h-[140px] object-cover rounded-xl border border-gray-200 shadow-sm shrink-0 snap-center transition transform hover:scale-105" />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-24 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 bg-white">
                                                         <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                                                         <span className="text-xs">Nessuna foto ricevuta</span>
                                                    </div>
                                                )}
                                             </div>
                                        </div>
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {/* TAB: FINANZA E STATI DI PAGAMENTO */}
                    {activeTab === 'FINANZA' && (
                        <div className="space-y-6">
                            {/* Recap numerico rapido */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-white border border-red-100 rounded-2xl p-5 shadow-sm text-center">
                                     <div className="text-red-500 text-3xl font-bold font-display">
                                         {(formData.orders || []).filter(o => o.partnerPaymentStatus === 'UNPAID').length}
                                     </div>
                                     <div className="text-xs font-bold text-red-400 uppercase tracking-widest mt-1">Ordini da Saldare</div>
                                </div>
                                <div className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-sm text-center">
                                     <div className="text-emerald-500 text-3xl font-bold font-display">
                                         {(formData.orders || []).filter(o => o.partnerPaymentStatus === 'PAID').length}
                                     </div>
                                     <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mt-1">Ordini Saldati</div>
                                </div>
                            </div>

                            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100">
                                            <th className="px-5 py-3">ID</th>
                                            <th className="px-5 py-3">PRODOTTO</th>
                                            <th className="px-5 py-3 text-right">INCASSO</th>
                                            <th className="px-5 py-3 text-right">PREZZO</th>
                                            <th className="px-5 py-3 text-right">STATO PAGAMENTO</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(formData.orders || []).map(order => {
                                            const totalCustomerPrice = (order.totalPriceCents || 0) / 100;
                                            
                                            // Calcolo compenso fiorista estraendo ogni singolo articolo
                                            const COMPENSATION_MAP: Record<string, number> = {
                                                'Bouquet Tradizione': 32.50,
                                                'Corona Funebre': 97.50,
                                                'Cuscino Funerale': 65.00,
                                                'Fiori per Loculo': 26.00,
                                                'Lumino': 0.00,
                                                'Nastro': 0.00,
                                                'Biglietto': 0.00,
                                                'Cesto di Gigli': 52.00,
                                                'Mazzo Stagionale': 29.25
                                            };

                                            let floristCut = 0;
                                            if (order.items && order.items.length > 0) {
                                                floristCut = order.items.reduce((sum: number, item: any) => {
                                                    const prodName = item.product?.name || '';
                                                    if (prodName in COMPENSATION_MAP) {
                                                        return sum + COMPENSATION_MAP[prodName];
                                                    }
                                                    // Fallback 65% se non in mappa
                                                    const itemPrice = (item.priceCents || 0) / 100;
                                                    return sum + (itemPrice * 0.65);
                                                }, 0);
                                            } else {
                                                floristCut = totalCustomerPrice * 0.65;
                                            }

                                            // Estrapolo nome prodotto/i
                                            const productNames = order.items?.map((i: any) => i.product?.name).filter(Boolean).join(', ') || 'Prodotto non trovato';

                                            return (
                                            <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-5 py-3 font-mono text-xs">{order.orderNumber || order.id.slice(0,8)}</td>
                                                <td className="px-5 py-3 font-semibold text-gray-900">{productNames}</td>
                                                <td className="px-5 py-3 text-right text-gray-500">
                                                    {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totalCustomerPrice)}
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-emerald-600">
                                                    {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(floristCut)}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <button 
                                                        onClick={() => togglePaymentStatus(order, order.partnerPaymentStatus === 'PAID' ? 'UNPAID' : 'PAID')}
                                                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors ${order.partnerPaymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                                    >
                                                        {order.partnerPaymentStatus === 'PAID' ? 'SALDATO' : 'C/C IN SOSPESO'}
                                                    </button>
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

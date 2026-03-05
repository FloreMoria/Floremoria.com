'use client';

import { useState } from 'react';
import { Supplier } from '@prisma/client';
import { Edit2, Building2, UserCircle2, X, Check, MapPin, Phone, MessageCircle, Mail, Globe, Clock, FileText, CreditCard, Filter, Download, Star, Briefcase } from 'lucide-react';
import Link from 'next/link';
import { exportToCSV } from '@/lib/utils';

interface Props {
    initialSuppliers: Supplier[];
}

export default function ClientSuppliersTable({ initialSuppliers }: Props) {
    const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // Filters state
    const [showFilters, setShowFilters] = useState(false);
    const [filterSearch, setFilterSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');

    const [formData, setFormData] = useState<Supplier>({
        id: '',
        companyName: '',
        category: '',
        contactName: '',
        email: '',
        phone: '',
        vatNumber: '',
        taxCode: '',
        sdiCode: '',
        pecAddress: '',
        iban: '',
        paypalEmail: '',
        internalNotes: '',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
    });

    const openDrawer = (supplier?: Supplier) => {
        if (supplier) {
            setFormData(supplier);
        } else {
            setFormData({
                id: '',
                companyName: '',
                category: '',
                contactName: '',
                email: '',
                phone: '',
                vatNumber: '',
                taxCode: '',
                sdiCode: '',
                pecAddress: '',
                iban: '',
                paypalEmail: '',
                internalNotes: '',
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
            });
        }
        setIsDrawerOpen(true);
    };

    const closeDrawer = () => setIsDrawerOpen(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const isUpdate = formData.id !== '';
        const url = isUpdate ? `/api/dashboard/suppliers/${formData.id}` : '/api/dashboard/suppliers';
        const method = isUpdate ? 'PUT' : 'POST';

        try {
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
                    setSuppliers((prev: Supplier[]) => prev.map(s => s.id === savedItem.id ? savedItem : s));
                } else {
                    setSuppliers((prev: Supplier[]) => [savedItem, ...prev]);
                    setFormData((prev: Supplier) => ({ ...prev, id: savedItem.id }));
                }
                setIsSuccess(true);
                setTimeout(() => setIsSuccess(false), 3000);
            } else {
                alert('Errore server nel salvare il fornitore.');
            }
        } catch (error) {
            console.error(error);
            alert('Errore di connessione con il db.');
        }

        setIsSubmitting(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Sei sicuro di voler ibernare/eliminare questo fornitore?')) return;
        try {
            const res = await fetch(`/api/dashboard/suppliers/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setSuppliers(prev => prev.filter(s => s.id !== id));
                if (formData.id === id) closeDrawer();
            } else {
                alert("Impossibile eliminare");
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        try {
            // Optimistic update
            setSuppliers(prev => prev.map(s => s.id === id ? { ...s, isActive: newStatus } : s));

            const supplierToUpdate = suppliers.find(s => s.id === id);
            if (!supplierToUpdate) return;

            const res = await fetch(`/api/dashboard/suppliers/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...supplierToUpdate, isActive: newStatus })
            });

            if (!res.ok) {
                // Revert on failure
                setSuppliers(prev => prev.map(s => s.id === id ? { ...s, isActive: currentStatus } : s));
                alert("Errore nell'aggiornamento dello stato");
            }
        } catch (error) {
            console.error(error);
            setSuppliers(prev => prev.map(s => s.id === id ? { ...s, isActive: currentStatus } : s));
        }
    };

    const sortedSuppliers = [...suppliers].sort((a, b) => a.companyName.localeCompare(b.companyName)).filter(s => {
        const matchSearch = s.companyName.toLowerCase().includes(filterSearch.toLowerCase()) ||
            (s.contactName || '').toLowerCase().includes(filterSearch.toLowerCase()) ||
            s.category.toLowerCase().includes(filterSearch.toLowerCase());
        const matchStatus = filterStatus === 'ALL' || (filterStatus === 'ACTIVE' && s.isActive) || (filterStatus === 'INACTIVE' && !s.isActive);
        return matchSearch && matchStatus;
    });

    const handleExportCSV = () => {
        const exportData = sortedSuppliers.map(s => ({
            ID: s.id,
            Azienda: s.companyName,
            Categoria: s.category,
            Referente: s.contactName || '-',
            P_IVA: s.vatNumber || '-',
            IBAN: s.iban || '-',
            Stato: s.isActive ? 'Attivo' : 'Inattivo'
        }));
        exportToCSV(exportData, 'fornitori_export.csv');
    };

    const isValidIban = !formData.iban || formData.iban.length === 27;
    const isValidVat = !formData.vatNumber || formData.vatNumber.length === 11;
    const isValidTaxCode = !formData.taxCode || [11, 16].includes(formData.taxCode.length);
    const isValidSdi = !formData.sdiCode || formData.sdiCode.length === 7;

    return (
        <div className="relative fade-in">
            {/* Action Bar */}
            <div className="flex justify-between items-center mb-6">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    {suppliers.length} Fornitori Registrati
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
                        <Building2 size={16} /> Registra Fornitore
                    </button>
                </div>
            </div>

            {/* Pannello Filtri Expandibile */}
            {showFilters && (
                <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 mb-6 animate-in fade-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ricerca Testuale</label>
                            <input type="text" placeholder="Nome azienda, referente o categoria..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className="w-full border-gray-200 rounded-xl text-sm p-2 outline-none focus:ring-2 focus:ring-black" />
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

            {/* Supplier Table (Full Width) */}
            <div className="bg-white border text-left border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto w-full custom-scrollbar">
                    <table className="w-full whitespace-nowrap min-w-max">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Azienda & Categoria</th>
                                <th className="py-4 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Tipo</th>
                                <th className="py-4 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Metodo Pagamento</th>
                                <th className="py-4 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contatti</th>
                                <th className="py-4 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Stato</th>
                                <th className="py-4 px-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {sortedSuppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-gray-500 font-medium">
                                        Nessun fornitore in rubrica. Inizia aggiungendo il primo.
                                    </td>
                                </tr>
                            ) : (
                                sortedSuppliers.map(supplier => {
                                    const isForeign = (supplier.iban && !supplier.iban.toUpperCase().startsWith('IT')) || (supplier.vatNumber && !supplier.vatNumber.toUpperCase().startsWith('IT'));

                                    return (
                                        <tr key={supplier.id} onClick={() => openDrawer(supplier)} className="hover:bg-gray-50/50 transition-colors group cursor-pointer border-b border-dashed border-gray-100 last:border-0">
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                                                        <Briefcase size={20} className="text-gray-400" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="font-semibold text-gray-900">{supplier.companyName}</div>
                                                        <div className="text-xs text-gray-500 font-medium">{supplier.category}</div>
                                                        {supplier.contactName && <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1"><UserCircle2 size={10} /> {supplier.contactName}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {isForeign ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wider bg-rose-50 text-rose-600 border-rose-200">
                                                        <Globe size={10} /> Estero
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wider bg-gray-50 text-gray-500 border-gray-200">
                                                        Italia
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col gap-1.5 min-w-[120px]">
                                                    {supplier.iban ? (
                                                        <div className="flex items-center gap-1.5 text-[11px] bg-blue-50/50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100 font-mono" title={supplier.iban}><CreditCard size={12} /> {supplier.iban.substring(0, 10)}...</div>
                                                    ) : supplier.paypalEmail ? (
                                                        <div className="flex items-center gap-1.5 text-[11px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full border border-sky-100 font-mono"><Mail size={12} /> PayPal</div>
                                                    ) : <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1"><X size={10} /> Nessun Dato</span>}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col gap-1 text-sm font-medium">
                                                    {supplier.email ? (
                                                        <a href={`mailto:${supplier.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-blue-600 hover:underline">
                                                            <Mail size={12} className="text-blue-400" /> {supplier.email}
                                                        </a>
                                                    ) : <span className="text-[11px] text-gray-400 italic">No Email</span>}

                                                    {supplier.phone ? (
                                                        <a href={`tel:${supplier.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-gray-600 hover:text-black">
                                                            <Phone size={12} className="text-gray-400" /> {supplier.phone}
                                                        </a>
                                                    ) : <span className="text-[11px] text-gray-400 italic">No Tel</span>}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleToggleStatus(supplier.id, supplier.isActive); }}
                                                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border uppercase tracking-wider shadow-sm transition-all hover:scale-105 active:scale-95 ${supplier.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 hover:border-orange-300'}`}
                                                >
                                                    {supplier.isActive ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> : <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>}
                                                    {supplier.isActive ? 'ATTIVO' : 'PAUSA'}
                                                </button>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <button onClick={(e) => { e.stopPropagation(); openDrawer(supplier); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                    <Edit2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* CREATOR DRAWER */}
            <div className={`fixed top-16 right-0 w-[50vw] h-[calc(100vh-4rem)] bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header DEDICATO */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">{formData.id ? 'Modifica Fornitore' : 'Nuovo Fornitore'}</div>
                        <h3 className="text-xl font-display font-bold text-gray-900 flex items-center gap-2">
                            <Building2 size={20} className="text-fm-gold" /> DOSSIER FORNITORE {formData.companyName ? <span className="text-gray-400 mx-1">-</span> : ''} <span className="text-black">{formData.companyName}</span>
                        </h3>
                    </div>

                    <div className="flex items-center gap-3">
                        {isSuccess && <div className="text-emerald-500 font-semibold text-sm flex items-center gap-1 animate-pulse"><Check size={16} /> Salvato</div>}
                        <button type="button" onClick={closeDrawer} className="p-2.5 bg-white rounded-full text-gray-400 hover:text-black hover:bg-gray-200 shadow-sm transition-all border border-gray-100">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar relative p-6">
                    <form onSubmit={handleSubmit} className="flex flex-col h-full">
                        <div className="flex-1 space-y-8">

                            {/* Dati Base Azienda */}
                            <div className="bg-white border text-left border-gray-100 rounded-2xl p-6 shadow-sm">
                                <h4 className="text-[13px] font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-gray-100 pb-2">
                                    <Globe size={14} className="text-fm-gold" /> Dati Aziendali e Contatto
                                </h4>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Azienda / Insegna</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.companyName || ''}
                                            onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                                            placeholder="Nome fornitore..."
                                            className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoria Fornitura</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.category || ''}
                                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                                            placeholder="IT, Fiori, Nastri..."
                                            className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nominativo Referente (Opzionale)</label>
                                    <div className="relative">
                                        <UserCircle2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={formData.contactName || ''}
                                            onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                                            placeholder="Mario Rossi"
                                            className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-gray-50/50"
                                        />
                                    </div>
                                </div>

                                <h4 className="text-[12px] font-bold text-gray-700 uppercase tracking-widest flex items-center gap-2 mb-3 pt-2">
                                    <Phone size={13} className="text-gray-400" /> Contatti Diretti Azienda
                                </h4>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Email</label>
                                        <div className="relative">
                                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="email"
                                                value={formData.email || ''}
                                                onChange={e => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
                                                placeholder="info@azienda.com"
                                                className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Telefono</label>
                                        <div className="relative">
                                            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.phone || ''}
                                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                                placeholder="+39 02 123456"
                                                className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dati Fiscali ed Elettronici */}
                            <div className="bg-gray-50/50 border text-left border-gray-100 rounded-2xl p-6 shadow-sm">
                                <h4 className="text-[13px] font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-gray-200 pb-2">
                                    <FileText size={14} className="text-fm-gold" /> Dati per Fatturazione Elettronica
                                </h4>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isValidVat ? 'text-gray-500' : 'text-red-500'}`}>
                                            Partita IVA (11 Num)
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={11}
                                            value={formData.vatNumber || ''}
                                            onChange={e => setFormData({ ...formData, vatNumber: e.target.value.replace(/\D/g, '') })}
                                            placeholder="IT01234567890"
                                            className={`w-full border rounded-xl p-3 outline-none focus:ring-2 transition-all font-mono uppercase ${isValidVat ? 'border-gray-200 focus:ring-blue-500' : 'border-red-300 focus:ring-red-500 bg-red-50'}`}
                                        />
                                        {!isValidVat && <p className="text-[10px] text-red-500 mt-1 font-medium">Deve essere di 11 caratteri numerici</p>}
                                    </div>
                                    <div>
                                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isValidTaxCode ? 'text-gray-500' : 'text-red-500'}`}>
                                            Codice Fiscale (16 Lett/Num)
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={16}
                                            value={formData.taxCode || ''}
                                            onChange={e => setFormData({ ...formData, taxCode: e.target.value.toUpperCase() })}
                                            placeholder="RSSMRA80A01H501U"
                                            className={`w-full border rounded-xl p-3 outline-none focus:ring-2 transition-all font-mono uppercase ${isValidTaxCode ? 'border-gray-200 focus:ring-blue-500' : 'border-red-300 focus:ring-red-500 bg-red-50'}`}
                                        />
                                        {!isValidTaxCode && <p className="text-[10px] text-red-500 mt-1 font-medium">Spesso 16 o 11 caratteri</p>}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isValidSdi ? 'text-gray-500' : 'text-red-500'}`}>
                                            Codice SDI (7 Caratteri)
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={7}
                                            value={formData.sdiCode || ''}
                                            onChange={e => setFormData({ ...formData, sdiCode: e.target.value.toUpperCase() })}
                                            placeholder="M5UXCR1"
                                            className={`w-full border rounded-xl p-3 outline-none focus:ring-2 transition-all font-mono uppercase ${isValidSdi ? 'border-gray-200 focus:ring-blue-500' : 'border-red-300 focus:ring-red-500 bg-red-50'}`}
                                        />
                                        {!isValidSdi && <p className="text-[10px] text-red-500 mt-1 font-medium">Solitamente 7 caratteri</p>}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Indirizzo PEC</label>
                                        <div className="relative">
                                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="email"
                                                value={formData.pecAddress || ''}
                                                onChange={e => setFormData({ ...formData, pecAddress: e.target.value.toLowerCase() })}
                                                placeholder="azienda@pec.it"
                                                className="w-full border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dati Bancari e Pagamento */}
                            <div className="bg-sky-50/30 border text-left border-sky-100 rounded-2xl p-6 shadow-sm">
                                <h4 className="text-[13px] font-bold text-sky-900 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-sky-100 pb-2">
                                    <CreditCard size={14} className="text-sky-500" /> Coordinate di Pagamento
                                </h4>

                                <div className="space-y-4">
                                    <div>
                                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isValidIban ? 'text-sky-700' : 'text-red-500'}`}>
                                            IBAN (Max 27 Caratteri)
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={27}
                                            value={formData.iban || ''}
                                            onChange={e => setFormData({ ...formData, iban: e.target.value.toUpperCase().replace(/\s/g, '') })}
                                            placeholder="IT00A0000000000000000000000"
                                            className={`w-full border rounded-xl p-3 outline-none focus:ring-2 transition-all font-mono uppercase ${isValidIban ? 'border-sky-200 focus:ring-sky-500' : 'border-red-300 focus:ring-red-500 bg-red-50'}`}
                                        />
                                        {!isValidIban && <p className="text-[10px] text-red-500 mt-1 font-medium">Un IBAN standard IT è lungo 27 caratteri.</p>}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-sky-700 uppercase tracking-wider mb-2">PayPal Email (Alternativa digitale)</label>
                                        <div className="relative">
                                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" />
                                            <input
                                                type="email"
                                                value={formData.paypalEmail || ''}
                                                onChange={e => setFormData({ ...formData, paypalEmail: e.target.value })}
                                                placeholder="pagamenti@fornitore.com"
                                                className="w-full border-sky-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* Sticky Action Footer */}
                        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-6 -mx-6 -mb-6 mt-8 flex justify-between items-center z-10">
                            <div>
                                {formData.id && (
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(formData.id)}
                                        className="text-red-500 hover:text-red-600 text-[13px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 size={14} /> Elimina dal Db
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center cursor-pointer relative group">
                                    <input type="checkbox" className="sr-only peer" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                    <span className="ml-2 text-[12px] font-bold text-gray-500 uppercase tracking-wider group-hover:text-black transition-colors">{formData.isActive ? 'Attivo' : 'Pausa'}</span>
                                </label>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-black text-white px-8 py-3 rounded-full font-bold tracking-wide shadow-lg hover:shadow-xl hover:scale-105 transition-all text-sm disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting ? 'Salvataggio...' : 'SALVA MODIFICHE'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            {/* Overlay background per chiudere cliccando fuori */}
            {isDrawerOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] cursor-pointer"
                    onClick={closeDrawer}
                ></div>
            )}
        </div>
    );
}

const Trash2 = ({ size, className }: { size?: number, className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);

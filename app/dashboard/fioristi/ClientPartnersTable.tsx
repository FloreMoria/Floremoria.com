'use client';

import { useState } from 'react';
import { Partner } from '@prisma/client';
import { Edit2, Building2, UserCircle2, X, Check, MapPin, CreditCard, MessageCircle, FileText, Star } from 'lucide-react';
import Link from 'next/link';

interface Props {
    initialPartners: Partner[];
}

export default function ClientPartnersTable({ initialPartners }: Props) {
    const [partners, setPartners] = useState<Partner[]>(initialPartners);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const [formData, setFormData] = useState<Partner>({
        id: '',
        name: '',
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
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
    });

    const openDrawer = (partner?: Partner) => {
        if (partner) {
            setFormData(partner);
        } else {
            setFormData({
                id: '',
                name: '',
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
            setPartners((prev: Partner[]) => prev.map(p => p.id === partner.id ? { ...p, isActive: !newActiveState } : p));
        }
    };

    const sortedPartners = [...partners].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="relative fade-in">
            {/* Action Bar */}
            <div className="flex justify-between items-center mb-6">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    {partners.length} Fioristi Operativi
                </div>
                <button
                    onClick={() => openDrawer()}
                    className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-full text-[14px] font-semibold tracking-wide shadow-md hover:scale-105 transition-all"
                >
                    <Building2 size={16} /> Registra Fiorista
                </button>
            </div>

            {/* Partner Table (Full Width) */}
            <div className="bg-white border text-left border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto w-full custom-scrollbar">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500">
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
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                                                <UserCircle2 size={24} className="text-gray-400" />
                                            </div>
                                            <div className="font-semibold text-gray-900">{partner.name}</div>
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

            {/* CREATOR DRAWER (No Overlay, Half-Screen) */}
            <div className={`fixed right-0 top-16 h-[calc(100vh-4rem)] w-[50vw] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header DEDICATO */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">{formData.id ? 'Modifica Fiorista' : 'Nuovo Fiorista'}</div>
                        {formData.id ? (
                            <Link href={`/dashboard/fioristi/${formData.id}`} className="group flex items-center gap-2 transition-colors cursor-pointer" title="Apri Dossier Completo">
                                <h3 className="text-xl font-display font-semibold text-gray-900 group-hover:text-blue-600 flex items-center gap-2 transition-colors">
                                    <Building2 size={20} className="text-fm-gold group-hover:text-blue-500 transition-colors" />
                                    DOSSIER COMPLETO <span className="text-xs ml-2 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100 opacity-0 group-hover:opacity-100 transition-opacity">Apri ↳</span>
                                </h3>
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

                {/* Body Form */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-sm pb-10">
                    <form id="partnerForm" onSubmit={handleSubmit} className="space-y-5">

                        {/* Sezione Pubblica / Operativa */}
                        <div className="space-y-5">
                            <h4 className="flex items-center gap-2 font-bold text-gray-800 uppercase tracking-wide border-b pb-2">
                                <UserCircle2 size={16} className="text-gray-400" /> Dati Operativi (Bot WhatsApp)
                            </h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nome Negozio / Fiorista</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Es. Fioreria Rossi"
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold"
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
                                        value={formData.vatNumber || ''}
                                        onChange={e => setFormData({ ...formData, vatNumber: e.target.value })}
                                        placeholder="Es. 01234567890"
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Codice Fiscale</label>
                                    <input
                                        type="text"
                                        value={formData.taxCode || ''}
                                        onChange={e => setFormData({ ...formData, taxCode: e.target.value })}
                                        placeholder="Es. RSSMRA..."
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Codice SDI (7 Caratteri)</label>
                                    <input
                                        type="text"
                                        maxLength={7}
                                        value={formData.sdiCode || ''}
                                        onChange={e => setFormData({ ...formData, sdiCode: e.target.value.toUpperCase() })}
                                        placeholder="Es. M5UXCR1"
                                        className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono uppercase"
                                    />
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
                </div>
            </div>
        </div>
    );
}

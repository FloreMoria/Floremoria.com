'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Partner } from '@prisma/client';
import {
    ChevronLeft,
    Edit2,
    FileText,
    Pencil,
    Star,
    UserCircle2,
    X,
} from 'lucide-react';
import ClientPrintButton from './ClientPrintButton';

type Props = {
    partner: Partner;
};

export default function ClientFloristDossierHeader({ partner: initialPartner }: Props) {
    const router = useRouter();
    const [partner, setPartner] = useState(initialPartner);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [formData, setFormData] = useState<Partner>(initialPartner);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
        setPartner(initialPartner);
    }, [initialPartner]);

    const openEdit = () => {
        setFormData(partner);
        setIsEditOpen(true);
    };

    const closeEdit = () => {
        if (!isSubmitting) setIsEditOpen(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/dashboard/partners/${formData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (!res.ok) throw new Error('Salvataggio non riuscito');
            const saved = (await res.json()) as Partner;
            setPartner(saved);
            setSaveSuccess(true);
            setTimeout(() => {
                setSaveSuccess(false);
                setIsEditOpen(false);
            }, 1200);
            router.refresh();
        } catch {
            alert('Errore di salvataggio del fiorista.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <div className="shrink-0 border-b border-gray-200 bg-white shadow-sm print:hidden">
                <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4 border-b border-gray-100">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gray-100 border-2 border-white shadow-md flex items-center justify-center shrink-0">
                            <UserCircle2 size={36} className="text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900 leading-tight truncate">
                                {partner.shopName}
                            </h1>
                            <p className="text-sm text-gray-600 font-medium truncate mt-0.5">
                                {partner.ownerName}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                                <span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1.5">Codice</span>
                                    <span className="font-mono font-semibold text-gray-800">{partner.uniqueCode || 'N/D'}</span>
                                </span>
                                <span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1.5">Comune</span>
                                    <span className="font-medium text-gray-800">{partner.coverageArea || '—'}</span>
                                </span>
                                <span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1.5">Provincia</span>
                                    <span className="font-bold text-gray-800">{partner.province || '—'}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <Link
                        href="/dashboard/fioristi"
                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                        aria-label="Chiudi dossier"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </Link>
                </div>

                <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 sm:gap-3 flex-wrap">
                    <Link
                        href="/dashboard/fioristi"
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Elenco fioristi
                    </Link>
                    <button
                        type="button"
                        onClick={openEdit}
                        className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                        <Pencil className="w-4 h-4" />
                        Modifica
                    </button>
                    <ClientPrintButton />
                </div>
            </div>

            {isEditOpen ? (
                <div
                    className="fixed inset-0 z-[70] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
                    onClick={closeEdit}
                >
                    <div
                        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-[#FAF9F6] shrink-0">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                                    Modifica anagrafica
                                </p>
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Edit2 size={18} className="text-blue-600" />
                                    {partner.shopName}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={closeEdit}
                                disabled={isSubmitting}
                                className="p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                                aria-label="Chiudi modifica"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form id="floristEditForm" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6 text-sm custom-scrollbar">
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                    Dati operativi
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Nome negozio
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.shopName || ''}
                                            onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Titolare / fiorista
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.ownerName || ''}
                                            onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Provincia
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            maxLength={2}
                                            value={formData.province || ''}
                                            onChange={(e) =>
                                                setFormData({ ...formData, province: e.target.value.toUpperCase() })
                                            }
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-500 uppercase font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            WhatsApp
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.whatsappNumber || ''}
                                            onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={formData.email || ''}
                                            onChange={(e) =>
                                                setFormData({ ...formData, email: e.target.value.trim().toLowerCase() })
                                            }
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Area di copertura
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.coverageArea || ''}
                                            onChange={(e) => setFormData({ ...formData, coverageArea: e.target.value })}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Indirizzo
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.address || ''}
                                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            IBAN
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.iban || ''}
                                            onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800 flex items-center gap-2">
                                    <FileText size={14} /> Dati fiscali
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Partita IVA
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={11}
                                            value={formData.vatNumber || ''}
                                            onChange={(e) =>
                                                setFormData({ ...formData, vatNumber: e.target.value.replace(/\D/g, '') })
                                            }
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Codice fiscale
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={16}
                                            value={formData.taxCode || ''}
                                            onChange={(e) =>
                                                setFormData({ ...formData, taxCode: e.target.value.toUpperCase() })
                                            }
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Codice SDI
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={7}
                                            value={formData.sdiCode || ''}
                                            onChange={(e) =>
                                                setFormData({ ...formData, sdiCode: e.target.value.toUpperCase() })
                                            }
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            PEC
                                        </label>
                                        <input
                                            type="email"
                                            value={formData.pecAddress || ''}
                                            onChange={(e) => setFormData({ ...formData, pecAddress: e.target.value })}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800">Area admin</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Rating admin (0–5)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="5"
                                            value={formData.adminRating}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    adminRating: parseFloat(e.target.value) || 0,
                                                })
                                            }
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-yellow-500 bg-white font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Ordini in carico
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.activeOrders}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    activeOrders: parseInt(e.target.value, 10) || 0,
                                                })
                                            }
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-yellow-500 bg-white font-bold"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Note interne
                                        </label>
                                        <textarea
                                            value={formData.internalNotes || ''}
                                            onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                                            rows={3}
                                            className="w-full border border-amber-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </form>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={closeEdit}
                                disabled={isSubmitting}
                                className="px-4 py-2 rounded-full text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                            >
                                Annulla
                            </button>
                            <button
                                type="submit"
                                form="floristEditForm"
                                disabled={isSubmitting || saveSuccess}
                                className={`px-5 py-2 rounded-full text-sm font-bold text-white transition-colors disabled:opacity-70 ${
                                    saveSuccess ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                            >
                                {isSubmitting ? 'Salvataggio…' : saveSuccess ? 'Salvato!' : 'Salva modifiche'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

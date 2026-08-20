'use client';

import { useState } from 'react';
import { X, Save, Loader2, Calendar, MapPin, Euro, User, FileText, Camera, CheckCircle2 } from 'lucide-react';
import OrderDetailProofUpload from './OrderDetailProofUpload';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';

type Props = {
    order: any;
    onClose: () => void;
    onOrderUpdated: (updatedOrder: any) => void;
};

export default function FloristDeliveryEditModal({ order, onClose, onOrderUpdated }: Props) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const initialFeeEuros = order.floristCompensationCents != null
        ? (order.floristCompensationCents / 100).toFixed(2)
        : ((order.totalPriceCents / 100) * 0.65).toFixed(2);

    const formatForDatetimeInput = (iso: string | null) => {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const [form, setForm] = useState({
        deliveryDate: formatForDatetimeInput(order.deliveryDate || order.createdAt),
        cemeteryName: order.cemeteryName || '',
        cemeteryCity: order.cemeteryCity || '',
        gravePosition: order.gravePosition || '',
        status: order.status || 'ACCEPTED',
        floristCompensationEuros: initialFeeEuros,
        partnerPaymentStatus: order.partnerPaymentStatus || 'UNPAID',
        floristSettlementStatus: order.floristSettlementStatus || 'PENDING',
        deceasedName: order.deceasedName || '',
        buyerFullName: order.buyerFullName || '',
        ticketMessage: order.ticketMessage || '',
        additionalInstructions: order.additionalInstructions || '',
    });

    const proofPhotos = getOrderProofPhotos(order);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/dashboard/fioristi/deliveries/${order.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok || !data.ok || !data.order) {
                throw new Error(data.error || 'Impossibile aggiornare l\'ordine');
            }

            onOrderUpdated(data.order);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore durante il salvataggio.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 font-body overflow-y-auto"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col my-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70 shrink-0">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-0.5">
                            Modifica Ordine Registro Consegne
                        </span>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            ORDINE #{order.orderNumber || order.id.slice(0, 8).toUpperCase()}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body Form */}
                <form id="floristDeliveryEditForm" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs custom-scrollbar">
                    {error ? (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                            {error}
                        </div>
                    ) : null}

                    {/* SEZIONE 1: DATI CONSEGNA & UBICAZIONE */}
                    <div className="space-y-3 bg-blue-50/40 p-4 rounded-xl border border-blue-100">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800 flex items-center gap-2">
                            <MapPin size={14} className="text-blue-600" /> Dati Consegna & Ubicazione Sepoltura
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Data & Ora Posa Prevista/Effettiva</label>
                                <input
                                    type="datetime-local"
                                    value={form.deliveryDate}
                                    onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Cimitero / Luogo</label>
                                <input
                                    type="text"
                                    value={form.cemeteryName}
                                    onChange={(e) => setForm({ ...form, cemeteryName: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                    placeholder="Es. Cimitero Monumentale"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Comune Cimitero</label>
                                <input
                                    type="text"
                                    value={form.cemeteryCity}
                                    onChange={(e) => setForm({ ...form, cemeteryCity: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                    placeholder="Es. Roma, Pordenone"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Settore / Fila / Loculo / Sepoltura</label>
                                <input
                                    type="text"
                                    value={form.gravePosition}
                                    onChange={(e) => setForm({ ...form, gravePosition: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                    placeholder="Es. Campo 3, Fila B, Loculo 45"
                                />
                            </div>
                        </div>
                    </div>

                    {/* SEZIONE 2: STATO OPERATIVO & DATI ECONOMICI */}
                    <div className="space-y-3 bg-amber-50/40 p-4 rounded-xl border border-amber-100">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-2">
                            <Euro size={14} className="text-amber-600" /> Stato Operativo & Dati Economici Fiorista
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Stato Ordine</label>
                                <select
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                                >
                                    <option value="ACCEPTED">Assegnato (Ricevuto)</option>
                                    <option value="IN_PROGRESS">In lavorazione</option>
                                    <option value="DELIVERING">In consegna</option>
                                    <option value="COMPLETED">Consegnato (Completato)</option>
                                    <option value="CANCELLED">Annullato</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Compenso Fiorista (€)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.floristCompensationEuros}
                                    onChange={(e) => setForm({ ...form, floristCompensationEuros: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white font-bold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Stato Liquidazione</label>
                                <select
                                    value={form.partnerPaymentStatus}
                                    onChange={(e) => setForm({ ...form, partnerPaymentStatus: e.target.value as any })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500"
                                >
                                    <option value="UNPAID">In attesa (Da Pagare)</option>
                                    <option value="PROCESSING">In lavorazione (In Pagamento)</option>
                                    <option value="PAID">Liquidato (Pagato)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* SEZIONE 3: DATI CLIENTE & DESTINATARIO */}
                    <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-2">
                            <User size={14} className="text-gray-500" /> Dati Cliente, Defunto e Dedica Biglietto
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Nome Defunto</label>
                                <input
                                    type="text"
                                    value={form.deceasedName}
                                    onChange={(e) => setForm({ ...form, deceasedName: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-gray-400 font-semibold"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">Nome Cliente / Acquirente</label>
                                <input
                                    type="text"
                                    value={form.buyerFullName}
                                    onChange={(e) => setForm({ ...form, buyerFullName: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-gray-400 font-semibold"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block font-semibold text-gray-700 mb-1">Testo Dedica / Biglietto</label>
                                <textarea
                                    rows={2}
                                    value={form.ticketMessage}
                                    onChange={(e) => setForm({ ...form, ticketMessage: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-gray-400 italic"
                                    placeholder="Es. Con profondo affetto e ricordo..."
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block font-semibold text-gray-700 mb-1">Note Operative / Istruzioni Speciali per la Posa</label>
                                <textarea
                                    rows={2}
                                    value={form.additionalInstructions}
                                    onChange={(e) => setForm({ ...form, additionalInstructions: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-900 outline-none focus:ring-2 focus:ring-gray-400"
                                    placeholder="Es. Posare i fiori a sinistra della lapide, notificare il custode..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* SEZIONE 4: FOTO DI GARANZIA & PROVE */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-2">
                            <Camera size={14} className="text-[#c5a880]" /> Gestione Foto di Garanzia & Prove Visive
                        </h3>
                        <OrderDetailProofUpload
                            orderId={order.id}
                            initialBefore={proofPhotos.before}
                            initialAfter={proofPhotos.after}
                        />
                    </div>
                </form>

                {/* Footer Actions */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                        Annulla
                    </button>
                    <button
                        type="submit"
                        form="floristDeliveryEditForm"
                        disabled={submitting}
                        className="inline-flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                    >
                        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {submitting ? 'Salvataggio in corso…' : 'Salva Modifiche Ordine'}
                    </button>
                </div>
            </div>
        </div>
    );
}

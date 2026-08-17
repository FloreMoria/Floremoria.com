'use client';

import React, { useState, useEffect } from 'react';
import {
    X, Users, MapPin, Clock, Info, Package, Activity, MessageSquare, Camera, Check, Phone, Copy
} from 'lucide-react';
import OrderDetailProofUpload from './OrderDetailProofUpload';
import ShareableLinkPanel from './ShareableLinkPanel';
import { getOrderProofPhotos } from '@/lib/deliveryProof/proofPhotoUrls';
import { getOrderProductSummary } from '@/lib/orders/formatDeliveredProducts';
import { isOrderCancelled } from '@/lib/dashboardOrdersFilter';

interface OrderDetailDrawerProps {
    order: any | null;
    onClose: () => void;
    onOrderUpdated?: (updatedOrder: any) => void;
    florists: any[];
    canChangeStatus: boolean;
    isGlobalAdmin?: boolean;
    openDuplicateModal?: (order: any) => void;
}

export default function OrderDetailDrawer({
    order,
    onClose,
    onOrderUpdated,
    florists,
    canChangeStatus,
    isGlobalAdmin,
    openDuplicateModal,
}: OrderDetailDrawerProps) {
    const [localOrder, setLocalOrder] = useState<any | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [customerConfirmMessage, setCustomerConfirmMessage] = useState('');
    const [isSendingCustomerConfirm, setIsSendingCustomerConfirm] = useState(false);

    useEffect(() => {
        setLocalOrder(order);
        setCustomerConfirmMessage('');
    }, [order]);

    if (!localOrder) return null;

    const statusMap = {
        'ACCEPTED': { label: 'Ricevuto', color: 'bg-yellow-100 text-yellow-800' },
        'IN_PROGRESS': { label: 'In Lavorazione', color: 'bg-blue-100 text-blue-800' },
        'PENDING': { label: 'In Attesa', color: 'bg-orange-100 text-orange-800' },
        'DELIVERING': { label: 'In Consegna', color: 'bg-purple-100 text-purple-800' },
        'COMPLETED': { label: 'Completato', color: 'bg-green-100 text-green-800' },
        'CANCELLED': { label: 'Annullato', color: 'bg-red-100 text-red-800' }
    };

    const updateStatus = async (newStatus: string) => {
        if (!canChangeStatus) return alert("Non hai i permessi per questa azione.");

        // Optimistic Update UI
        const updated = { ...localOrder, status: newStatus };
        setLocalOrder(updated);

        try {
            const res = await fetch(`/api/dashboard/orders/${localOrder.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                const data = await res.json();
                const merged = { ...updated, ...data };
                if (onOrderUpdated) {
                    onOrderUpdated(merged);
                }
            } else {
                alert('Errore aggiornamento stato nel database.');
            }
        } catch {
            alert('Errore di connessione durante l\'aggiornamento dello stato.');
        }
    };

    const handleSaveOrder = async () => {
        setIsSaving(true);

        try {
            const res = await fetch(`/api/dashboard/orders/${localOrder.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    partnerId: localOrder.partnerId || null,
                    specialNotes: localOrder.specialNotes || '',
                    gravePosition: localOrder.gravePosition || '',
                    deliveryDate: localOrder.deliveryDate || null,
                })
            });

            if (res.ok) {
                const updated = await res.json();
                const partner = florists.find(f => f.id === localOrder.partnerId) || null;
                const merged = {
                    ...localOrder,
                    ...updated,
                    partner
                };
                
                if (onOrderUpdated) {
                    onOrderUpdated(merged);
                }
                onClose();
            } else {
                alert('Errore nel salvataggio dell\'assegnazione.');
            }
        } catch {
            alert('Errore di rete durante il salvataggio.');
        } finally {
            setIsSaving(false);
        }
    };

    const sendCustomerOrderConfirm = async () => {
        if (!localOrder?.id || isSendingCustomerConfirm) return;
        if (
            !window.confirm(
                'Inviare (o reinviare) la conferma ordine WhatsApp al cliente con il template Meta aggiornato?'
            )
        ) {
            return;
        }

        setIsSendingCustomerConfirm(true);
        try {
            const res = await fetch(
                `/api/dashboard/orders/${localOrder.id}/customer-confirm`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        force: true,
                        staffMessage: customerConfirmMessage,
                    }),
                }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
                alert(
                    data.error ||
                        data.skipped ||
                        'Invio conferma ordine non riuscito.'
                );
                return;
            }
            if (data.skipped) {
                alert(`Conferma non inviata: ${data.skipped}`);
                return;
            }
            alert('Conferma ordine WhatsApp inviata al cliente.');
            setCustomerConfirmMessage('');
        } catch {
            alert('Errore di rete durante l’invio della conferma.');
        } finally {
            setIsSendingCustomerConfirm(false);
        }
    };

    let displayInstructions = localOrder.additionalInstructions || '';
    let stripeMetadata: any = null;

    if (displayInstructions.includes('---B2B_STRIPE_METADATA---')) {
        const parts = displayInstructions.split('---B2B_STRIPE_METADATA---');
        displayInstructions = parts[0].trim();
        try {
            stripeMetadata = JSON.parse(parts[1].trim());
        } catch (e) {
            console.error('Error parsing B2B Stripe metadata:', e);
        }
    }

    const { mainProducts, accessories } = getOrderProductSummary(localOrder.items || []);

    return (
        <>
            {/* OVERLAY SFONDO DRAWER (Invisibile per click-to-close) */}
            <div
                className="fixed inset-0 z-40 bg-black/10"
                onClick={onClose}
            ></div>

            {/* ORDER DETAIL DRAWER */}
            <div className={`fixed top-16 right-0 w-[50vw] min-w-[320px] max-w-[600px] h-[calc(100vh-4rem)] bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col translate-x-0`}>
                {isOrderCancelled(localOrder) ? (
                    <div className="shrink-0 border-b border-red-200 bg-red-600 px-6 py-3 text-center text-sm font-bold uppercase tracking-wider text-white">
                        Ordine cancellato — non visibile al fiorista né alle altre bacheche
                    </div>
                ) : null}
                
                {/* Drawer Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Dettaglio Ordine</div>
                        <h3 className="text-xl font-display font-semibold text-gray-900">
                            {localOrder.orderNumber || `Ordine #${localOrder.id.substring(localOrder.id.length - 6).toUpperCase()}`} - {localOrder.buyerFullName || localOrder.deceasedName}
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        {isGlobalAdmin && openDuplicateModal && (
                            <button
                                type="button"
                                onClick={() => openDuplicateModal(localOrder)}
                                className="!bg-white !text-gray-800 !font-semibold py-2 px-4 rounded-md shadow-sm hover:!bg-gray-50 transition-all flex items-center gap-2 border border-gray-200"
                                title="Duplica ordine per nuova consegna"
                            >
                                <Copy size={16} /> Duplica
                            </button>
                        )}
                        <button
                            onClick={handleSaveOrder}
                            disabled={isSaving}
                            className="!bg-blue-600 !text-white !font-bold py-2 px-6 rounded-md shadow-sm hover:!bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? 'SALVATAGGIO...' : 'SALVA'}
                        </button>
                        <button onClick={onClose} className="p-2.5 bg-white rounded-full text-gray-400 hover:text-black hover:bg-gray-200 shadow-sm transition-all border border-gray-100">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Drawer Body - Scrollable */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar text-left">
                    {/* DETTAGLI CONSEGNA E MEMORIA */}
                    <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100 space-y-3 mb-6">
                        <h4 className="text-[13px] font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                            <Users size={14} className="text-fm-gold" /> Dettagli Consegna e Memoria
                        </h4>
                        <div className="grid grid-cols-1 gap-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Nome Defunto</span>
                                    <span className="font-bold text-gray-900 text-base">{localOrder.deceasedName || 'Non specificato'}</span>
                                </div>
                                {localOrder.agencyName && (
                                    <div>
                                        <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Agenzia Funebre (B2B Partner)</span>
                                        <span className="font-semibold text-emerald-800 text-sm bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded inline-flex items-center gap-1.5 shadow-sm">
                                            🏛️ {localOrder.agencyName}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-start gap-2">
                                <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Luogo / Cimitero</span>
                                    <span className="font-medium text-gray-800 text-sm">{localOrder.cemeteryName || 'Non specificato'}</span>
                                    {localOrder.cemeteryCity && (
                                        <span className="text-gray-500 text-xs block mt-0.5">
                                            {localOrder.cemeteryCity} {localOrder.deliveryProvince ? `(${localOrder.deliveryProvince.toUpperCase()})` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {canChangeStatus ? (
                                <div>
                                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                        Indicazioni tomba / posizione consegna
                                    </label>
                                    <input
                                        type="text"
                                        value={localOrder.gravePosition || ''}
                                        onChange={(e) =>
                                            setLocalOrder({
                                                ...localOrder,
                                                gravePosition: e.target.value,
                                            })
                                        }
                                        placeholder="Es. Settore 4, fila 12, loculo 3"
                                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Obbligatorio per sbloccare il workflow VERA (Punto A).
                                    </p>
                                </div>
                            ) : localOrder.gravePosition ? (
                                <span className="text-gray-500 text-xs block">
                                    Posizione: {localOrder.gravePosition}
                                </span>
                            ) : null}
                            <div className="flex items-start gap-2">
                                <Clock size={15} className="text-gray-400 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Data di Consegna / Cerimonia</span>
                                    {canChangeStatus ? (
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="date"
                                                value={
                                                    localOrder.deliveryDate
                                                        ? new Date(localOrder.deliveryDate).toISOString().split('T')[0]
                                                        : ''
                                                }
                                                onChange={(e) =>
                                                    setLocalOrder({
                                                        ...localOrder,
                                                        deliveryDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                                                    })
                                                }
                                                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none"
                                            />
                                            {localOrder.funeralDate && (
                                                <span className="text-xs text-gray-400 font-mono">
                                                    (Ora: {new Date(localOrder.funeralDate).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="font-medium text-gray-800 text-sm">
                                            {localOrder.funeralDate ? new Date(localOrder.funeralDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : (localOrder.deliveryDate ? new Date(localOrder.deliveryDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : 'Data non specificata')}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {displayInstructions && (
                                <div className="flex items-start gap-2 mt-2 pt-3 border-t border-gray-100">
                                    <Info size={15} className="text-gray-400 mt-0.5 shrink-0" />
                                    <div>
                                        <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Istruzioni Aggiuntive</span>
                                        <span className="text-gray-700 text-sm leading-snug whitespace-pre-wrap">{displayInstructions}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {localOrder.items?.length > 0 ? (
                        <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3 mb-6">
                            <h4 className="text-[13px] font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-gray-100">
                                <Package size={14} className="text-fm-gold" /> Prodotto ordinato
                            </h4>
                            {mainProducts.length > 0 ? (
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Composizione principale</span>
                                    <ul className="space-y-1">
                                        {mainProducts.map((line, i) => (
                                            <li key={`main-${i}`} className="text-sm font-semibold text-gray-900">
                                                {line.name}
                                                {line.quantity > 1 ? (
                                                    <span className="ml-1.5 text-xs font-bold text-fm-gold">×{line.quantity}</span>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                            {accessories.length > 0 ? (
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Accessori</span>
                                    <ul className="space-y-1">
                                        {accessories.map((line, i) => (
                                            <li key={`acc-${i}`} className="text-sm text-gray-800 flex items-center justify-between gap-2">
                                                <span>{line.name}</span>
                                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                                                    Qtà {line.quantity}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500">Nessun accessorio aggiuntivo.</p>
                            )}
                        </div>
                    ) : null}

                    {stripeMetadata && (
                        <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-100 space-y-3 mb-6">
                            <h4 className="text-[13px] font-bold text-blue-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-blue-100/50">
                                💳 Transazione Stripe Connect (Riconciliazione B2B)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                {stripeMetadata.stripeCheckoutSessionId && (
                                    <div>
                                        <span className="block text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Stripe Checkout Session ID</span>
                                        <code className="text-gray-700 bg-white px-2 py-1 rounded border border-blue-100 break-all block font-mono font-bold">{stripeMetadata.stripeCheckoutSessionId}</code>
                                    </div>
                                )}
                                {stripeMetadata.stripePaymentIntentId && (
                                    <div>
                                        <span className="block text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Stripe Payment Intent ID</span>
                                        <code className="text-gray-700 bg-white px-2 py-1 rounded border border-blue-100 break-all block font-mono font-bold">{stripeMetadata.stripePaymentIntentId}</code>
                                    </div>
                                )}
                                {stripeMetadata.stripeConnectedAccountId && (
                                    <div>
                                        <span className="block text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Stripe Connected Account ID</span>
                                        <code className="text-gray-700 bg-white px-2 py-1 rounded border border-blue-100 break-all block font-mono font-bold">{stripeMetadata.stripeConnectedAccountId}</code>
                                    </div>
                                )}
                                {stripeMetadata.casperApplicationFeeAmount !== undefined && (
                                    <div>
                                        <span className="block text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Casper Application Fee</span>
                                        <span className="font-bold text-blue-900 text-sm bg-blue-100/50 border border-blue-200 px-2.5 py-0.5 rounded inline-block">
                                            € {(Number(stripeMetadata.casperApplicationFeeAmount) / 100).toFixed(2)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* FLOW STATO */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <Activity size={16} className="text-gray-400" /> Avanzamento
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {Object.keys(statusMap).map(st => (
                                <button
                                    key={st}
                                    type="button"
                                    onClick={() => updateStatus(st)}
                                    disabled={!canChangeStatus}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide border transition-all ${localOrder.status === st ? statusMap[st as keyof typeof statusMap].color + ' ring-2 ring-offset-1 ring-blue-500/50 border-transparent' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'} ${!canChangeStatus && localOrder.status !== st ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {statusMap[st as keyof typeof statusMap].label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* MESSAGGIO BIGLIETTO */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <MessageSquare size={16} className="text-gray-400" /> Messaggio per il biglietto
                        </h4>
                        {localOrder.ticketMessage ? (
                            <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-xl relative">
                                <p className="text-orange-800 text-sm italic font-serif leading-relaxed">
                                    "{localOrder.ticketMessage}"
                                </p>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500 italic pl-1">Nessun messaggio.</div>
                        )}
                    </div>

                    {/* ASSEGNAZIONE FIORISTA */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <Users size={16} className="text-gray-400" /> Fiorista Assegnato
                        </h4>
                        {canChangeStatus ? (
                            <select
                                className="w-full text-sm text-gray-700 bg-white border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none transition-all shadow-sm font-semibold"
                                value={localOrder.partnerId || ''}
                                onChange={(e) => setLocalOrder({ ...localOrder, partnerId: e.target.value || null })}
                            >
                                <option value="">-- Nessun Fiorista --</option>
                                {florists.map((f: any) => (
                                    <option key={f.id} value={f.id} className="text-black font-semibold">
                                        {f.shopName} ({f.ownerName})
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-xl flex items-center gap-2">
                                <span>{localOrder.partner?.shopName || localOrder.partner?.ownerName || 'Nessun fiorista'}</span>
                            </div>
                        )}
                        {localOrder.partnerId && localOrder.floristDeliveryUrl ? (
                            <ShareableLinkPanel
                                label="Link mini-app fiorista"
                                url={localOrder.floristDeliveryUrl}
                                hint="Da inviare al fiorista per caricare le foto prima/dopo la posa."
                                whatsappPhone={localOrder.partner?.whatsappNumber}
                                whatsappIntro={`Link consegna FloreMoria — ordine ${localOrder.orderNumber || localOrder.id.slice(-6).toUpperCase()}:`}
                            />
                        ) : null}
                        {localOrder.gdmMagicLinkUrl ? (
                            <ShareableLinkPanel
                                label="Magic link cliente (GdM)"
                                url={localOrder.gdmMagicLinkUrl}
                                hint="Accesso cliente alle foto nel Giardino della Memoria (24h)."
                                whatsappPhone={localOrder.customerPhone}
                                whatsappIntro={`Il tuo link FloreMoria per vedere le foto in memoria di ${localOrder.deceasedName}:`}
                                enableEmailShare
                                deceasedName={localOrder.deceasedName}
                                senderName="FloreMoria"
                            />
                        ) : null}
                    </div>

                    {/* DETTAGLI CONSEGNA E NOTE */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <Info size={16} className="text-gray-400" /> Istruzioni Fiorista / Note Operative
                        </h4>
                        {canChangeStatus ? (
                            <textarea
                                className="w-full text-sm text-gray-700 bg-white border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-fm-gold focus:border-fm-gold outline-none transition-all shadow-sm min-h-[80px] resize-none"
                                value={localOrder.specialNotes || ''}
                                onChange={(e) => setLocalOrder({ ...localOrder, specialNotes: e.target.value })}
                                placeholder="Inserisci note e istruzioni per il fiorista..."
                            />
                        ) : (
                            <div className="text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-xl min-h-[48px]">
                                {localOrder.specialNotes || 'Nessuna istruzione aggiuntiva.'}
                            </div>
                        )}
                    </div>

                    {/* LINEAR TRACKING LOG */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <Clock size={16} className="text-gray-400" /> Tracking Log
                        </h4>
                        <div className="flex items-center justify-between w-full mt-4 bg-gray-50 p-6 rounded-2xl border border-gray-100 overflow-x-auto relative">
                            {/* Linea Singola di BG Orizzontale */}
                            <div className="absolute top-1/2 left-10 right-10 h-0.5 bg-gray-200 -z-0 -translate-y-1/2"></div>

                            {/* Step 1 */}
                            <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                                    <Check size={12} strokeWidth={3} />
                                </div>
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-700">Ricevuto</span>
                            </div>

                            {/* Step 2 */}
                            <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${localOrder.partnerId ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                    <Check size={12} strokeWidth={3} />
                                </div>
                                <span className={`text-[10px] uppercase tracking-wider font-semibold ${localOrder.partnerId ? 'text-gray-700' : 'text-gray-400'}`}>Assegnato</span>
                            </div>

                            {/* Step 3 */}
                            <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${['IN_PROGRESS', 'DELIVERING', 'COMPLETED'].includes(localOrder.status) ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                    <Check size={12} strokeWidth={3} />
                                </div>
                                <span className={`text-[10px] uppercase tracking-wider font-semibold ${['IN_PROGRESS', 'DELIVERING', 'COMPLETED'].includes(localOrder.status) ? 'text-gray-700' : 'text-gray-400'}`}>In Lavorazione</span>
                            </div>

                            {/* Step 4 */}
                            <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${localOrder.photos?.length >= 2 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                    <Check size={12} strokeWidth={3} />
                                </div>
                                <span className={`text-[10px] uppercase tracking-wider font-semibold ${localOrder.photos?.length >= 2 ? 'text-gray-700' : 'text-gray-400'}`}>Foto OK</span>
                            </div>

                            {/* Step 5 */}
                            <div className="flex flex-col items-center gap-2 relative z-10 bg-gray-50 px-2 min-w-[80px]">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${localOrder.status === 'COMPLETED' ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'bg-white border-2 border-gray-300 text-transparent'}`}>
                                    <Check size={12} strokeWidth={3} />
                                </div>
                                <span className={`text-[10px] uppercase tracking-wider font-semibold ${localOrder.status === 'COMPLETED' ? 'text-green-600' : 'text-gray-400'}`}>Consegnato</span>
                            </div>
                        </div>
                    </div>

                    {/* FOTO GARANZIA UPLOAD ZONE */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <Camera size={16} className="text-gray-400" /> Sincronizzazione Foto Garanzia
                        </h4>
                        <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                            Carica le foto prima e dopo la posa: trascina un&apos;immagine nel riquadro oppure clicca per selezionarla dal computer.
                        </p>
                        <OrderDetailProofUpload
                            key={localOrder.id}
                            orderId={localOrder.id}
                            initialBefore={getOrderProofPhotos(localOrder).before}
                            initialAfter={getOrderProofPhotos(localOrder).after}
                            onPhotosUpdated={(before, after) => {
                                const updated = {
                                    ...localOrder,
                                    photos: [...before, ...after],
                                    deliveryProof: {
                                        ...(localOrder.deliveryProof ?? {}),
                                        photosBeforeUrls: before,
                                        photosAfterUrls: after,
                                        photoBeforeUrl: before[0] ?? null,
                                        photoAfterUrl: after[0] ?? null,
                                    },
                                };
                                setLocalOrder(updated);
                                if (onOrderUpdated) {
                                    onOrderUpdated(updated);
                                }
                            }}
                        />
                    </div>

                    {/* CONTATTO RAPIDO + CONFERMA ORDINE WHATSAPP */}
                    {localOrder.customerPhone && (
                        <div className="pt-4 border-t border-gray-100 space-y-4">
                            <div className="space-y-2">
                                <label
                                    htmlFor={`customer-confirm-msg-${localOrder.id}`}
                                    className="block text-sm font-medium text-gray-800"
                                >
                                    Messaggio/Domanda personalizzata per il cliente (opzionale)
                                </label>
                                <textarea
                                    id={`customer-confirm-msg-${localOrder.id}`}
                                    value={customerConfirmMessage}
                                    onChange={(e) => setCustomerConfirmMessage(e.target.value)}
                                    rows={3}
                                    placeholder="Es. Possiamo chiamarla per confermare l’orario di posa?"
                                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
                                />
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Valorizza la variabile {'{{3}}'} del template di conferma. Se lasciato
                                    vuoto, Meta riceve uno spazio (parametro obbligatorio).
                                </p>
                                <button
                                    type="button"
                                    onClick={sendCustomerOrderConfirm}
                                    disabled={isSendingCustomerConfirm}
                                    className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white p-3 rounded-xl shadow-sm transition-colors font-medium text-sm"
                                >
                                    <MessageSquare size={16} />
                                    {isSendingCustomerConfirm
                                        ? 'Invio in corso…'
                                        : 'Invia conferma ordine WhatsApp'}
                                </button>
                            </div>
                            <a
                                href={`https://wa.me/${localOrder.customerPhone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white p-3 rounded-xl shadow-sm transition-colors font-medium text-sm"
                            >
                                <Phone size={16} /> Contatta su WhatsApp
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

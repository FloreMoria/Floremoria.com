'use client';

import React, { useState, useEffect } from 'react';
import Button from '@/components/Button';
import { Check, ShieldCheck, ChevronRight, ChevronLeft, Trash2, Info } from 'lucide-react';
import Autocomplete from 'react-google-autocomplete';

interface OrderItem {
    productId: string;
    name: string;
    priceCents: number;
    qty: number;
}

export default function CheckoutPage() {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [isClient, setIsClient] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Form data
    const [orderCategory, setOrderCategory] = useState<'FT' | 'FF' | 'FA' | 'FP'>('FT');
    const [ticketMessage, setTicketMessage] = useState('');

    const [deceasedName, setDeceasedName] = useState('');
    const [cemeteryName, setCemeteryName] = useState('');
    const [gravePosition, setGravePosition] = useState('');
    const [deliveryProvince, setDeliveryProvince] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');

    const [recurringType, setRecurringType] = useState<'none' | 'monthly'>('none');

    const [buyerName, setBuyerName] = useState('');
    const [buyerSurname, setBuyerSurname] = useState('');
    const [buyerEmail, setBuyerEmail] = useState('');
    const [buyerPhone, setBuyerPhone] = useState('');

    const [optimizationAlert, setOptimizationAlert] = useState(false);
    const [referralRef, setReferralRef] = useState('');

    const [minDateFT, setMinDateFT] = useState('');
    const [minDateFF, setMinDateFF] = useState('');

    useEffect(() => {
        setIsClient(true);
        const cartStr = localStorage.getItem('fm_cart');
        if (cartStr) {
            try {
                const parsed = JSON.parse(cartStr);
                setCart(parsed);

                // Smart Category Inference
                if (parsed.length > 0) {
                    const firstItemName = parsed[0].name.toLowerCase();
                    if (firstItemName.includes('funera')) setOrderCategory('FF');
                    else if (firstItemName.includes('animal')) setOrderCategory('FA');
                    else if (firstItemName.includes('ente') || firstItemName.includes('pubblic')) setOrderCategory('FP');
                    else setOrderCategory('FT');
                }

                const subStr = localStorage.getItem('fm_sub');
                if (subStr === 'true') setRecurringType('monthly');
            } catch (e) { }
        }

        // Parse query params for silent pre-fill
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const refParam = params.get('ref');
            const deceasedParam = params.get('deceased');
            const locationParam = params.get('location');
            const notesParam = params.get('notes');

            if (refParam) setReferralRef(refParam);
            if (deceasedParam) setDeceasedName(deceasedParam);
            if (notesParam) {
                setTicketMessage(notesParam.substring(0, 70));
                try {
                    const cartStr = localStorage.getItem('fm_cart');
                    let pCart = cartStr ? JSON.parse(cartStr) : [];
                    const hasTick = pCart.find((i: any) => i.productId === '6');
                    if (!hasTick) {
                        const newCart = [...pCart, { productId: '6', name: 'Biglietto', priceCents: 249, qty: 1 }];
                        setCart(newCart);
                        localStorage.setItem('fm_cart', JSON.stringify(newCart));
                    }
                } catch (e) { }
            }

            if (locationParam) {
                setCemeteryName(locationParam);
                const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
                if (apiKey) {
                    fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationParam)}&components=country:IT&key=${apiKey}`)
                        .then(res => res.json())
                        .then(data => {
                            if (data.results && data.results.length > 0) {
                                const place = data.results[0];
                                const adminArea2 = place.address_components.find((c: any) => c.types.includes('administrative_area_level_2'));
                                if (adminArea2) {
                                    setDeliveryProvince(adminArea2.short_name.toUpperCase());
                                    // Conflict logic
                                    if (place.formatted_address && !place.formatted_address.toLowerCase().includes(locationParam.toLowerCase())) {
                                        setGravePosition(prev => prev ? `${prev} (Indirizzo specificato: ${locationParam})` : `Indirizzo originario: ${locationParam}`);
                                    }
                                    setCemeteryName(place.formatted_address);
                                    setOptimizationAlert(true);
                                }
                            }
                        })
                        .catch(err => console.error(err));
                }
            }
        }

        // Fetch safe delivery times from Italy backend
        fetch('/api/delivery-time')
            .then(res => res.json())
            .then(data => {
                setMinDateFT(data.minDateFTText);
                setMinDateFF(data.minDateFFText);
                // Pre-fill deliveryDate with the first available slot to avoid user errors
                if (!deliveryDate) {
                    // Decide based on category (but might not be accurate if category resolves later, so safe to use FF if FF, else FT)
                    // We'll update the default in another hook when orderCategory is set
                }
            })
            .catch(err => console.error("Error fetching delivery time constraints", err));

    }, []);

    // Set default date when constraints are loaded and category is known
    useEffect(() => {
        if (!deliveryDate) {
            if (orderCategory === 'FF' && minDateFF) setDeliveryDate(minDateFF);
            else if (orderCategory !== 'FF' && minDateFT) setDeliveryDate(minDateFT);
        }
    }, [orderCategory, minDateFF, minDateFT]);

    const cartTotalCents = cart.reduce((acc, item) => acc + (item.priceCents * item.qty), 0);

    const toggleAccessory = (prodId: string, prodName: string, priceCents: number) => {
        const existingInfo = cart.find(i => i.productId === prodId);
        if (existingInfo) {
            const newCart = cart.filter(i => i.productId !== prodId);
            setCart(newCart);
            localStorage.setItem('fm_cart', JSON.stringify(newCart));
        } else {
            const newCart = [...cart, { productId: prodId, name: prodName, priceCents, qty: 1 }];
            setCart(newCart);
            localStorage.setItem('fm_cart', JSON.stringify(newCart));
        }
    };

    const removeItem = (prodId: string) => {
        const newCart = cart.filter(i => i.productId !== prodId);
        setCart(newCart);
        localStorage.setItem('fm_cart', JSON.stringify(newCart));
    };

    const hasAccessory = (id: string) => cart.some(i => i.productId === id);

    const completeOrder = async () => {
        if (!buyerName || !buyerEmail) {
            alert('Compila i tuoi dati obbligatori.');
            return;
        }
        setIsProcessing(true);
        try {
            const orderData = {
                cart,
                orderCategory,
                recurringType,
                buyerFullName: `${buyerName} ${buyerSurname}`.trim(),
                buyerEmail,
                buyerPhone,
                deceasedName,
                cemeteryName,
                gravePosition,
                deliveryProvince: deliveryProvince.toUpperCase(),
                deliveryDate: new Date(deliveryDate).toISOString(),
                ticketMessage,
                totalPriceCents: cartTotalCents,
                referralRef
            };

            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            if (!res.ok) throw new Error('Checkout fallito');

            const { order, marginCents } = await res.json();

            // Simula transazione bancaria (2 secondi)
            await new Promise(resolve => setTimeout(resolve, 2000));

            localStorage.removeItem('fm_cart');
            window.location.href = `/order-completed?orderId=${order?.orderNumber || ''}&margin=${marginCents}&phone=${encodeURIComponent(buyerPhone)}&prov=${deliveryProvince.toUpperCase()}`;
        } catch (error) {
            console.error(error);
            alert('Si è verificato un errore durante l\'ordine.');
            setIsProcessing(false);
        }
    };

    // Calculate Min Date for Delivery DatePicker using Backend constraints
    const getMinDeliveryDate = () => {
        return orderCategory === 'FF' && minDateFF ? minDateFF : minDateFT || '';
    };

    const isDeliveryValid = () => {
        if (!deceasedName || !cemeteryName || deliveryProvince.length !== 2 || !deliveryDate) return false;
        const d = new Date(deliveryDate);
        const h = d.getHours();
        const minDStr = getMinDeliveryDate();
        if (!minDStr) return false;

        const minD = new Date(minDStr);
        if (h < 9 || h >= 17) return false;
        if (d < minD) return false;
        return true;
    };

    if (!isClient) return null;

    if (cart.length === 0) {
        return (
            <div className="max-w-xl mx-auto py-24 text-center space-y-6">
                <h1 className="text-3xl font-display font-semibold">Il tuo carrello è vuoto</h1>
                <Button href="/fiori-sulle-tombe" variant="primary">Sfoglia il catalogo</Button>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen py-8 md:py-12">
            <div className="bg-amber-100/80 text-amber-800 text-center py-3 px-4 text-sm font-bold mb-8 max-w-3xl mx-auto rounded-xl border border-amber-200 shadow-sm animate-pulse flex items-center justify-center gap-2">
                <span className="text-xl">⚠️</span> MODALITÀ TEST ATTIVA: Nessun addebito reale verrà effettuato. Transazione Sandbox.
            </div>
            <div className="max-w-3xl mx-auto px-4 lg:px-0">

                {/* Progress bar (4 steps) */}
                <div className="mb-10 px-2">
                    <div className="flex items-center justify-between relative mb-2">
                        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 rounded-full translate-y-[-50%]"></div>
                        <div className="absolute top-1/2 left-0 h-1 bg-fm-cta -z-10 rounded-full transition-all duration-500 translate-y-[-50%]" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
                        {[1, 2, 3, 4].map(num => (
                            <div key={num} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] border-2 transition-colors ${step >= num ? 'bg-fm-cta border-fm-cta text-white shadow-sm' : 'bg-white border-gray-300 text-gray-400'}`}>
                                {step > num ? <Check size={14} /> : num}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-[10px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 px-1 opacity-70">
                        <span className={step >= 1 ? 'text-fm-cta' : ''}>Extra</span>
                        <span className={step >= 2 ? 'text-fm-cta text-center' : 'text-center'}>Memoria</span>
                        <span className={step >= 3 ? 'text-fm-cta text-center' : 'text-center'}>Opzioni</span>
                        <span className={step >= 4 ? 'text-fm-cta text-right' : 'text-right'}>Pagamento</span>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-gray-100 animate-fade-in relative min-h-[500px]">

                    {/* STEP 1: ACCESSORI */}
                    {step === 1 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-300">
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900">Vuoi aggiungere un pensiero in più?</h2>
                            </div>

                            <div className="grid md:grid-cols-2 gap-5">
                                {/* Lumino */}
                                <div className={`border-2 rounded-2xl p-5 flex items-center justify-between transition-colors ${hasAccessory('5') ? 'border-fm-cta bg-fm-cta-soft/10' : 'border-gray-100 hover:border-gray-200'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className="text-3xl">🕯️</div>
                                        <div>
                                            <h4 className="font-bold text-gray-900">Lumino Votivo</h4>
                                            <p className="text-fm-rose font-semibold italic text-sm">+ €3.49</p>
                                        </div>
                                    </div>
                                    <button onClick={() => toggleAccessory('5', 'Lumino Votivo', 349)} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${hasAccessory('5') ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}>
                                        {hasAccessory('5') ? 'Rimuovi' : 'Aggiungi'}
                                    </button>
                                </div>

                                {/* Biglietto */}
                                <div className={`border-2 rounded-2xl p-5 flex items-center justify-between transition-colors ${hasAccessory('6') ? 'border-fm-cta bg-fm-cta-soft/10' : 'border-gray-100 hover:border-gray-200'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className="text-3xl">✉️</div>
                                        <div>
                                            <h4 className="font-bold text-gray-900">Biglietto</h4>
                                            <p className="text-fm-rose font-semibold italic text-sm">+ €2.49</p>
                                        </div>
                                    </div>
                                    <button onClick={() => toggleAccessory('6', 'Biglietto', 249)} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${hasAccessory('6') ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}>
                                        {hasAccessory('6') ? 'Rimuovi' : 'Aggiungi'}
                                    </button>
                                </div>
                            </div>

                            {/* Textarea appare solo se biglietto selezionato */}
                            {hasAccessory('6') && (
                                <div className="animate-in fade-in slide-in-from-top-4 mt-6">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Il tuo messaggio di cordoglio (Max 70 caratteri):</label>
                                    <div className="relative">
                                        <textarea
                                            value={ticketMessage}
                                            onChange={e => {
                                                if (e.target.value.length <= 70) {
                                                    setTicketMessage(e.target.value);
                                                }
                                            }}
                                            placeholder="Scrivi qui il tuo messaggio..."
                                            className="w-full h-28 bg-gray-50 border-2 border-solid border-gray-200 rounded-lg p-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft focus:border-fm-cta resize-none transition-all pb-8"
                                        />
                                        <div className="absolute bottom-3 right-4 text-xs font-semibold text-gray-400">
                                            {ticketMessage.length} / 70
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 2: DATI DELLA MEMORIA */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300 pb-16">
                            <div className="text-center space-y-2 mb-6">
                                <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900">Dati della Consegna</h2>
                                <p className="text-gray-500 font-medium">Queste informazioni sono fondamentali per il nostro partner fiorista.</p>
                            </div>

                            <div className="space-y-4 max-w-lg mx-auto">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Nome e Cognome Defunto *</label>
                                    <input type="text" value={deceasedName} onChange={e => setDeceasedName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2 relative">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Cimitero / Comune *</label>
                                        <Autocomplete
                                            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                                            onPlaceSelected={(place: any) => {
                                                if (place && place.formatted_address) {
                                                    setCemeteryName(place.name && !place.formatted_address.includes(place.name) ? `${place.name}, ${place.formatted_address}` : place.formatted_address);

                                                    const adminArea2 = place.address_components?.find((c: any) => c.types.includes('administrative_area_level_2'));
                                                    if (adminArea2) {
                                                        setDeliveryProvince(adminArea2.short_name.toUpperCase());
                                                    }
                                                }
                                            }}
                                            options={{
                                                componentRestrictions: { country: "it" }
                                            }}
                                            defaultValue={cemeteryName}
                                            onChange={(e: any) => setCemeteryName(e.target.value)}
                                            placeholder="Es. Cimitero Maggiore, Milano"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pl-10 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all"
                                        />
                                        <div className="absolute top-[34px] left-3 text-gray-400">📍</div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Provincia *</label>
                                        <input type="text" value={deliveryProvince} onChange={e => setDeliveryProvince(e.target.value.substring(0, 2).toUpperCase())} placeholder="MI" maxLength={2} className="w-full uppercase font-mono bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" />
                                    </div>
                                    {optimizationAlert && (
                                        <div className="col-span-3 bg-blue-50 text-blue-700 p-2 rounded-xl text-xs font-semibold flex items-center gap-2 mt-1">
                                            <span>✨</span> Località ottimizzata per la consegna
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Aiutaci a trovarlo: ogni dettaglio guida il nostro gesto. (Opzionale)</label>
                                    <textarea value={gravePosition} onChange={e => setGravePosition(e.target.value)} placeholder="Note libere (es. 100mt dopo la fontana, Fila 4...). Se non conosci la posizione precisa, lascia vuoto." className="w-full h-20 resize-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Data e Ora (Cerimonia o Posa) *</label>

                                    <div className="flex items-start gap-2.5 mb-4 bg-gray-50/80 p-3.5 rounded-xl border border-gray-100">
                                        <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
                                        <p className="text-[13px] font-sans font-medium text-gray-600 leading-relaxed -tracking-wide">
                                            Per garantire che ogni omaggio sia creato con fiori freschi di giornata e consegnato con la massima cura e puntualità, gli orari selezionabili sono calcolati in base ai tempi minimi di preparazione necessari per onorare al meglio il tuo pensiero.
                                        </p>
                                    </div>

                                    <p className="text-sm text-fm-muted mt-1 italic block mb-2">Selezionata in automatico la prima data utile</p>
                                    <input type="datetime-local" min={getMinDeliveryDate()} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" />
                                    {deliveryDate && (() => {
                                        const d = new Date(deliveryDate);
                                        const h = d.getHours();
                                        const isOutOfHours = h < 9 || h >= 17;
                                        const minDStr = getMinDeliveryDate();
                                        const isTooEarly = minDStr ? d < new Date(minDStr) : false;
                                        if (isOutOfHours || isTooEarly) {
                                            return (
                                                <p className="text-sm text-red-500 font-medium mt-2">
                                                    Per garantire la freschezza e la cura della composizione, richiediamo un preavviso di {orderCategory === 'FF' ? '6h' : '48h'} lavorative e consegniamo tra le 09:00 e le 17:00.
                                                </p>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            </div>

                            {/* Validation Hint */}
                            {!isDeliveryValid() && (
                                <div className="text-center text-red-500 text-sm font-medium mt-4 absolute bottom-4 w-full left-0">
                                    Compila tutti i campi obbligatori con orari validi per continuare.
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3: UPSELL RICORRENTE */}
                    {step === 3 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-300">
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900">Mantieni vivo il ricordo ogni mese</h2>
                                <p className="text-gray-500 font-medium">Un bouquet fresco, puntuale, per non lasciare mai solo chi ami e mantenere vivo il ricordo.</p>
                            </div>
                            <div className="flex flex-col gap-4 max-w-xl mx-auto mt-6">
                                <label className={`p-6 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${recurringType === 'monthly' ? 'border-fm-cta bg-fm-cta-soft/10 shadow-sm' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                                    <div>
                                        <h4 className={`font-bold text-lg mb-1 flex items-center gap-2 ${recurringType === 'monthly' ? 'text-fm-cta' : 'text-gray-900'}`}>
                                            <span className="text-2xl">✨</span> Sì, attiva la consegna mensile ricorrente
                                        </h4>
                                        <p className="text-sm text-gray-500 leading-relaxed max-w-sm ml-8">Riceverai le due foto ogni mese come testimonianza della nostra presenza costante.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border-2 transition-colors ${recurringType === 'monthly' ? 'border-fm-cta bg-fm-cta text-white' : 'border-gray-300 bg-white'}`}>
                                            <input type="radio" name="recurring" value="monthly" checked={recurringType === 'monthly'} onChange={() => setRecurringType('monthly')} className="hidden" />
                                            {recurringType === 'monthly' && <Check size={16} />}
                                        </div>
                                    </div>
                                </label>
                                <label className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between opacity-80 ${recurringType === 'none' ? 'border-gray-300 bg-gray-50 shadow-none' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                                    <div>
                                        <h4 className={`font-semibold text-[15px] mb-1 ${recurringType === 'none' ? 'text-gray-700' : 'text-gray-500'}`}>No grazie, procedi con un acquisto singolo per ora</h4>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${recurringType === 'none' ? 'border-gray-500 bg-gray-500 text-white' : 'border-gray-200 bg-white'}`}>
                                            <input type="radio" name="recurring" value="none" checked={recurringType === 'none'} onChange={() => setRecurringType('none')} className="hidden" />
                                            {recurringType === 'none' && <div className="w-2 h-2 rounded-full bg-white" />}
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: PAGAMENTO */}
                    {step === 4 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-300">
                            <div className="text-center space-y-2 mb-8">
                                <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900">Riepilogo e Pagamento</h2>
                                <p className="text-gray-500 flex items-center justify-center gap-1.5"><ShieldCheck size={16} className="text-green-500" /> Sicurezza certificata</p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h3 className="font-bold text-lg text-gray-900 border-b border-gray-100 pb-2">I Tuoi Dati</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="text" placeholder="Nome *" value={buyerName} onChange={e => setBuyerName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900" />
                                        <input type="text" placeholder="Cognome" value={buyerSurname} onChange={e => setBuyerSurname(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900" />
                                    </div>
                                    <input type="email" placeholder="Email *" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900" />
                                    <input type="tel" placeholder="Cellulare" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900" />

                                    <div className="mt-6 pt-6 border-t border-gray-100 space-y-3 pb-6">
                                        <div className="flex bg-gray-50 rounded-xl border border-gray-200 p-1">
                                            <button className="flex-1 text-sm font-semibold text-gray-900 py-2.5 bg-white rounded-lg shadow-sm border border-gray-200">Carta di Credito</button>
                                            <button className="flex-1 text-sm font-semibold text-gray-500 py-2.5 hover:text-gray-900">PayPal</button>
                                        </div>
                                        <div className="border border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
                                            <span className="text-3xl mb-2">💳</span>
                                            <span className="text-sm font-medium">Stripe Sandbox Form</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-6 h-fit sticky top-6">
                                    <h3 className="font-bold text-lg text-gray-900 border-b border-gray-100 pb-3 mb-4">Riepilogo Scelte</h3>
                                    <div className="space-y-4 mb-6">
                                        {cart.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                                <div className="text-gray-900">
                                                    <span className="text-gray-500 font-semibold mr-2">{item.qty}x</span>
                                                    {item.name}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-semibold text-gray-900">€{((item.priceCents * item.qty) / 100).toFixed(2)}</span>
                                                    <button onClick={() => removeItem(item.productId)} className="text-gray-400 hover:text-red-500 transition-colors p-1" title="Rimuovi">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="pt-4 border-t border-gray-200 space-y-3 mb-6">
                                        <div className="flex justify-between items-center text-sm text-gray-500">
                                            <span>Spese di Consegna Posa d'Opera</span>
                                            <span className="text-green-600 font-semibold text-[13px] bg-green-50 px-2 py-0.5 rounded-full">GRATUITA</span>
                                        </div>
                                        {recurringType !== 'none' && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-semibold text-fm-cta">Abbonamento Mensile</span>
                                                <span className="text-fm-cta font-bold">Attivo</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="pt-4 border-t border-gray-200 flex justify-between items-end">
                                        <span className="text-lg font-bold text-gray-900">Totale</span>
                                        <span className="text-3xl font-display font-bold text-fm-rose">€{(cartTotalCents / 100).toFixed(2)}{recurringType === 'monthly' ? <span className="text-lg text-gray-500 font-medium ml-1">/ mese</span> : ''}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bottom Navigation Buttons */}
                    <div className="absolute bottom-0 left-0 w-full p-6 md:px-10 border-t border-gray-100 flex items-center justify-between bg-white rounded-b-3xl">
                        {step > 1 ? (
                            <button onClick={() => setStep(step - 1 as any)} className="flex items-center gap-2 text-gray-500 font-bold px-4 py-2 hover:bg-gray-100 rounded-full transition-colors">
                                <ChevronLeft size={18} /> Indietro
                            </button>
                        ) : <div></div>}

                        {step < 4 ? (
                            <button
                                onClick={() => setStep(step + 1 as any)}
                                disabled={step === 2 && !isDeliveryValid()}
                                className="flex items-center gap-2 bg-fm-cta text-white font-bold px-8 py-3 rounded-full hover:bg-fm-cta/90 transition-all shadow-md disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed"
                            >
                                Avanti <ChevronRight size={18} />
                            </button>
                        ) : (
                            <button
                                onClick={completeOrder}
                                disabled={isProcessing || !buyerName || !buyerEmail}
                                className="flex items-center gap-2 bg-black text-white font-bold px-8 py-3 rounded-full hover:bg-gray-800 transition-all shadow-md disabled:bg-gray-300"
                            >
                                {isProcessing ? 'Elaborazione...' : `Paga Ora €${(cartTotalCents / 100).toFixed(2)}`}
                                {!isProcessing && <Check size={18} />}
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

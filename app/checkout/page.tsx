'use client';

import React, { useState, useEffect } from 'react';
import Button from '@/components/Button';

interface OrderItem {
    productId: string;
    name: string;
    priceCents: number;
    qty: number;
    customData?: Record<string, unknown>;
}

export default function CheckoutPage() {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [subEnabled, setSubEnabled] = useState(false);
    const [email, setEmail] = useState('');
    const [isClient, setIsClient] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        setIsClient(true);
        const cartStr = localStorage.getItem('fm_cart');
        if (cartStr) {
            try {
                const parsed = JSON.parse(cartStr);
                setCart(parsed);
                // Pre-fill subscription state if already toggled previously in session
                const subStr = localStorage.getItem('fm_sub');
                if (subStr === 'true') setSubEnabled(true);
            } catch (e) { }
        }
    }, []);

    const cartTotalCents = cart.reduce((acc, item) => acc + (item.priceCents * item.qty), 0);
    const bouquet = cart.find(i => i.productId !== '5' && i.productId !== '6'); // 5 Lumino, 6 Messaggio exist?

    const toggleSub = (val: boolean) => {
        setSubEnabled(val);
        localStorage.setItem('fm_sub', val ? 'true' : 'false');
    };

    const addAccessory = (prodId: string, prodName: string, priceCents: number) => {
        const newCart = [...cart];
        const existing = newCart.find(i => i.productId === prodId);
        if (existing) {
            existing.qty += 1;
        } else {
            newCart.push({
                productId: prodId,
                name: prodName,
                priceCents,
                qty: 1
            });
        }
        setCart(newCart);
        localStorage.setItem('fm_cart', JSON.stringify(newCart));
    };

    const removeAccessory = (prodId: string) => {
        const newCart = cart.filter(i => i.productId !== prodId);
        setCart(newCart);
        localStorage.setItem('fm_cart', JSON.stringify(newCart));
    };

    const completeOrder = () => {
        setIsProcessing(true);
        setTimeout(() => {
            window.location.href = '/order-completed';
        }, 1200);
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

    if (!bouquet) {
        return (
            <div className="max-w-xl mx-auto py-24 text-center space-y-6">
                <div className="w-16 h-16 bg-fm-rose-soft.50 rounded-full flex items-center justify-center mx-auto mb-6 text-fm-rose">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h1 className="text-3xl font-display font-semibold text-fm-text">Aggiungi un omaggio floreale</h1>
                <p className="text-fm-muted font-body text-lg">
                    Gli accessori possono essere acquistati solo come supplemento a un ordine di fiori.
                    Il tuo carrello non contiene omaggi floreali.
                </p>
                <Button href="/fiori-sulle-tombe" variant="primary">Sfoglia il catalogo fiori</Button>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen py-12">
            <div className="max-w-3xl mx-auto px-4 lg:px-0">

                {/* Progress bar */}
                <div className="flex items-center justify-between mb-8 px-4 relative">
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 rounded-full"></div>
                    <div className="absolute top-1/2 left-0 h-1 bg-fm-cta -z-10 rounded-full transition-all" style={{ width: step === 1 ? '15%' : step === 2 ? '50%' : '100%' }}></div>

                    {[1, 2, 3].map(num => (
                        <div key={num} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= num ? 'bg-fm-cta border-fm-cta text-white shadow-sm' : 'bg-white border-gray-300 text-gray-400'}`}>
                            {num}
                        </div>
                    ))}
                </div>

                {/* STEP 1: ACCESSORI */}
                {step === 1 && (
                    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 space-y-8 animate-fade-in">
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-display font-bold text-fm-text">Aggiungi un pensiero in più</h2>
                            <p className="text-fm-muted font-body">Personalizza il tuo omaggio con questi accessori opzionali.</p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4 pt-4">
                            {/* Lumino */}
                            <div className="border border-gray-200 rounded-xl p-5 flex flex-col items-center text-center space-y-4 hover:border-fm-cta-soft transition-colors bg-gray-50/50">
                                <div className="w-16 h-16 bg-fm-section rounded-full flex items-center justify-center text-2xl shadow-sm">🕯️</div>
                                <div>
                                    <h4 className="font-semibold text-fm-text">Lumino votivo</h4>
                                    <p className="text-sm text-fm-muted">Luce accesa in vetro</p>
                                    <p className="font-bold text-fm-rose mt-1">€12.00</p>
                                </div>
                                {cart.some(i => i.productId === '5') ? (
                                    <button onClick={() => removeAccessory('5')} className="w-full py-2 bg-gray-200 text-fm-text rounded-lg text-sm font-medium hover:bg-gray-300">Rimuovi</button>
                                ) : (
                                    <button onClick={() => addAccessory('5', 'Lumino Votivo', 1200)} className="w-full py-2 bg-white border border-gray-300 text-fm-text rounded-lg text-sm font-medium hover:border-fm-cta hover:text-fm-cta shadow-sm">Aggiungi</button>
                                )}
                            </div>
                            {/* Messaggio */}
                            <div className="border border-gray-200 rounded-xl p-5 flex flex-col items-center text-center space-y-4 hover:border-fm-cta-soft transition-colors bg-gray-50/50">
                                <div className="w-16 h-16 bg-fm-section rounded-full flex items-center justify-center text-2xl shadow-sm">✉️</div>
                                <div>
                                    <h4 className="font-semibold text-fm-text">Biglietto personalizzato</h4>
                                    <p className="text-sm text-fm-muted">Stampa plastificata</p>
                                    <p className="font-bold text-fm-rose mt-1">€9.00</p>
                                </div>
                                {cart.some(i => i.productId === '6') ? (
                                    <button onClick={() => removeAccessory('6')} className="w-full py-2 bg-gray-200 text-fm-text rounded-lg text-sm font-medium hover:bg-gray-300">Rimuovi</button>
                                ) : (
                                    <button onClick={() => addAccessory('6', 'Biglietto plastificato', 900)} className="w-full py-2 bg-white border border-gray-300 text-fm-text rounded-lg text-sm font-medium hover:border-fm-cta hover:text-fm-cta shadow-sm">Aggiungi</button>
                                )}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100 flex justify-end">
                            <Button onClick={() => setStep(2)} variant="primary" className="px-10 py-3.5 text-lg font-semibold w-full md:w-auto">Continua</Button>
                        </div>
                    </div>
                )}

                {/* STEP 2: UPSELL ABBONAMENTO */}
                {step === 2 && (
                    <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100 animate-fade-in space-y-8">
                        {bouquet ? (
                            <div className="space-y-6">
                                <div className="text-center space-y-2">
                                    <h2 className="text-2xl md:text-3xl font-display font-bold text-fm-text">
                                        Vuoi prendertene cura nel tempo e mantenere viva la presenza?
                                    </h2>
                                    <p className="text-[17px] text-fm-muted font-body">
                                        Paghi mese per mese. Disdici quando vuoi.
                                    </p>
                                </div>

                                <div className={`rounded-xl p-5 border-2 transition-all cursor-pointer ${subEnabled ? 'bg-fm-cta-soft/10 border-fm-cta shadow-sm' : 'bg-gray-50 border-gray-200 hover:border-fm-cta-soft'}`} onClick={() => toggleSub(!subEnabled)}>
                                    <label className="flex items-start gap-4 cursor-pointer w-full pointer-events-none">
                                        <div className="relative flex-shrink-0 mt-1">
                                            <input
                                                type="checkbox"
                                                readOnly
                                                className="peer appearance-none w-6 h-6 border-2 border-gray-300 bg-white rounded-md checked:bg-fm-cta checked:border-fm-cta transition-colors"
                                                checked={subEnabled}
                                            />
                                            <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path>
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-fm-text font-medium text-lg md:text-[19px] leading-snug block mb-1.5">
                                                Ogni mese consegneremo per te il <strong className="text-fm-cta">{bouquet.name}</strong> a soli <strong>{(bouquet.priceCents / 100).toFixed(2)}€</strong>
                                            </span>
                                            <span className="text-sm border-l-2 border-fm-cta pl-2.5 text-fm-text/70 block italic">
                                                Con foto di conferma su WhatsApp ad ogni consegna mensile
                                            </span>
                                        </div>
                                    </label>

                                    {subEnabled && (
                                        <div className="mt-5 bg-green-50 text-green-800 p-3 rounded-lg text-sm font-medium flex items-center gap-2 animate-fade-in border border-green-200/60">
                                            <span className="text-lg">✅</span> Perfetto, abbiamo registrato la tua adesione.
                                        </div>
                                    )}
                                </div>

                                <div className="text-[12px] text-fm-muted pt-2 border-t border-gray-100 leading-relaxed text-center space-y-1">
                                    <p><strong>Nota:</strong> la consegna avverrà nel giorno migliore disponibile se il cimitero o il fiorista è chiuso o in caso di forte maltempo.</p>
                                    <p>L&apos;addebito successivo avverrà 7 giorni prima di ogni consegna.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-fm-muted">
                                Nessun bouquet idoneo per l&apos;abbonamento trovato nel carrello.
                            </div>
                        )}

                        <div className="pt-6 border-t border-gray-100 flex items-center justify-between gap-4">
                            <button onClick={() => setStep(1)} className="text-fm-muted font-medium hover:text-fm-text py-2 px-4 transition-colors">Indietro</button>
                            <Button onClick={() => setStep(3)} variant="primary" className="px-10 py-3.5 text-lg font-semibold w-full md:w-auto">Procedi al Checkout</Button>
                        </div>
                    </div>
                )}

                {/* STEP 3: CHECKOUT */}
                {step === 3 && (
                    <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100 animate-fade-in space-y-8">
                        <div className="text-center space-y-2 mb-8">
                            <h2 className="text-3xl font-display font-bold text-fm-text">Riepilogo e Pagamento</h2>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-4">
                            <h3 className="font-semibold text-lg border-b border-gray-200 pb-2">Il tuo ordine</h3>
                            {cart.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-fm-text text-[15px]">
                                    <div>
                                        <span className="font-medium mr-2">{item.qty}x</span>
                                        {item.name}
                                    </div>
                                    <div className="font-medium">€{((item.priceCents * item.qty) / 100).toFixed(2)}</div>
                                </div>
                            ))}
                            <div className="pt-4 border-t border-gray-200 flex justify-between items-center text-lg font-bold text-fm-text">
                                <span>Totale da pagare ora</span>
                                <span className="text-fm-rose">€{(cartTotalCents / 100).toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <h3 className="font-semibold text-lg">Dati acquirente</h3>
                            <input
                                type="email"
                                placeholder="Indirizzo Email *"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-colors"
                            />
                            {/* Dummy stripe mock */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-fm-muted text-sm space-y-2">
                                <span className="block text-xl">💳</span>
                                <p>Integrazione Stripe Simulatore Modulo</p>
                                <p>Modulo di inserimento Carta di Credito reale non incluso nella demo.</p>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100 flex items-center justify-between gap-4 flex-col-reverse md:flex-row">
                            <button onClick={() => setStep(2)} className="text-fm-muted font-medium hover:text-fm-text py-2 px-4 transition-colors w-full md:w-auto">Indietro</button>
                            <button
                                onClick={completeOrder}
                                disabled={isProcessing || !email}
                                className="bg-fm-cta text-white w-full md:w-auto font-semibold py-4 px-10 rounded-xl shadow-md disabled:opacity-50 transition-all flex justify-center items-center"
                            >
                                {isProcessing ? (
                                    <span className="animate-pulse">Pagamento in corso...</span>
                                ) : (
                                    <span>Paga €{(cartTotalCents / 100).toFixed(2)}</span>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

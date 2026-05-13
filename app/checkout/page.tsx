'use client';

import React, { useState, useEffect, useRef } from 'react';
import Button from '@/components/Button';
import { Check, ShieldCheck, ChevronRight, ChevronLeft, Trash2, Info } from 'lucide-react';
import { products } from '@/lib/products';
import {
    clearPreDeliveryPhotoPref,
    FLOREM_PRE_DELIVERY_PHOTO_PRODUCT_ID,
    mergePreDeliveryPhotoIntoCart,
} from '@/lib/floremPreDeliveryPhoto';
import type { PartnerExternalOrderPayload } from '@/lib/partnerExternalOrderData';
import { canAddProductToCart } from '@/lib/floremCartCategory';
import FloremCartCategoryModal from '@/components/FloremCartCategoryModal';

interface OrderItem {
    productId: string;
    name: string;
    priceCents: number;
    qty: number;
    slug?: string;
}

interface AppliedDiscount {
    code: string;
    offerName: string;
    discountCents: number;
    finalTotalCents: number;
}

declare global {
    interface Window {
        google?: any;
    }
}

export default function CheckoutPage() {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [isClient, setIsClient] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [cartCategoryModalOpen, setCartCategoryModalOpen] = useState(false);
    const pendingAccessoryAddRef = useRef<{ prodId: string; prodName: string; priceCents: number } | null>(null);

    // Form data
    const [orderCategory, setOrderCategory] = useState<'FT' | 'FF' | 'FA' | 'FP'>('FT');
    const [ticketMessage, setTicketMessage] = useState('');

    const [deceasedName, setDeceasedName] = useState('');
    const [cemeteryName, setCemeteryName] = useState('');
    const [gravePosition, setGravePosition] = useState('');
    const [deliveryProvince, setDeliveryProvince] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');

    const [recurringType, setRecurringType] = useState<'none' | 'monthly'>('none');

    /**
     * Solo ordini FF (Funerale): promemoria empatico cura tomba (sostituisce l’upsell abbonamento in step 2).
     *
     * POSTMAN / Integrazioni: se `true`, il backend o un worker dovrà programmare a T+10 giorni
     * un invio automatico (email e/o WhatsApp) con messaggio discreto sulla cura continuativa della tomba.
     * Oggi il flag viene inoltrato in checkout (metadata Stripe / istruzioni ordine); la pipeline di invio non è ancora cablata.
     */
    // Marketing default: su FF inviamo sempre promemoria cura tomba a +10 giorni.
    const [ffTombCareReminder10d] = useState(true);

    /**
     * Flusso «Opzioni» (step 2): abbonamento mensile SOLO per FT (Fiori sulle Tombe).
     * FF: promemoria cura tomba. PA (FA): nessuno step intermedio — checkout più rapido (ALMA / NINA).
     */
    const showTombsMonthlySubscription = orderCategory === 'FT';
    const hasMidCheckoutStep = orderCategory === 'FT';

    const [buyerName, setBuyerName] = useState('');
    const [buyerSurname, setBuyerSurname] = useState('');
    const [buyerEmail, setBuyerEmail] = useState('');
    const [buyerPhone, setBuyerPhone] = useState('');
    const [funeralDirector, setFuneralDirector] = useState('');

    const [optimizationAlert, setOptimizationAlert] = useState(false);
    const [referralRef, setReferralRef] = useState('');
    /** Email azienda partner (handoff API); salvata su Order.partnerNotifyEmail. */
    const [partnerNotifyEmail, setPartnerNotifyEmail] = useState('');
    const [newsletterOptIn, setNewsletterOptIn] = useState(false);
    const [discountCodeInput, setDiscountCodeInput] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
    const [discountError, setDiscountError] = useState('');
    const cemeteryInputRef = useRef<HTMLInputElement | null>(null);
    const placesAutocompleteRef = useRef<any>(null);
    const placesListenerRef = useRef<any>(null);

    const [minDateFT, setMinDateFT] = useState('');
    const [minDateFF, setMinDateFF] = useState('');

    useEffect(() => {
        if (isClient) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [step, isClient]);

    useEffect(() => {
        setIsClient(true);
        const cartStr = localStorage.getItem('fm_cart');
        if (cartStr) {
            try {
                const parsed = JSON.parse(cartStr) as OrderItem[];
                const merged = mergePreDeliveryPhotoIntoCart(parsed);
                setCart(merged);
                if (JSON.stringify(merged) !== JSON.stringify(parsed)) {
                    localStorage.setItem('fm_cart', JSON.stringify(merged));
                }

                // Smart Category Inference
                let inferredCategory: 'FT' | 'FF' | 'FA' | 'FP' = 'FT';
                if (parsed.length > 0) {
                    const firstItem = products.find(p => p.id === parsed[0].productId);
                    if (firstItem?.category === 'funerale') inferredCategory = 'FF';
                    else if (firstItem?.category === 'animali') inferredCategory = 'FA';
                    setOrderCategory(inferredCategory);
                }

                const subStr = localStorage.getItem('fm_sub');
                // Abbonamento mensile da preferenza home: solo se l’ordine è FT (tombe)
                if (subStr === 'true' && inferredCategory === 'FT') setRecurringType('monthly');

                const checkoutDataStr = localStorage.getItem('fm_checkout_data');
                if (checkoutDataStr) {
                    const parsedCheckout = JSON.parse(checkoutDataStr);
                    const prefillLocation =
                        parsedCheckout.comune ||
                        parsedCheckout.location ||
                        parsedCheckout.indirizzo ||
                        parsedCheckout.address;
                    if (prefillLocation && !cemeteryName) {
                        setCemeteryName(prefillLocation);
                        const provMatch = String(prefillLocation).match(/\(([A-Z]{2})\)$/i);
                        if (provMatch) {
                            setDeliveryProvince(provMatch[1].toUpperCase());
                        }
                    }
                    if (parsedCheckout.customMessage) {
                        setTicketMessage(parsedCheckout.customMessage);
                    }
                } else {
                    const comuneFromCart = (parsed as any[]).find((item) => item?.customData?.comune)?.customData?.comune;
                    if (typeof comuneFromCart === 'string' && comuneFromCart.trim() && !cemeteryName) {
                        setCemeteryName(comuneFromCart.trim());
                        const provMatch = comuneFromCart.match(/\(([A-Z]{2})\)$/i);
                        if (provMatch) {
                            setDeliveryProvince(provMatch[1].toUpperCase());
                        }
                    }
                }
            } catch (e) { }
        }

        // Parse query params for silent pre-fill
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const refParam = params.get('ref');
            const discountCodeParam = params.get('discountCode');
            const deceasedParam = params.get('deceased');
            const locationParam = params.get('location');
            const notesParam = params.get('notes');

            if (refParam) setReferralRef(refParam);
            if (discountCodeParam) setDiscountCodeInput(discountCodeParam.toUpperCase());
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

            const externalKey = params.get('externalKey');
            if (externalKey) {
                void fetch(`/api/external/handoff/${encodeURIComponent(externalKey)}`)
                    .then(async (r) => {
                        if (!r.ok) return null;
                        return r.json() as Promise<{
                            payload: PartnerExternalOrderPayload;
                        }>;
                    })
                    .then((data) => {
                        if (!data?.payload) return;
                        const p = data.payload;
                        if (p.nomeUtente) setBuyerName(p.nomeUtente);
                        if (p.cognomeUtente) setBuyerSurname(p.cognomeUtente);
                        if (p.emailUtente) setBuyerEmail(p.emailUtente);
                        if (p.telefonoUtente) setBuyerPhone(p.telefonoUtente);
                        setDeceasedName(`${p.nomeDefunto} ${p.cognomeDefunto}`.trim());
                        if (p.indirizzoConsegna) setCemeteryName(p.indirizzoConsegna);
                        const pr = p.provinciaUtente?.trim().toUpperCase().slice(0, 2);
                        if (pr && pr.length === 2) setDeliveryProvince(pr);
                        setReferralRef(p.codiceReferral);
                        setPartnerNotifyEmail(p.emailAziendaPartner);
                        const buyerAddr =
                            p.indirizzoUtente && p.cittaUtente
                                ? `Dati acquirente (partner): ${p.indirizzoUtente}, ${p.cittaUtente}${p.capUtente ? ` ${p.capUtente}` : ''}${p.provinciaUtente ? ` (${p.provinciaUtente})` : ''}`
                                : '';
                        const extra = [p.info, buyerAddr].filter(Boolean).join('\n');
                        if (extra) {
                            setTicketMessage((prev) => {
                                const next = prev ? `${prev}\n${extra}` : extra;
                                return next.slice(0, 2000);
                            });
                        }
                        try {
                            if (p.redirectUrl) {
                                sessionStorage.setItem('florem_partner_redirect_url', p.redirectUrl);
                            }
                        } catch {
                            /* ignore */
                        }
                    })
                    .catch(() => {});
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

    useEffect(() => {
        if (!deliveryDate) {
            if ((orderCategory === 'FF' || orderCategory === 'FA') && minDateFF) setDeliveryDate(minDateFF);
            else if (orderCategory !== 'FF' && orderCategory !== 'FA' && minDateFT) setDeliveryDate(minDateFT);
        }
    }, [orderCategory, minDateFF, minDateFT]);

    useEffect(() => {
        if (!isClient) return;
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) return;

        let autocomplete: any = null;

        const init = () => {
            if (!cemeteryInputRef.current || !window.google?.maps?.places || autocomplete) return;

            autocomplete = new window.google.maps.places.Autocomplete(cemeteryInputRef.current, {
                componentRestrictions: { country: 'it' },
                fields: ['name', 'formatted_address', 'address_components', 'vicinity'],
            });

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (!place) return;
                
                const normalizedLocation =
                    place.formatted_address ||
                    [place.name, place.vicinity].filter(Boolean).join(', ') ||
                    '';
                if (normalizedLocation) {
                    setCemeteryName(normalizedLocation);
                }
                const components = Array.isArray(place.address_components) ? place.address_components : [];
                const provinceComp =
                    components.find((c: any) => c.types?.includes('administrative_area_level_2')) ||
                    components.find((c: any) => c.types?.includes('administrative_area_level_1'));
                if (provinceComp?.short_name) {
                    setDeliveryProvince(String(provinceComp.short_name).slice(0, 2).toUpperCase());
                }
            });
        };

        if (window.google?.maps?.places) {
            init();
        } else {
            const scriptId = 'fm-google-places-script';
            let script = document.getElementById(scriptId) as HTMLScriptElement | null;
            if (!script) {
                script = document.createElement('script');
                script.id = scriptId;
                script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=it`;
                script.async = true;
                script.defer = true;
                script.onload = () => init();
                document.head.appendChild(script);
            } else {
                script.addEventListener('load', init);
                // Se lo script c'è già ma Google non è ancora pronto, aspettiamo un attimo
                const interval = setInterval(() => {
                    if (window.google?.maps?.places) {
                        init();
                        clearInterval(interval);
                    }
                }, 100);
                setTimeout(() => clearInterval(interval), 5000);
            }
        }
    }, [isClient, cemeteryName === '']); // Re-init se il campo viene svuotato

    useEffect(() => {
        if (orderCategory !== 'FT') {
            setRecurringType('none');
        }
    }, [orderCategory]);

    /** Evita schermata vuota se lo step 2 non esiste per questa categoria */
    useEffect(() => {
        if (!hasMidCheckoutStep && step === 2) {
            setStep(3);
        }
    }, [hasMidCheckoutStep, step]);

    const cartTotalCents = cart.reduce((acc, item) => acc + (item.priceCents * item.qty), 0);
    const finalCheckoutTotalCents = appliedDiscount?.finalTotalCents ?? cartTotalCents;

    const toggleAccessory = (prodId: string, prodName: string, priceCents: number) => {
        const existingInfo = cart.find(i => i.productId === prodId);
        if (existingInfo) {
            const newCart = cart.filter(i => i.productId !== prodId);
            setCart(newCart);
            localStorage.setItem('fm_cart', JSON.stringify(newCart));
        } else {
            const p = products.find((pr) => pr.id === prodId);
            if (p && !canAddProductToCart(cart, p)) {
                pendingAccessoryAddRef.current = { prodId, prodName, priceCents };
                setCartCategoryModalOpen(true);
                return;
            }
            const newCart = [...cart, { productId: prodId, name: prodName, priceCents, qty: 1 }];
            setCart(newCart);
            localStorage.setItem('fm_cart', JSON.stringify(newCart));
        }
    };

    const removeItem = (prodId: string) => {
        const newCart = cart.filter(i => i.productId !== prodId);
        if (prodId === FLOREM_PRE_DELIVERY_PHOTO_PRODUCT_ID) {
            clearPreDeliveryPhotoPref();
        }
        setCart(newCart);
        localStorage.setItem('fm_cart', JSON.stringify(newCart));
    };

    const hasAccessory = (id: string) => cart.some(i => i.productId === id);

    useEffect(() => {
        setAppliedDiscount((prev) => {
            if (!prev) return prev;
            const recalculatedFinal = Math.max(0, cartTotalCents - prev.discountCents);
            return { ...prev, finalTotalCents: recalculatedFinal };
        });
    }, [cartTotalCents]);

    const applyDiscountCode = async () => {
        if (!discountCodeInput.trim()) {
            setDiscountError('Inserisci un codice sconto.');
            return;
        }

        try {
            const res = await fetch('/api/checkout/validate-discount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: discountCodeInput,
                    subtotalCents: cartTotalCents,
                    buyerEmail,
                    buyerFullName: `${buyerName} ${buyerSurname}`.trim(),
                }),
            });
            const payload = await res.json();
            if (!res.ok || !payload?.ok) {
                throw new Error(payload?.error || 'Codice non valido.');
            }
            setAppliedDiscount({
                code: payload.code,
                offerName: payload.offerName,
                discountCents: payload.discountCents,
                finalTotalCents: payload.finalTotalCents,
            });
            setDiscountError('');
        } catch (error) {
            setAppliedDiscount(null);
            setDiscountError(error instanceof Error ? error.message : 'Impossibile applicare il codice.');
        }
    };

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
                ...(orderCategory === 'FF' ? { ffTombCareReminder10d } : {}),
                buyerFullName: `${buyerName} ${buyerSurname}`.trim(),
                buyerEmail,
                buyerPhone,
                deceasedName,
                cemeteryName,
                gravePosition: funeralDirector ? `${gravePosition} - Impresa Funebre: ${funeralDirector}` : gravePosition,
                deliveryProvince: deliveryProvince.toUpperCase(),
                deliveryDate: new Date(deliveryDate).toISOString(),
                ticketMessage,
                totalPriceCents: finalCheckoutTotalCents,
                referralRef,
                ...(partnerNotifyEmail.trim() ? { partnerNotifyEmail: partnerNotifyEmail.trim() } : {}),
                ...(appliedDiscount?.code ? { discountCode: appliedDiscount.code } : {}),
                newsletterOptIn,
            };

            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            if (!res.ok) {
                let serverError = 'Checkout fallito';
                try {
                    const payload = await res.json();
                    if (payload?.error && typeof payload.error === 'string') {
                        serverError = payload.error;
                    }
                } catch {
                    // fallback text below
                }
                throw new Error(serverError);
            }

            const { url } = await res.json();

            localStorage.removeItem('fm_cart');
            clearPreDeliveryPhotoPref();

            if (url) {
                window.location.href = url;
            } else {
                window.location.href = '/order-completed';
            }
        } catch (error) {
            console.error(error);
            const msg = error instanceof Error ? error.message : 'Si è verificato un errore durante l\'ordine.';
            alert(msg);
            setIsProcessing(false);
        }
    };

    // Calculate Min Date for Delivery DatePicker using Backend constraints
    const getMinDeliveryDate = () => {
        return (orderCategory === 'FF' || orderCategory === 'FA') && minDateFF ? minDateFF : minDateFT || '';
    };

    const isDeliveryValid = () => {
        if (!deceasedName || !cemeteryName || deliveryProvince.length !== 2 || !deliveryDate) return false;
        if ((orderCategory === 'FF' || orderCategory === 'FA') && !gravePosition) return false;
        
        const d = new Date(deliveryDate);
        const h = d.getHours();
        const minDStr = getMinDeliveryDate();
        if (!minDStr) return false;

        const minD = new Date(minDStr);
        if (h < 9 || h >= 17) return false;
        if (d < minD) return false;
        
        if (!buyerName || !buyerSurname || !buyerEmail || !buyerPhone) return false;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(buyerEmail)) return false;
        
        const cleanPhone = buyerPhone.replace(/[\+\s]/g, '');
        if (cleanPhone.length < 10 || cleanPhone.length > 13) return false;
        
        return true;
    };

    const goCheckoutNext = () => {
        if (step === 1) {
            if (!isDeliveryValid()) return;
            setStep(hasMidCheckoutStep ? 2 : 3);
            return;
        }
        if (step === 2) setStep(3);
    };

    const goCheckoutPrev = () => {
        if (step === 3) {
            setStep(hasMidCheckoutStep ? 2 : 1);
            return;
        }
        if (step === 2) setStep(1);
    };

    const handleCartCategoryModalCancel = () => {
        setCartCategoryModalOpen(false);
        pendingAccessoryAddRef.current = null;
    };

    const handleCartCategoryModalClearAndAdd = () => {
        const pending = pendingAccessoryAddRef.current;
        setCartCategoryModalOpen(false);
        pendingAccessoryAddRef.current = null;
        if (!pending) return;
        const newCart: OrderItem[] = [
            { productId: pending.prodId, name: pending.prodName, priceCents: pending.priceCents, qty: 1 },
        ];
        setCart(newCart);
        localStorage.setItem('fm_cart', JSON.stringify(newCart));
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

    const stripePk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
    const isStripeTestMode = stripePk.startsWith('pk_test_');

    return (
        <div className="bg-gray-50 min-h-screen py-8 md:py-12">
            {isStripeTestMode && (
                <div className="bg-amber-100/80 text-amber-800 text-center py-3 px-4 text-sm font-bold mb-8 max-w-3xl mx-auto rounded-xl border border-amber-200 shadow-sm animate-pulse flex items-center justify-center gap-2">
                    <span className="text-xl">⚠️</span> MODALITÀ TEST ATTIVA: Nessun addebito reale verrà effettuato. Transazione Sandbox.
                </div>
            )}
            <div className="max-w-3xl mx-auto px-4 lg:px-0">

                {/* Progress: 3 passi (FT/FF con step opzioni) o 2 passi (PA = solo dati → pagamento) */}
                <div className="mb-10 px-2">
                    {hasMidCheckoutStep ? (
                        <>
                            <div className="relative mb-2 flex items-center justify-between">
                                <div className="absolute top-1/2 left-0 -z-10 h-1 w-full translate-y-[-50%] rounded-full bg-gray-200"></div>
                                <div
                                    className="absolute top-1/2 left-0 -z-10 h-1 translate-y-[-50%] rounded-full bg-fm-cta transition-all duration-500"
                                    style={{ width: `${((step - 1) / 2) * 100}%` }}
                                />
                                {[1, 2, 3].map((num) => (
                                    <div
                                        key={num}
                                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-colors ${
                                            step >= num ? 'border-fm-cta bg-fm-cta text-white shadow-sm' : 'border-gray-300 bg-white text-gray-400'
                                        }`}
                                    >
                                        {step > num ? <Check size={14} /> : num}
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 opacity-70 md:text-xs">
                                <span className={step >= 1 ? 'text-fm-cta' : ''}>Dati ordine</span>
                                <span className={`text-center ${step >= 2 ? 'text-fm-cta' : ''}`}>Opzioni</span>
                                <span className={`text-right ${step >= 3 ? 'text-fm-cta' : ''}`}>Pagamento</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="relative mb-2 flex items-center justify-between px-[12%]">
                                <div className="absolute top-1/2 left-[12%] right-[12%] -z-10 h-1 translate-y-[-50%] rounded-full bg-gray-200"></div>
                                <div
                                    className="absolute top-1/2 left-[12%] -z-10 h-1 translate-y-[-50%] rounded-full bg-fm-cta transition-all duration-500"
                                    style={{ width: step >= 3 ? '76%' : '0%' }}
                                />
                                <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-colors ${
                                        step >= 1 ? 'border-fm-cta bg-fm-cta text-white shadow-sm' : 'border-gray-300 bg-white text-gray-400'
                                    }`}
                                >
                                    {step >= 3 ? <Check size={14} /> : 1}
                                </div>
                                <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-colors ${
                                        step >= 3 ? 'border-fm-cta bg-fm-cta text-white shadow-sm' : 'border-gray-300 bg-white text-gray-400'
                                    }`}
                                >
                                    2
                                </div>
                            </div>
                            <div className="flex justify-between px-[10%] text-[10px] font-semibold uppercase tracking-wider text-gray-500 opacity-70 md:text-xs">
                                <span className={step >= 1 ? 'text-fm-cta' : ''}>Dati ordine</span>
                                <span className={step >= 3 ? 'text-fm-cta' : ''}>Pagamento</span>
                            </div>
                        </>
                    )}
                </div>

                <div className="bg-white rounded-3xl p-5 md:p-7 shadow-sm border border-gray-100 animate-fade-in relative min-h-[500px]">

                    {/* STEP 1: DATI DELLA MEMORIA */}
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in duration-300 pb-6">
                            <div className="text-center space-y-1 mb-3">
                                <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900">Dati dell&apos;Ordine</h2>
                                <p className="text-gray-500 font-medium">Queste informazioni sono fondamentali per organizzare la consegna.</p>
                            </div>

                            <div className="space-y-3.5 max-w-xl mx-auto">
                                {/* SEZIONE DEFUNTO / PICCOLI AMICI */}
                                <div className="bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100 space-y-2.5">
                                    <h3 className="font-display font-bold text-lg text-gray-900 border-b border-gray-200 pb-2">
                                        {orderCategory === 'FA' ? "Dati del Piccolo Amico" : "Sezione Defunto"}
                                    </h3>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                                            {orderCategory === 'FA' ? "Nome del Piccolo Amico *" : "Nome e Cognome Defunto *"}
                                        </label>
                                        <input type="text" value={deceasedName} onChange={e => setDeceasedName(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" />
                                    </div>
                                </div>

                                {/* SEZIONE CONSEGNA */}
                                <div className="bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100 space-y-2.5">
                                    <h3 className="font-display font-bold text-lg text-gray-900 border-b border-gray-200 pb-2">Sezione Consegna</h3>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="col-span-2 relative">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                                                {orderCategory === 'FT' ? 'Cimitero / Comune *' : 'Comune *'}
                                            </label>
                                            <input
                                                ref={cemeteryInputRef}
                                                type="text"
                                                value={cemeteryName}
                                                onChange={(e) => setCemeteryName(e.target.value)}
                                                placeholder="Es. Cimitero Maggiore, Milano"
                                                autoComplete="off"
                                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 pl-10 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all"
                                            />
                                            <div className="absolute top-[34px] left-3 text-gray-400">📍</div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Provincia *</label>
                                            <input type="text" value={deliveryProvince} onChange={e => setDeliveryProvince(e.target.value.substring(0, 2).toUpperCase())} placeholder="MI" maxLength={2} className="w-full uppercase font-mono bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" />
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                                            {orderCategory === 'FF' ? "Luogo del Funerale *" : orderCategory === 'FA' ? "Luogo della funzione o di sepoltura *" : "Posizione della Tomba *"}
                                        </label>
                                        <textarea value={gravePosition} onChange={e => setGravePosition(e.target.value)} placeholder={
                                            orderCategory === 'FF' ? "Es. Chiesa San Giovanni, Via Roma" : 
                                            orderCategory === 'FA' ? "Es. Giardino dei ricordi, Fila 4..." : 
                                            "Es: campo C, fila 8, tomba 12... Se non conosci la posizione, scrivi 'NON LA CONOSCO'"
                                        } className="w-full h-16 resize-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" required />
                                    </div>

                                    {orderCategory === 'FF' && (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Impresa Funebre (non obbligatorio)</label>
                                            <input type="text" value={funeralDirector} onChange={e => setFuneralDirector(e.target.value)} placeholder="Es. Onoranze Funebri Rossi" className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" />
                                        </div>
                                    )}
                                    
                                    <div className="pt-1">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                                            {orderCategory === 'FF' ? "Data e Ora del Funerale *" : "Calendario Data e Ora *"}
                                        </label>
                                        <input type="datetime-local" min={getMinDeliveryDate()} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-cta-soft transition-all" />
                                        {deliveryDate && (() => {
                                            const d = new Date(deliveryDate);
                                            const h = d.getHours();
                                            const isOutOfHours = h < 9 || h >= 17;
                                            const minDStr = getMinDeliveryDate();
                                            const isTooEarly = minDStr ? d < new Date(minDStr) : false;
                                            if (isOutOfHours || isTooEarly) {
                                                return (
                                                    <p className="text-sm text-red-500 font-medium mt-2">
                                                        Richiediamo un preavviso di {orderCategory === 'FF' || orderCategory === 'FA' ? '4h' : '48h'} lavorative e consegniamo tra le 09:00 e le 17:00.
                                                    </p>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                </div>

                                {/* SEZIONE CONTATTO */}
                                <div className="bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100 space-y-2.5">
                                    <h3 className="font-display font-bold text-lg text-gray-900 border-b border-gray-200 pb-2">Sezione Contatto (Chi riceve la conferma)</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <input type="text" placeholder="Nome *" value={buyerName} onChange={e => setBuyerName(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900" autoComplete="given-name" />
                                        </div>
                                        <div>
                                            <input type="text" placeholder="Cognome *" value={buyerSurname} onChange={e => setBuyerSurname(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900" autoComplete="family-name" />
                                        </div>
                                    </div>
                                    <div>
                                        <input type="email" placeholder="Email *" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} className={`w-full bg-white border rounded-xl px-4 py-2.5 text-gray-900 ${buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail) ? 'border-red-400 focus:ring-red-400' : 'border-gray-200'}`} autoComplete="email" />
                                        <p className="text-[11px] text-gray-400 mt-1.5 ml-2">Necessario per ricevere la ricevuta fiscale.</p>
                                    </div>
                                    <div>
                                        <input type="tel" placeholder="Cellulare *" value={buyerPhone} onChange={e => {
                                            const val = e.target.value;
                                            if (/^\+?[0-9]*$/.test(val)) setBuyerPhone(val);
                                        }} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900" autoComplete="tel" />
                                        <p className="text-[11px] text-gray-400 mt-1.5 ml-2">
                                            {orderCategory === 'FA'
                                                ? 'Per aggiornamenti sulla consegna del tuo omaggio.'
                                                : 'Fondamentale per ricevere le due foto a consegna avvenuta.'}
                                        </p>
                                    </div>
                                </div>

                            </div>

                        </div>
                    )}

                    {step === 2 && showTombsMonthlySubscription && (
                        <div className="space-y-8 animate-in fade-in duration-300">
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900">Mantieni vivo il ricordo ogni mese</h2>
                                <p className="text-gray-500 font-medium">Un bouquet fresco, puntuale, per non lasciare mai solo chi ami e mantenere vivo il ricordo.</p>
                            </div>
                            <div className="mx-auto mt-6 flex max-w-xl flex-col gap-4">
                                <label className={`flex cursor-pointer items-center justify-between rounded-2xl border-2 p-6 transition-all ${recurringType === 'monthly' ? 'border-fm-cta bg-fm-cta-soft/10 shadow-sm' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                                    <div>
                                        <h4 className={`mb-1 flex items-center gap-2 text-lg font-bold ${recurringType === 'monthly' ? 'text-fm-cta' : 'text-gray-900'}`}>
                                            <span className="text-2xl">✨</span> Sì, attiva la consegna mensile ricorrente
                                        </h4>
                                        <p className="ml-8 max-w-sm text-sm leading-relaxed text-gray-500">Riceverai le due foto ogni mese come testimonianza della nostra presenza costante.</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition-colors ${recurringType === 'monthly' ? 'border-fm-cta bg-fm-cta text-white' : 'border-gray-300 bg-white'}`}>
                                            <input type="radio" name="recurring" value="monthly" checked={recurringType === 'monthly'} onChange={() => setRecurringType('monthly')} className="hidden" />
                                            {recurringType === 'monthly' && <Check size={16} />}
                                        </div>
                                    </div>
                                </label>
                                <label className={`flex cursor-pointer items-center justify-between rounded-2xl border-2 p-4 opacity-80 transition-all ${recurringType === 'none' ? 'border-gray-300 bg-gray-50 shadow-none' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                                    <div>
                                        <h4 className={`mb-1 text-[15px] font-semibold ${recurringType === 'none' ? 'text-gray-700' : 'text-gray-500'}`}>No grazie, procedi con un acquisto singolo per ora</h4>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${recurringType === 'none' ? 'border-gray-500 bg-gray-500 text-white' : 'border-gray-200 bg-white'}`}>
                                            <input type="radio" name="recurring" value="none" checked={recurringType === 'none'} onChange={() => setRecurringType('none')} className="hidden" />
                                            {recurringType === 'none' && <div className="h-2 w-2 rounded-full bg-white" />}
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: PAGAMENTO */}
                    {step === 3 && (
                        <div className="space-y-8 animate-in fade-in duration-300">
                            <div className="text-center space-y-2 mb-8">
                                <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900">Riepilogo e Pagamento</h2>
                                <div className="flex items-center justify-center gap-4">
                                    <p className="text-gray-500 flex items-center justify-center gap-1.5"><ShieldCheck size={16} className="text-green-500" /> Sicurezza certificata</p>
                                    <span className="text-gray-300">|</span>
                                    <img src="/logo-made-in-italy-v2.webp" alt="Sigillo Made in Italy" className="w-[26px] h-[26px] object-contain opacity-90" title="Made in Italy" />
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    {/* Dati Consegna */}
                                    <div className="bg-gray-50/70 rounded-2xl border border-gray-100 p-5">
                                        <h3 className="font-display font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3">Dati della Consegna</h3>
                                        <div className="grid grid-cols-[100px_1fr] gap-y-2 text-[13px]">
                                            <div className="text-gray-500 font-medium">Defunto:</div>
                                            <div className="text-gray-900 font-semibold">{deceasedName}</div>
                                            
                                            {gravePosition && (
                                                <>
                                                    <div className="text-gray-500 font-medium">Posizione:</div>
                                                    <div className="text-gray-900 font-medium truncate" title={gravePosition}>{gravePosition}</div>
                                                </>
                                            )}

                                            <div className="text-gray-500 font-medium">Luogo:</div>
                                            <div className="text-gray-900 font-semibold">{cemeteryName} ({deliveryProvince})</div>
                                            
                                            <div className="text-gray-500 font-medium">Data:</div>
                                            <div className="text-gray-900 font-semibold">
                                                {deliveryDate ? new Date(deliveryDate).toLocaleString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Contatti */}
                                    <div className="bg-gray-50/70 rounded-2xl border border-gray-100 p-5">
                                        <h3 className="font-display font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3">I tuoi Contatti</h3>
                                        <div className="grid grid-cols-[100px_1fr] gap-y-2 text-[13px]">
                                            <div className="text-gray-500 font-medium">Nome:</div>
                                            <div className="text-gray-900 font-semibold">{buyerName} {buyerSurname}</div>
                                            
                                            <div className="text-gray-500 font-medium">Email:</div>
                                            <div className="text-gray-900 font-semibold truncate" title={buyerEmail}>{buyerEmail}</div>
                                            
                                            <div className="text-gray-500 font-medium">Telefono:</div>
                                            <div className="text-gray-900 font-semibold">{buyerPhone}</div>
                                        </div>
                                    </div>

                                    {/* Il pagamento viene gestito in modo sicuro sulla pagina ospitata di Stripe */}
                                </div>

                                <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-6 h-fit sticky top-6">
                                    <h3 className="font-bold text-lg text-gray-900 border-b border-gray-100 pb-3 mb-4">Riepilogo Scelte</h3>
                                    
                                    {(() => {
                                        const messageItem = cart.find(i => i.slug === 'messaggio' || i.slug === 'nastro-commemorativo' || i.productId === 'c3' || i.productId === 'f4' || i.productId === '6');
                                        const hasMessage = !!messageItem;
                                        const filteredCart = cart.filter(i => !(i.slug === 'messaggio' || i.slug === 'nastro-commemorativo' || i.productId === 'c3' || i.productId === 'f4' || i.productId === '6'));
                                        const messageId = orderCategory === 'FF' ? 'f4' : 'c3';
                                        const messageName = orderCategory === 'FF' ? 'Nastro personalizzato' : "Messaggio d'affetto";
                                        const messagePrice = orderCategory === 'FF' ? 1499 : 249;

                                        return (
                                            <>
                                                <div className="space-y-4 mb-6">
                                                    {filteredCart.map((item, idx) => (
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

                                                {/* Modulo Messaggio/Nastro interattivo */}
                                                <div className={`p-4 rounded-xl border transition-all mb-6 ${hasMessage ? 'bg-amber-50/50 border-fm-gold shadow-sm' : 'bg-white border-gray-200'}`}>
                                                    <label className="flex items-center justify-between cursor-pointer">
                                                        <div className="flex items-center gap-3">
                                                            <input 
                                                                type="checkbox" 
                                                                className="w-4 h-4 text-fm-gold border-gray-300 rounded focus:ring-fm-gold/50 cursor-pointer"
                                                                checked={hasMessage}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        toggleAccessory(messageId, messageName, messagePrice);
                                                                    } else {
                                                                        if (messageItem) removeItem(messageItem.productId);
                                                                    }
                                                                }}
                                                            />
                                                            <span className="font-semibold text-gray-900 text-sm">{messageName}</span>
                                                        </div>
                                                        <span className="font-bold text-fm-gold text-sm">+€{(messagePrice / 100).toFixed(2)}</span>
                                                    </label>
                                                    
                                                    {hasMessage && (
                                                        <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                                                            <textarea
                                                                value={ticketMessage}
                                                                onChange={e => setTicketMessage(e.target.value)}
                                                                placeholder="Scrivi qui il tuo pensiero..."
                                                                className="w-full h-20 bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fm-gold/50 resize-none transition-all"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        );
                                    })()}
                                    
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
                                    <div className="space-y-3 mb-6">
                                        <label className="flex items-start gap-2 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-fm-cta focus:ring-fm-cta/40"
                                                checked={newsletterOptIn}
                                                onChange={(e) => setNewsletterOptIn(e.target.checked)}
                                            />
                                            <span>Voglio iscrivermi alla newsletter di FloreMoria</span>
                                        </label>
                                        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                                            <p className="text-sm font-semibold text-gray-900">Hai un codice sconto?</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Scrivi qui"
                                                    value={discountCodeInput}
                                                    onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={applyDiscountCode}
                                                    className="px-4 py-2 rounded-lg bg-fm-cta text-white text-sm font-semibold hover:bg-fm-cta/90"
                                                >
                                                    Applica
                                                </button>
                                            </div>
                                            {discountError && <p className="text-xs text-red-500">{discountError}</p>}
                                            {appliedDiscount && <p className="text-xs text-green-600">Codice applicato: {appliedDiscount.offerName}</p>}
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-gray-200 space-y-3">
                                        {appliedDiscount && (
                                            <div className="flex justify-between items-center text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                                                <span>Sconto {appliedDiscount.code}</span>
                                                <span className="font-bold">-€{(appliedDiscount.discountCents / 100).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-end">
                                        <span className="text-lg font-bold text-gray-900">Totale</span>
                                        <span className="text-3xl font-display font-bold text-fm-rose">&euro;{(finalCheckoutTotalCents / 100).toFixed(2)}{recurringType === 'monthly' ? <span className="text-lg text-gray-500 font-medium ml-1">/ mese</span> : ''}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bottom Navigation Buttons */}
                    <div className={`mt-8 border-t border-gray-100 bg-white pt-6 ${step === 2 && hasMidCheckoutStep ? 'pt-8' : ''}`}>
                        {step === 3 && (
                            <div className="flex items-center justify-center gap-3 mb-4 bg-gray-50/80 p-2 rounded-xl">
                                <img src="/logo-made-in-italy-v2.webp" alt="Made in Italy" className="h-6 w-auto object-contain opacity-90" />
                                <p className="text-[11px] md:text-xs text-gray-600 font-medium max-w-xs text-left leading-tight">
                                    <strong className="text-gray-800">Pagamento sicuro gestito da Stripe.</strong> Riceverai le foto della consegna via WhatsApp.
                                </p>
                            </div>
                        )}
                        <div className={`flex items-center justify-between gap-3 ${step === 2 && hasMidCheckoutStep ? 'flex-col-reverse sm:flex-row' : ''}`}>
                            {step > 1 ? (
                                <button type="button" onClick={goCheckoutPrev} className="flex items-center gap-2 text-gray-500 font-bold px-4 py-2 hover:bg-gray-100 rounded-full transition-colors shrink-0">
                                    <ChevronLeft size={18} /> Indietro
                                </button>
                            ) : (
                                <button onClick={() => window.history.back()} className="flex items-center gap-2 text-gray-500 font-bold px-4 py-2 hover:bg-gray-100 rounded-full transition-colors shrink-0">
                                    <ChevronLeft size={18} /> Indietro
                                </button>
                            )}

                            {step < 3 ? (
                                <button
                                    type="button"
                                    onClick={goCheckoutNext}
                                    disabled={step === 1 && !isDeliveryValid()}
                                    className={`flex items-center justify-center gap-2 rounded-full bg-fm-cta font-bold text-white shadow-md transition-all hover:bg-fm-cta/90 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none ${
                                        step === 2 && hasMidCheckoutStep
                                            ? 'w-full px-10 py-3.5 text-base sm:w-auto sm:min-w-[min(100%,14rem)] sm:px-12 sm:py-4 sm:text-lg sm:shadow-lg'
                                            : step === 1 && orderCategory === 'FA'
                                              ? 'px-10 py-3.5 text-base sm:px-12 sm:py-4 sm:text-lg sm:shadow-lg'
                                              : 'px-8 py-3'
                                    }`}
                                >
                                    {step === 2 && hasMidCheckoutStep ? 'Prosegui' : step === 1 && orderCategory === 'FA' ? 'Vai al pagamento' : 'Avanti'}{' '}
                                    <ChevronRight size={18} />
                                </button>
                            ) : (
                                <button
                                    onClick={completeOrder}
                                    disabled={isProcessing || !buyerName || !buyerEmail}
                                    className="flex items-center gap-2 bg-black text-white font-bold px-8 py-3 rounded-full hover:bg-gray-800 transition-all shadow-md disabled:bg-gray-300 w-full md:w-auto justify-center"
                                >
                                    {isProcessing ? 'Elaborazione...' : `Paga Ora €${(finalCheckoutTotalCents / 100).toFixed(2)}`}
                                    {!isProcessing && <Check size={18} />}
                                </button>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            <FloremCartCategoryModal
                open={cartCategoryModalOpen}
                onCancel={handleCartCategoryModalCancel}
                onClearAndAdd={handleCartCategoryModalClearAndAdd}
            />
        </div>
    );
}

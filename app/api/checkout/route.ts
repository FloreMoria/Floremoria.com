import { NextResponse } from 'next/server';
import { getCartCatalogCategoryState } from '@/lib/floremCartCategory';
import { products as catalogProducts } from '@/lib/products';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import Stripe from 'stripe';
import { normalizeOfferCode, resolveOfferDiscount } from '@/lib/discounts';

function categoryFromCatalog(cat?: 'cimitero' | 'funerale' | 'animali') {
    switch (cat) {
        case 'funerale':
            return { slug: 'funerale', name: 'Funerale' };
        case 'animali':
            return { slug: 'animali', name: 'Piccoli Amici' };
        default:
            return { slug: 'cimitero', name: 'Cimitero' };
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            cart,
            orderCategory, // 'FT', 'FF', 'FA', 'FP'
            recurringType, // 'none', 'monthly'
            /** POSTMAN: se true su FF, schedulare follow-up T+10g (email/WhatsApp) — vedi metadata Stripe e additionalInstructions. */
            ffTombCareReminder10d,
            buyerFullName,
            buyerEmail,
            buyerPhone,
            deceasedName,
            cemeteryName,
            gravePosition,
            deliveryProvince,
            deliveryDate,
            ticketMessage,
            referralRef,
            partnerNotifyEmail,
            discountCode,
            newsletterOptIn,
        } = body;

        // 0. Server-Side Logistics Validation
        const validateDeliveryTime = (category: string, requestedIso: string) => {
            const nowItalyStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Europe/Rome',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            }).format(new Date());

            const [datePart, timePart] = nowItalyStr.split(', ');
            const [month, day, year] = datePart.split('/');
            const [hour, min, sec] = timePart.split(':');
            const nowItaly = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec));

            const reqDate = new Date(requestedIso);
            // Tolleranza di 15 minuti per evitare discrepanze tra client e server
            const nowWithTolerance = new Date(nowItaly.getTime() - (15 * 60 * 1000));

            if (category === 'FF' || category === 'FA') {
                let minDateFF = new Date(nowWithTolerance);
                minDateFF.setHours(minDateFF.getHours() + 4);
                if (minDateFF.getHours() < 9) {
                    minDateFF.setHours(9, 0, 0, 0);
                } else if (minDateFF.getHours() >= 17) {
                    minDateFF.setDate(minDateFF.getDate() + 1);
                    minDateFF.setHours(9, 0, 0, 0);
                }
                return reqDate >= minDateFF;
            } else {
                let minDateFT = new Date(nowWithTolerance);
                minDateFT.setHours(minDateFT.getHours() + 48);
                if (minDateFT.getHours() < 9) {
                    minDateFT.setHours(9, 0, 0, 0);
                } else if (minDateFT.getHours() >= 17) {
                    minDateFT.setDate(minDateFT.getDate() + 1);
                    minDateFT.setHours(9, 0, 0, 0);
                }
                return reqDate >= minDateFT;
            }
        };

        if (!validateDeliveryTime(orderCategory || 'FT', deliveryDate)) {
            return NextResponse.json({ error: "L'orario richiesto non rispetta i tempi minimi di preparazione floreale." }, { status: 400 });
        }

        const cartLines = Array.isArray(cart) ? cart : [];
        const catState = getCartCatalogCategoryState(cartLines);
        if (catState.kind === 'mixed') {
            return NextResponse.json(
                { error: 'Il carrello contiene prodotti di sezioni catalogo diverse. Un ordine può includere una sola categoria.' },
                { status: 400 }
            );
        }
        const expectedCat =
            orderCategory === 'FT' ? 'cimitero' : orderCategory === 'FF' ? 'funerale' : orderCategory === 'FA' ? 'animali' : null;
        if (expectedCat && catState.kind === 'single' && catState.category !== expectedCat) {
            return NextResponse.json(
                { error: 'La categoria ordine non corrisponde agli articoli nel carrello.' },
                { status: 400 }
            );
        }

        const subtotalFromCartCents = (Array.isArray(cart) ? cart : []).reduce((acc: number, item: any) => {
            const qty = Number(item?.qty ?? 1);
            const price = Number(item?.priceCents ?? 0);
            return acc + Math.max(0, qty) * Math.max(0, price);
        }, 0);

        let appliedDiscountCode: string | null = null;
        let appliedOfferId: string | null = null;
        let discountCents = 0;
        let finalTotalCents = subtotalFromCartCents;
        if (typeof discountCode === 'string' && discountCode.trim()) {
            const normalizedCode = normalizeOfferCode(discountCode);
            const offer = await prisma.offer.findFirst({
                where: {
                    deletedAt: null,
                    code: normalizedCode,
                },
            });

            if (!offer) {
                return NextResponse.json({ error: 'Codice sconto non trovato.' }, { status: 400 });
            }

            const usageCount = await (prisma as any).offerRedemption.count({
                where: { offerId: offer.id },
            });

            const resolution = resolveOfferDiscount({
                offer,
                subtotalCents: subtotalFromCartCents,
                buyerEmail,
                buyerFullName,
                usageCount,
            });

            if (!resolution.ok) {
                return NextResponse.json({ error: resolution.reason ?? 'Codice sconto non valido.' }, { status: 400 });
            }

            appliedDiscountCode = normalizedCode;
            appliedOfferId = offer.id;
            discountCents = resolution.discountCents;
            finalTotalCents = resolution.finalTotalCents;
        }

        // 1. Intelligent ID Generation
        const prefix = orderCategory || 'FT';
        const prov = (deliveryProvince || 'XX').substring(0, 2).toUpperCase();
        const year = new Date().getFullYear().toString().slice(-2); // Ex: '26'

        const basePattern = `${prefix}-${prov}-${year}-`;

        // 2. Count existing orders for this specific prefix/prov/year
        const count = await prisma.order.count({
            where: {
                orderNumber: {
                    startsWith: basePattern
                }
            }
        });

        const progressive = (count + 1).toString().padStart(3, '0');
        const orderNumber = `${basePattern}${progressive}`; // Ex: FF-CO-26-001

        console.log(`[Checkout] Generato nuovo ID Immutabile: ${orderNumber}`);

        // 3. Find Partner for the specific province OR Referral
        let partner = null;
        let finalInstructions = null;

        if (referralRef) {
            partner = await prisma.partner.findFirst({
                where: {
                    isActive: true,
                    deletedAt: null,
                    OR: [{ id: String(referralRef) }, { uniqueCode: String(referralRef) }],
                },
            });
            if (partner) {
                finalInstructions = `Referral: ${partner.shopName} (codice: ${referralRef})`;
            }
        }

        if (!partner) {
            // We prioritize active florists in that province with the best rating
            partner = await prisma.partner.findFirst({
                where: {
                    isActive: true,
                    province: prov
                },
                orderBy: { adminRating: 'desc' }
            });
        }

        // 4. Create the Order in the database
        let finalGravePosition = gravePosition;
        let requiresLocationSearch = false;
        if (gravePosition && gravePosition.toUpperCase().includes('NON LA CONOSCO')) {
            finalGravePosition = `${gravePosition} #RICERCA_POSIZIONE`;
            requiresLocationSearch = true;
        }

        /** Abbonamento mensile: solo ordini FT (tombe). FF e PA (FA) non sono mai ricorrenti da questo flusso. */
        const isRecurring = orderCategory === 'FT' && recurringType === 'monthly';

        let additionalInstructions = finalInstructions || null;
        if (appliedDiscountCode) {
            const tag = `CODICE_SCONTO:${appliedDiscountCode}(-${(discountCents / 100).toFixed(2)} EUR)`;
            additionalInstructions = additionalInstructions ? `${additionalInstructions} | ${tag}` : tag;
        }
        if (orderCategory === 'FF' && ffTombCareReminder10d === true) {
            const tag = 'PROMEMORIA_CURA_TOMBA_10G:SI';
            additionalInstructions = additionalInstructions ? `${additionalInstructions} | ${tag}` : tag;
        }

        const notify =
            typeof partnerNotifyEmail === 'string' && partnerNotifyEmail.trim()
                ? partnerNotifyEmail.trim().slice(0, 255)
                : null;

        // Normalizza i productId del carrello (ID frontend statici) verso gli ID reali nel DB Prisma.
        const resolvedItems: { productId: string; quantity: number; priceCents: number }[] = [];
        for (const rawItem of cart as any[]) {
            const incomingId = String(rawItem.productId || rawItem.id || '').trim();
            const qty = Number(rawItem.qty || 1);
            const priceCents = Number(rawItem.priceCents || 0);
            if (!incomingId) {
                return NextResponse.json({ error: 'Prodotto non valido nel carrello.' }, { status: 400 });
            }

            // 1) Se è già un ID DB valido, usalo direttamente.
            let dbProduct = await prisma.product.findUnique({ where: { id: incomingId } });

            // 2) Altrimenti prova a convertire dall'ID frontend → slug catalogo → prodotto DB.
            if (!dbProduct) {
                const catalogMatch = catalogProducts.find((p) => p.id === incomingId);
                if (catalogMatch?.slug) {
                    dbProduct = await prisma.product.findUnique({ where: { slug: catalogMatch.slug } });
                    if (!dbProduct) {
                        // Fallback robusto: se il prodotto non esiste nel DB, lo creiamo dal catalogo statico.
                        const cat = categoryFromCatalog(catalogMatch.category);
                        const dbCategory = await prisma.category.upsert({
                            where: { slug: cat.slug },
                            update: {},
                            create: {
                                slug: cat.slug,
                                name: cat.name,
                            },
                        });
                        dbProduct = await prisma.product.create({
                            data: {
                                slug: catalogMatch.slug,
                                name: catalogMatch.name,
                                basePriceCents: Math.round(catalogMatch.price * 100),
                                categoryId: dbCategory.id,
                                isBouquet: catalogMatch.isBouquet ?? true,
                                isActive: true,
                            },
                        });
                    }
                }
            }

            if (!dbProduct) {
                return NextResponse.json(
                    { error: `Prodotto non riconosciuto nel carrello (id: ${incomingId}).` },
                    { status: 400 }
                );
            }

            resolvedItems.push({
                productId: dbProduct.id,
                quantity: qty,
                priceCents,
            });
        }

        const order = await prisma.order.create({
            data: {
                orderNumber,
                buyerFullName,
                buyerEmail,
                isRecurring,
                customerPhone: buyerPhone,
                deceasedName,
                cemeteryName,
                gravePosition: finalGravePosition,
                cemeteryCity: 'Non specificato', // Deprecated in favor of generic cemetery/location field but required by schema
                deliveryProvince: prov,
                deliveryDate: new Date(deliveryDate),
                ticketMessage,
                additionalInstructions,
                totalPriceCents: finalTotalCents,
                partnerId: partner?.id || null, // Auto-assignment
                ...(notify ? { partnerNotifyEmail: notify } : {}),
                status: 'PENDING',
                items: {
                    create: resolvedItems
                }
            }
        });

        if (newsletterOptIn === true && buyerEmail) {
            await prisma.newsletterLog.upsert({
                where: { email: buyerEmail.trim().toLowerCase() },
                update: { source: 'checkout' },
                create: { email: buyerEmail.trim().toLowerCase(), source: 'checkout' },
            });
        }

        if (appliedOfferId) {
            await (prisma as any).offerRedemption.create({
                data: {
                    offerId: appliedOfferId,
                    orderId: order.id,
                    buyerEmail: buyerEmail ? buyerEmail.trim().toLowerCase() : null,
                    buyerFullName: buyerFullName ? buyerFullName.trim() : null,
                },
            });
        }

        // 5. Margin Calculation Engine (For GA4 Purchase Sync)
        let totalMarginCents = 0;
        try {
            const csvPath = path.join(process.cwd(), 'Tabella prezzi e margini FloreMoria.csv');
            if (fs.existsSync(csvPath)) {
                const fileContent = fs.readFileSync(csvPath, 'utf-8');
                const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
                const costiFioristaMap = new Map();
                parsed.data.forEach((row: any) => {
                    if (row.Prodotto && row['Compenso Fiorista']) {
                        costiFioristaMap.set(row.Prodotto.toLowerCase(), parseFloat(row['Compenso Fiorista']));
                    }
                });

                cart.forEach((item: any) => {
                    const itemName = item.name.toLowerCase();
                    const isAccessory =
                        item.productId === 'florem-foto-stato-prima' ||
                        ['lumino', 'nastro', 'messaggio', 'biglietto', 'ceri', 'foto stato'].some((kw) =>
                            itemName.includes(kw)
                        );

                    const baseTotal = item.priceCents * item.qty;
                    let itemMargin = 0;

                    if (isAccessory) {
                        itemMargin = baseTotal; // Solo RL - Niente costo fiorista
                    } else {
                        let costFioristaCents = 0;
                        let foundCost = false;
                        for (let [key, val] of costiFioristaMap.entries()) {
                            if (itemName.includes(key)) {
                                costFioristaCents = (val * 100) * item.qty;
                                foundCost = true;
                                break;
                            }
                        }
                        if (!foundCost) {
                            costFioristaCents = Math.round(baseTotal * 0.65); // Fallback
                        }
                        itemMargin = baseTotal - costFioristaCents;
                    }

                    // Scaliamo 10% fee se Annuncifunebri su FF e NON è un accessorio
                    if (!isAccessory && prefix === 'FF' && referralRef === 'f067beff-e351-4484-81b2-5b16bdf27801') {
                        // arrotondamento all'euro superiore (es. 6,99 -> 7)
                        const feeEuros = Math.ceil((baseTotal / 100) * 0.10);
                        const referralFeeCents = feeEuros * 100;
                        itemMargin -= referralFeeCents;
                    }

                    totalMarginCents += itemMargin;
                });
            } else {
                totalMarginCents = Math.round(finalTotalCents * 0.35); // Fallback brutale se manca CSV
            }
        } catch (e) {
            console.error("Margin calc error in API:", e);
            totalMarginCents = Math.round(finalTotalCents * 0.35);
        }

        console.log(`[Notification] Auto-assegnazione effettuata per ordine ${orderNumber} al Partner ${partner?.shopName || 'Nessuno'}. Margine: €${(totalMarginCents / 100).toFixed(2)}`);

        // Create Stripe Session
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_51MockKey', {
            apiVersion: '2023-10-16' as any,
        });

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const successUrl = `${baseUrl}/order-completed?orderId=${order.orderNumber}&margin=${totalMarginCents}&phone=${encodeURIComponent(buyerPhone)}&prov=${prov}`;

        const buyerEmailTrimmed = typeof buyerEmail === 'string' ? buyerEmail.trim() : '';
        const validCustomerEmail =
            buyerEmailTrimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmailTrimmed) ? buyerEmailTrimmed : undefined;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            ...(validCustomerEmail ? { customer_email: validCustomerEmail } : {}),
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: appliedDiscountCode ? `Ordine FloreMoria (sconto ${appliedDiscountCode})` : 'Ordine FloreMoria',
                        },
                        unit_amount: finalTotalCents,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            metadata: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                ricercaPosizione: requiresLocationSearch ? 'SI' : 'NO',
                ...(orderCategory === 'FF'
                    ? {
                          ffTombCareReminder10d: ffTombCareReminder10d === true ? 'true' : 'false',
                      }
                    : {}),
                ...(appliedDiscountCode
                    ? {
                          discountCode: appliedDiscountCode,
                          discountCents: String(discountCents),
                      }
                    : {}),
            },
            success_url: successUrl,
            cancel_url: `${baseUrl}/checkout`,
        });

        return NextResponse.json({ success: true, url: session.url }, { status: 201 });
    } catch (error) {
        console.error('Checkout execution error:', error);
        const err = error instanceof Error ? error : new Error(String(error));
        return NextResponse.json(
            { error: 'Errore interno durante il checkout', details: err.message, stack: err.stack },
            { status: 500 }
        );
    }
}

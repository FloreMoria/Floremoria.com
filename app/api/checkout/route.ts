import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import Stripe from 'stripe';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            cart,
            orderCategory, // 'FT', 'FF', 'FA', 'FP'
            recurringType, // 'none', 'monthly'
            buyerFullName,
            buyerEmail,
            buyerPhone,
            deceasedName,
            cemeteryName,
            gravePosition,
            deliveryProvince,
            deliveryDate,
            ticketMessage,
            totalPriceCents,
            referralRef
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

            if (category === 'FF' || category === 'FA') {
                let minDateFF = new Date(nowItaly);
                minDateFF.setHours(minDateFF.getHours() + 4);
                if (minDateFF.getHours() < 9) {
                    minDateFF.setHours(9, 0, 0, 0);
                } else if (minDateFF.getHours() >= 17) {
                    minDateFF.setDate(minDateFF.getDate() + 1);
                    minDateFF.setHours(9, 0, 0, 0);
                }
                return reqDate >= minDateFF;
            } else {
                let minDateFT = new Date(nowItaly);
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
            return NextResponse.json({ error: "L'orario richiesto non rispetta i tempi minimi di preparazione fiorale." }, { status: 400 });
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

        if (referralRef === 'f067beff-e351-4484-81b2-5b16bdf27801') {
            // Assign order to Annuncifunebri.it if provided
            partner = await prisma.partner.findUnique({ where: { id: referralRef } });
            finalInstructions = "Referral: Partner Annuncifunebri.it";
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

        const isRecurring = recurringType !== 'none';

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
                additionalInstructions: finalInstructions,
                totalPriceCents,
                partnerId: partner?.id || null, // Auto-assignment
                status: 'PENDING',
                items: {
                    create: cart.map((item: any) => ({
                        productId: item.productId,
                        quantity: item.qty,
                        priceCents: item.priceCents
                    }))
                }
            }
        });

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
                    const isAccessory = ['lumino', 'nastro', 'messaggio', 'biglietto', 'ceri'].some(kw => itemName.includes(kw));

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
                totalMarginCents = Math.round(totalPriceCents * 0.35); // Fallback brutale se manca CSV
            }
        } catch (e) {
            console.error("Margin calc error in API:", e);
            totalMarginCents = Math.round(totalPriceCents * 0.35);
        }

        console.log(`[Notification] Auto-assegnazione effettuata per ordine ${orderNumber} al Partner ${partner?.shopName || 'Nessuno'}. Margine: €${(totalMarginCents / 100).toFixed(2)}`);

        // Create Stripe Session
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_51MockKey', {
            apiVersion: '2023-10-16' as any,
        });

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const successUrl = `${baseUrl}/order-completed?orderId=${order.orderNumber}&margin=${totalMarginCents}&phone=${encodeURIComponent(buyerPhone)}&prov=${prov}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'paypal'],
            line_items: cart.map((item: any) => ({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: item.name,
                    },
                    unit_amount: item.priceCents,
                },
                quantity: item.qty,
            })),
            mode: 'payment',
            metadata: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                ricercaPosizione: requiresLocationSearch ? 'SI' : 'NO'
            },
            success_url: successUrl,
            cancel_url: `${baseUrl}/checkout`,
        });

        return NextResponse.json({ success: true, url: session.url }, { status: 201 });
    } catch (error) {
        console.error('Checkout execution error:', error);
        return NextResponse.json({ error: 'Errore interno durante il checkout' }, { status: 500 });
    }
}

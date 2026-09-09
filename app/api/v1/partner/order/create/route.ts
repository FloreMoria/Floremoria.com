import { NextResponse, after } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticatePartnerV1, touchPartnerCredentialLastUsed } from '@/lib/partnerV1Auth';
import { partnerV1CorsHeaders } from '@/lib/partnerV1Cors';
import { generatePartnerTunnelOrderNumber } from '@/lib/partnerV1OrderNumber';
import { autoAssignKnownTombOrder } from '@/lib/deceased/autoAssignKnownTombOrder';
import {
    findFuneralAgency,
    resolveFloristPartnerIdForAgency,
} from '@/lib/orders/resolveAgencyFlorist';
import { sendPartnerOrderNotifications } from '@/lib/orders/partnerOrderNotifications';
import {
    buildB2bOrderCreateData,
    logPartnerOrderIngestion,
    revalidatePartnerOrderDashboardCaches,
    resolveB2bOrderAssociations,
} from '@/lib/partners/partnerOrderService';
import {
    extractPartnerIdempotencyKeys,
    findExistingPartnerOrderByIdempotency,
    partnerDuplicateOrderResponseBody,
} from '@/lib/partners/partnerOrderIdempotency';
import { formatDeceasedName, type DeceasedNameInput } from '@/lib/utils/formatDeceasedName';
import { formatPersonName } from '@/lib/utils/formatPersonName';
import {
    buildPartnerTestFinanceNote,
    resolvePartnerApiPaymentKind,
} from '@/lib/partnerTestCredential';

export const runtime = 'nodejs';

function jsonHeaders(request: Request) {
    return {
        ...partnerV1CorsHeaders(request, 'POST, OPTIONS'),
        'Content-Type': 'application/json',
    } as const;
}

function unauthorized(request: Request) {
    return NextResponse.json(
        {
            error: 'Non autorizzato. Invia X-Partner-Key (public id fmp_…) e Authorization: Bearer con il segreto, oppure X-Partner-Key: publicId:secret.',
        },
        { status: 401, headers: jsonHeaders(request) }
    );
}

function partnerErrorResponse(request: Request, error: unknown) {
    const message =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Errore interno del server';

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error('[B2B Partner API] order/create Prisma error:', {
            code: error.code,
            meta: error.meta,
            message: error.message,
        });
    } else {
        console.error('[B2B Partner API] order/create unhandled error:', error);
    }

    return NextResponse.json({ error: message }, { status: 500, headers: jsonHeaders(request) });
}

export async function OPTIONS(request: Request) {
    return new NextResponse(null, { status: 204, headers: partnerV1CorsHeaders(request, 'POST, OPTIONS') });
}

type LineItem = { productId?: string; quantity?: number };

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

export async function POST(request: Request) {
    try {
        const auth = await authenticatePartnerV1(request);
        if (!auth) return unauthorized(request);

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'JSON non valido.' }, { status: 400, headers: jsonHeaders(request) });
        }

        const b = body as Record<string, unknown>;
        const partnerIdBody = typeof b.partnerId === 'string' ? b.partnerId.trim() : '';
        const isLegacyAnnunciFunebriAlias =
            partnerIdBody === 'f067beff-e351-4484-81b2-5b16bdf27801' &&
            auth.partnerId === 'cmpcosjdo00008oncx62bgs5e';
        if (partnerIdBody && partnerIdBody !== auth.partnerId && !isLegacyAnnunciFunebriAlias) {
            return NextResponse.json(
                { error: 'Il campo partnerId non coincide con il partner associato alla credenziale API.' },
                { status: 403, headers: jsonHeaders(request) }
            );
        }

        const partner = await prisma.partner.findFirst({
            where: { id: auth.partnerId, deletedAt: null, isActive: true },
            select: {
                id: true,
                shopName: true,
                isB2B: true,
                partnerType: true,
                partnershipChannel: true,
                uniqueCode: true,
            },
        });
        if (!partner) {
            return NextResponse.json(
                { error: 'Partner non trovato, disattivato o eliminato.' },
                { status: 403, headers: jsonHeaders(request) }
            );
        }
        if (!partner.isB2B) {
            return NextResponse.json(
                { error: 'La credenziale API è associata a un partner non B2B.' },
                { status: 403, headers: jsonHeaders(request) }
            );
        }

        const deceasedNameRaw = b.deceasedName;
        const deceasedName = formatDeceasedName(
            typeof deceasedNameRaw === 'string' ||
                (deceasedNameRaw !== null && typeof deceasedNameRaw === 'object')
                ? (deceasedNameRaw as DeceasedNameInput)
                : undefined
        );
        const cemeteryName = b.cemeteryName;
        const cemeteryCity = b.cemeteryCity;
        const deliveryProvince =
            typeof b.deliveryProvince === 'string' ? b.deliveryProvince.trim().toUpperCase().slice(0, 2) : '';
        const deliveryDateRaw = b.deliveryDate;
        const buyerFullName = typeof b.buyerFullName === 'string' ? formatPersonName(b.buyerFullName) : b.buyerFullName;
        const buyerEmail = typeof b.buyerEmail === 'string' ? b.buyerEmail.trim().toLowerCase() : '';
        const buyerPhone = typeof b.buyerPhone === 'string' ? b.buyerPhone.trim() : undefined;
        const gravePosition = typeof b.gravePosition === 'string' ? b.gravePosition.trim() : undefined;
        const ticketMessage = typeof b.ticketMessage === 'string' ? b.ticketMessage : undefined;
        const agencyNameBody = typeof b.agencyName === 'string' ? b.agencyName.trim().slice(0, 255) : undefined;
        const agencyIdBody =
            typeof b.agencyId === 'string'
                ? b.agencyId.trim()
                : typeof b.agency_id === 'string'
                  ? b.agency_id.trim()
                  : '';
        const agencyCodeBody =
            typeof b.agencyCode === 'string'
                ? b.agencyCode.trim().slice(0, 64)
                : typeof b.agency_code === 'string'
                  ? b.agency_code.trim().slice(0, 64)
                  : '';
        const partnerNotifyEmail =
            typeof b.partnerNotifyEmail === 'string' && b.partnerNotifyEmail.trim()
                ? b.partnerNotifyEmail.trim().toLowerCase().slice(0, 255)
                : undefined;
        const lineItems = Array.isArray(b.lineItems) ? (b.lineItems as LineItem[]) : [];
        const idempotencyKeys = extractPartnerIdempotencyKeys(request, b);
        const externalAnnouncementId = idempotencyKeys.externalOrderId || undefined;

        // Short-circuit: retry dopo timeout partner/Stripe → stesso ordine, niente secondo create.
        if (idempotencyKeys.paymentKey || idempotencyKeys.externalOrderId) {
            const existing = await findExistingPartnerOrderByIdempotency(prisma, idempotencyKeys);
            if (existing) {
                console.info('[B2B Partner API] order/create idempotent hit', {
                    tag: `partner:${auth.partnerId}`,
                    orderId: existing.id,
                    orderNumber: existing.orderNumber,
                    paymentKey: idempotencyKeys.paymentKey,
                    externalOrderId: idempotencyKeys.externalOrderId,
                });
                return NextResponse.json(partnerDuplicateOrderResponseBody(existing), {
                    status: 200,
                    headers: jsonHeaders(request),
                });
            }
        }

        const additionalInstructionsRaw =
            typeof b.additionalInstructions === 'string'
                ? b.additionalInstructions.trim()
                : typeof b.specialNotes === 'string'
                  ? b.specialNotes.trim()
                  : '';

        const stripeCheckoutSessionId =
            typeof b.stripeCheckoutSessionId === 'string' ? b.stripeCheckoutSessionId.trim() : undefined;
        const stripePaymentIntentId =
            typeof b.stripePaymentIntentId === 'string'
                ? b.stripePaymentIntentId.trim()
                : typeof b.paymentIntentId === 'string'
                  ? b.paymentIntentId.trim()
                  : undefined;
        const stripeConnectedAccountId =
            typeof b.stripeConnectedAccountId === 'string' ? b.stripeConnectedAccountId.trim() : undefined;
        const casperApplicationFeeAmount =
            typeof b.casperApplicationFeeAmount === 'number'
                ? b.casperApplicationFeeAmount
                : typeof b.casperApplicationFeeAmount === 'string'
                  ? parseFloat(b.casperApplicationFeeAmount)
                  : undefined;

        let finalInstructions = additionalInstructionsRaw;
        if (
            stripeCheckoutSessionId ||
            stripePaymentIntentId ||
            stripeConnectedAccountId ||
            casperApplicationFeeAmount !== undefined
        ) {
            const stripeMeta = {
                stripeCheckoutSessionId,
                stripePaymentIntentId,
                stripeConnectedAccountId,
                casperApplicationFeeAmount,
            };
            finalInstructions +=
                (finalInstructions ? '\n\n' : '') + `---B2B_STRIPE_METADATA---\n${JSON.stringify(stripeMeta)}`;
        }

        if (!isNonEmptyString(deceasedName) || !isNonEmptyString(cemeteryName) || !isNonEmptyString(cemeteryCity)) {
            return NextResponse.json(
                { error: 'Campi obbligatori: deceasedName, cemeteryName, cemeteryCity.' },
                { status: 400, headers: jsonHeaders(request) }
            );
        }
        if (!deliveryProvince || deliveryProvince.length !== 2) {
            return NextResponse.json(
                { error: 'deliveryProvince deve essere la sigla di 2 lettere (es. RM).' },
                { status: 400, headers: jsonHeaders(request) }
            );
        }
        if (!isNonEmptyString(deliveryDateRaw)) {
            return NextResponse.json(
                { error: 'deliveryDate obbligatoria (formato ISO date).' },
                { status: 400, headers: jsonHeaders(request) }
            );
        }
        const deliveryDate = new Date(String(deliveryDateRaw));
        if (Number.isNaN(deliveryDate.getTime())) {
            return NextResponse.json(
                { error: 'deliveryDate non valida.' },
                { status: 400, headers: jsonHeaders(request) }
            );
        }

        const funeralDateRaw = b.funeralDate;
        let funeralDate: Date | null = null;
        if (typeof funeralDateRaw === 'string' && funeralDateRaw.trim()) {
            const parsed = new Date(funeralDateRaw.trim());
            if (!Number.isNaN(parsed.getTime())) {
                funeralDate = parsed;
            } else {
                return NextResponse.json(
                    { error: 'funeralDate non valida (formato ISO string o YYYY-MM-DDTHH:MM:SS).' },
                    { status: 400, headers: jsonHeaders(request) }
                );
            }
        }
        if (!isNonEmptyString(buyerFullName) || !buyerEmail) {
            return NextResponse.json(
                { error: 'Campi obbligatori: buyerFullName, buyerEmail.' },
                { status: 400, headers: jsonHeaders(request) }
            );
        }
        if (!lineItems.length) {
            return NextResponse.json(
                { error: 'lineItems deve contenere almeno un elemento.' },
                { status: 400, headers: jsonHeaders(request) }
            );
        }

        const resolvedAgency =
            agencyIdBody || agencyCodeBody
                ? await findFuneralAgency({ agencyId: agencyIdBody || null, agencyCode: agencyCodeBody || null })
                : null;

        if ((agencyIdBody || agencyCodeBody) && !resolvedAgency) {
            return NextResponse.json(
                { error: 'Agenzia non trovata per agencyId/agencyCode forniti.' },
                { status: 400, headers: jsonHeaders(request) }
            );
        }

        // Fiorista: default agenzia → copertura geografica; senza agenzia resta il partner API (legacy).
        let floristPartnerId: string | null = auth.partnerId;
        if (resolvedAgency) {
            floristPartnerId = await resolveFloristPartnerIdForAgency({
                agency: resolvedAgency,
                cemeteryCity: cemeteryCity.trim(),
            });
        } else if (partner.partnerType === 'AGGREGATOR' || partner.partnerType === 'FUNERAL_AGENCY') {
            floristPartnerId = await resolveFloristPartnerIdForAgency({
                agency: null,
                cemeteryCity: cemeteryCity.trim(),
            });
        }

        const resolved: { productId: string; quantity: number; priceCents: number }[] = [];
        for (const item of lineItems) {
            const pid = typeof item.productId === 'string' ? item.productId.trim() : '';
            const qty = Math.max(1, Math.min(99, Number(item.quantity) || 1));
            if (!pid) {
                return NextResponse.json(
                    { error: 'Ogni lineItem deve avere productId.' },
                    { status: 400, headers: jsonHeaders(request) }
                );
            }
            const product = await prisma.product.findFirst({
                where: { id: pid, isActive: true, deletedAt: null },
            });
            if (!product) {
                return NextResponse.json(
                    { error: `Prodotto non trovato o non attivo: ${pid}` },
                    { status: 400, headers: jsonHeaders(request) }
                );
            }
            resolved.push({ productId: product.id, quantity: qty, priceCents: product.basePriceCents });
        }

        const subtotalCents = resolved.reduce((acc, r) => acc + r.priceCents * r.quantity, 0);
        const isTestOrder = auth.isTestCredential;
        const partnerAlreadyPaid =
            Boolean(stripeCheckoutSessionId || stripePaymentIntentId) || partner.isB2B || isTestOrder;
        const partnerPaymentKind = resolvePartnerApiPaymentKind(isTestOrder);

        // Sandbox API: niente fiorista reale né workflow operativo; admin verifica solo i dati ricevuti.
        const effectiveFloristPartnerId = isTestOrder ? null : floristPartnerId;

        const partnershipChannelBody =
            typeof b.partnershipChannel === 'string'
                ? b.partnershipChannel.trim()
                : typeof b.channel === 'string'
                  ? b.channel.trim()
                  : null;

        const association = resolveB2bOrderAssociations({
            authPartner: partner,
            resolvedAgency,
            totalPriceCents: subtotalCents,
            partnershipChannelOverride: partnershipChannelBody,
            agencyNameOverride: agencyNameBody,
        });

        let order;
        try {
            order = await prisma.$transaction(async (tx) => {
                // Race: secondo create concorrente con stessa chiave → P2002 fuori dalla tx.
                if (idempotencyKeys.paymentKey || idempotencyKeys.externalOrderId) {
                    const existingInTx = await findExistingPartnerOrderByIdempotency(tx, idempotencyKeys);
                    if (existingInTx) {
                        return { __duplicate: true as const, existing: existingInTx };
                    }
                }

                const orderNumber = await generatePartnerTunnelOrderNumber(tx, deliveryProvince);
                const b2bFields = buildB2bOrderCreateData(association, effectiveFloristPartnerId);
                const created = await tx.order.create({
                    data: {
                        orderNumber,
                        status: effectiveFloristPartnerId ? 'IN_PROGRESS' : 'ACCEPTED',
                        partnerPaymentStatus: partnerAlreadyPaid ? 'PAID' : 'UNPAID',
                        paymentMethodLabel: partnerPaymentKind,
                        isTest: isTestOrder,
                        financeNotes: isTestOrder ? buildPartnerTestFinanceNote(auth.publicId) : undefined,
                        deceasedName: deceasedName.trim(),
                        cemeteryName: cemeteryName.trim(),
                        cemeteryCity: cemeteryCity.trim(),
                        gravePosition: gravePosition || null,
                        deliveryProvince,
                        deliveryDate,
                        ticketMessage: ticketMessage ?? null,
                        additionalInstructions: finalInstructions || null,
                        buyerFullName: buyerFullName.trim(),
                        buyerEmail,
                        customerPhone: buyerPhone || null,
                        totalPriceCents: subtotalCents,
                        currency: 'EUR',
                        ...b2bFields,
                        funeralDate: funeralDate || null,
                        partnerNotifyEmail: partnerNotifyEmail || null,
                        externalAnnouncementId: externalAnnouncementId || null,
                        // Persistenza chiave idempotenza (PI / session / Idempotency-Key).
                        stripeTransactionId: idempotencyKeys.paymentKey || null,
                        items: {
                            create: resolved.map((r) => ({
                                productId: r.productId,
                                quantity: r.quantity,
                                priceCents: r.priceCents,
                            })),
                        },
                    },
                    include: {
                        items: {
                            include: {
                                product: true,
                            },
                        },
                        partner: true,
                        agency: true,
                    },
                });
                return { __duplicate: false as const, created };
            });
        } catch (createErr) {
            // Concorrenza: unique su stripeTransactionId → restituisci l'ordine già creato.
            if (
                createErr instanceof Prisma.PrismaClientKnownRequestError &&
                createErr.code === 'P2002' &&
                (idempotencyKeys.paymentKey || idempotencyKeys.externalOrderId)
            ) {
                const raced = await findExistingPartnerOrderByIdempotency(prisma, idempotencyKeys);
                if (raced) {
                    return NextResponse.json(partnerDuplicateOrderResponseBody(raced), {
                        status: 200,
                        headers: jsonHeaders(request),
                    });
                }
            }
            throw createErr;
        }

        if (order.__duplicate) {
            return NextResponse.json(partnerDuplicateOrderResponseBody(order.existing), {
                status: 200,
                headers: jsonHeaders(request),
            });
        }

        const createdOrder = order.created;

        // Post-create fuori dal path critico: risposta al partner in <1s (no await email/WhatsApp/auto-assign).
        after(async () => {
            try {
                await touchPartnerCredentialLastUsed(auth.credentialId);
            } catch (touchErr) {
                console.error('[B2B Partner API] touchPartnerCredentialLastUsed failed (non-blocking):', touchErr);
            }

            if (partnerAlreadyPaid && !effectiveFloristPartnerId) {
                await autoAssignKnownTombOrder(createdOrder.id).catch((autoErr) => {
                    console.error(
                        '[B2B Partner API] Auto-assegnazione tomba nota fallita (non bloccante):',
                        autoErr
                    );
                });
            }

            logPartnerOrderIngestion({
                source: 'api_v1_partner_order_create',
                orderId: createdOrder.id,
                orderNumber: createdOrder.orderNumber,
                authPartner: partner,
                association,
                floristPartnerId: effectiveFloristPartnerId,
                totalPriceCents: subtotalCents,
            });

            revalidatePartnerOrderDashboardCaches({
                referralPartnerId: association.referralPartnerId,
                agencyId: association.agencyId,
                floristPartnerId: effectiveFloristPartnerId,
            });

            try {
                const results = await sendPartnerOrderNotifications(createdOrder.id, {
                    sandboxOrder: isTestOrder,
                });
                console.info('[B2B Partner API] sendPartnerOrderNotifications', {
                    tag: `partner:${partner.id}`,
                    orderId: createdOrder.id,
                    orderNumber: createdOrder.orderNumber,
                    results: results.map((r) => ({
                        channel: r.channel,
                        ok: r.ok,
                        skipped: r.skipped,
                        error: r.error,
                    })),
                });
            } catch (notifyErr) {
                console.error('[B2B Partner API] sendPartnerOrderNotifications failed (non-blocking):', {
                    tag: `partner:${partner.id}`,
                    orderId: createdOrder.id,
                    error: notifyErr,
                });
            }
        });

        return NextResponse.json(
            {
                success: true,
                duplicate: false,
                orderId: createdOrder.id,
                code: createdOrder.orderNumber,
                data: {
                    orderId: createdOrder.id,
                    orderNumber: createdOrder.orderNumber,
                    totalPriceCents: createdOrder.totalPriceCents,
                    currency: createdOrder.currency,
                    agencyId: createdOrder.agencyId,
                    partnerId: createdOrder.partnerId,
                    referralPartnerId: createdOrder.referralPartnerId,
                    partnershipChannel: createdOrder.partnershipChannel,
                    partnerCommissionCents: createdOrder.partnerCommissionCents,
                    partnerCommissionSettlementStatus: createdOrder.partnerCommissionSettlementStatus,
                    isTest: createdOrder.isTest,
                    partnerPaymentStatus: createdOrder.partnerPaymentStatus,
                    paymentMethodLabel: createdOrder.paymentMethodLabel,
                },
            },
            { status: 201, headers: jsonHeaders(request) }
        );
    } catch (error) {
        return partnerErrorResponse(request, error);
    }
}

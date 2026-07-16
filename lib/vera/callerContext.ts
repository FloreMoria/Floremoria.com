import type { ChatSession } from '@/lib/chatStore';
import prisma from '@/lib/prisma';
import { sanitizeWhatsAppDisplayName } from '@/lib/vera/displayName';
import { lookupActiveOrderByPhone } from '@/lib/whatsapp/orderStatusInquiry';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import {
    buildOrderOptionalsList,
    hasPhotoBeforeOption,
    stripInternalNotes,
} from '@/lib/orders/orderOptionals';

export type VeraConversationMode = 'pre_acquisto' | 'ordine_attivo' | 'fiorista';

export interface VeraCallerContext {
    phoneE164: string | null;
    displayNameFromWhatsApp: string | null;
    firstName: string | null;
    userType: ChatSession['userType'];
    mode: VeraConversationMode;
    hasActiveOrder: boolean;
    orderNumber: string | null;
    orderStatus: string | null;
    deceasedName: string | null;
    deliveryLocation: string | null;
    proofStatus: string | null;
    buyerName?: string | null;
    partnerName?: string | null;
    productsList?: string[] | null;
    hasPhotoBefore?: boolean | null;
    deliveryDate?: string | null;
    /** Optional accessori (lumino, ceri, nastro/biglietto commemorativo). */
    optionals?: string[] | null;
    /** Testo del biglietto/nastro commemorativo scelto dal cliente. */
    ticketMessage?: string | null;
    /** Note o richieste specifiche dell'utente/fiorista (metadati B2B esclusi). */
    customerNotes?: string | null;
}

function resolveDisplayName(session: ChatSession): string | null {
    return sanitizeWhatsAppDisplayName(session.name);
}

function formatLocation(city: string | null | undefined, cemetery: string | null | undefined): string | null {
    const parts = [cemetery?.trim(), city?.trim()].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
}

export async function resolveVeraCallerContext(session: ChatSession): Promise<VeraCallerContext> {
    const phoneE164 = normalizePhoneE164(session.phone.replace(/^whatsapp:/i, ''));
    const displayName = resolveDisplayName(session);
    const firstName = displayName ? extractFirstName(displayName) : null;

    let order = null;
    let partnerName: string | null = null;

    if (session.userType === 'FLORIST' && phoneE164) {
        const phoneDigits = phoneE164.replace(/\D/g, '');
        const partner = await prisma.partner.findFirst({
            where: {
                deletedAt: null,
                OR: [
                    { whatsappNumber: phoneE164 },
                    { whatsappNumber: { contains: phoneDigits.slice(-9) } },
                ],
            },
            select: { id: true, shopName: true, ownerName: true },
        });

        if (partner) {
            partnerName = partner.ownerName || partner.shopName || null;
            // Trova l'ultimo ordine attivo per questo fiorista
            order = await prisma.order.findFirst({
                where: {
                    partnerId: partner.id,
                    deletedAt: null,
                    status: { in: ['ACCEPTED', 'IN_PROGRESS', 'PENDING', 'DELIVERING'] }
                },
                orderBy: { updatedAt: 'desc' },
                include: {
                    items: { include: { product: true } },
                    deliveryProof: true,
                }
            });
        }
    } else if (phoneE164) {
        const activeOrderBasic = await lookupActiveOrderByPhone(phoneE164);
        if (activeOrderBasic) {
            order = await prisma.order.findUnique({
                where: { id: activeOrderBasic.id },
                include: {
                    items: { include: { product: true } },
                    deliveryProof: true,
                }
            });
        }
    }

    const hasActiveOrder = Boolean(order);
    const proofStatus = order?.deliveryProof?.status ?? null;

    const productsList = order?.items.map(item => `${item.product.name} (x${item.quantity})`) ?? null;
    const hasPhotoBefore = order ? hasPhotoBeforeOption(order.items) : false;
    const optionals = order ? buildOrderOptionalsList(order.items) : [];
    const ticketMessage = order?.ticketMessage?.trim() || null;
    const customerNotes = stripInternalNotes(order?.additionalInstructions);
    const deliveryDate = order?.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('it-IT') : null;

    return {
        phoneE164,
        displayNameFromWhatsApp: displayName,
        firstName,
        userType: session.userType,
        mode: session.userType === 'FLORIST' ? 'fiorista' : (hasActiveOrder ? 'ordine_attivo' : 'pre_acquisto'),
        hasActiveOrder,
        orderNumber: order?.orderNumber ?? null,
        orderStatus: order?.status ?? null,
        deceasedName: order?.deceasedName ?? null,
        deliveryLocation: order ? formatLocation(order.cemeteryCity, order.cemeteryName) : null,
        proofStatus,
        buyerName: order?.buyerFullName ?? null,
        partnerName,
        productsList,
        hasPhotoBefore,
        deliveryDate,
        optionals,
        ticketMessage,
        customerNotes,
    };
}

export function buildCallerContextPromptBlock(ctx: VeraCallerContext): string {
    const whoIsTalking = ctx.userType === 'FLORIST'
        ? `Fiorista Partner (Nome: ${ctx.partnerName || ctx.displayNameFromWhatsApp || 'Non specificato'})`
        : `Cliente (Nome: ${ctx.buyerName || ctx.displayNameFromWhatsApp || 'Non specificato'})`;

    const lines = [
        '=== CONTESTO DETTAGLIATO E DINAMICO DELL\'ORDINE (DATABASE) ===',
        `Chi sta parlando: ${whoIsTalking}`,
        `Telefono: ${ctx.phoneE164 ?? 'Non disponibile'}`,
        `Ruolo interlocutore: ${ctx.userType}`,
        `Stato conversazione: ${ctx.mode === 'pre_acquisto' ? 'PRE-ACQUISTO (Nessun ordine attivo)' : ctx.mode === 'ordine_attivo' ? 'ORDINE ATTIVO' : 'FIORISTA PARTNER'}`,
    ];

    if (ctx.hasActiveOrder) {
        lines.push(
            `DETTAGLI ORDINE ATTIVO:`,
            `- Codice Ordine (ID): ${ctx.orderNumber ?? 'Nessuno'}`,
            `- Stato Attuale Ordine: ${ctx.orderStatus ?? 'Sconosciuto'}`,
            `- Prodotto acquistato: ${ctx.productsList?.join(', ') || 'Nessun prodotto'}`,
            `- Opzione "Foto prima della posa": ${ctx.hasPhotoBefore ? 'ATTIVA (Il fiorista deve inviare sia la foto prima che dopo la posa)' : 'DISATTIVA (Il fiorista deve inviare solo la foto dopo la posa)'}`,
            ctx.optionals && ctx.optionals.length
                ? `- Optional/accessori inclusi: ${ctx.optionals.join(', ')} (ricorda al fiorista di posizionarli e conferma al cliente che sono previsti)`
                : '',
            ctx.ticketMessage
                ? `- Testo biglietto/nastro commemorativo: "${ctx.ticketMessage}" (il fiorista DEVE riportarlo esattamente così; puoi rileggerlo al cliente se lo chiede)`
                : '',
            ctx.customerNotes
                ? `- Note/richieste specifiche: ${ctx.customerNotes} (tienile presenti e comunicale al fiorista se rilevanti)`
                : '',
            `- Defunto commemorato: ${ctx.deceasedName ?? 'Non in anagrafica'}`,
            `- Luogo di consegna (Cimitero/Città): ${ctx.deliveryLocation ?? 'Non specificato'}`,
            `- Data di consegna prevista: ${ctx.deliveryDate ?? 'Non specificata'}`,
            ctx.proofStatus ? `- Stato prove di consegna: ${ctx.proofStatus}` : ''
        );
    } else {
        lines.push(
            'Nessun ordine attivo rilevato per questo numero.'
        );
    }

    return lines.filter(Boolean).join('\n');
}

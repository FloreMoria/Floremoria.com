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
import {
    calculateFloristCompensation,
    formatFloristCompensationForTemplate,
} from '@/lib/pricing/calculateFloristCompensation';
import { sessionHasRecentOutboundPhotos } from '@/lib/vera/deliveryContextGate';
import { lookupLastOrderByPhone } from '@/lib/whatsapp/orderStatusInquiry';

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
    /** Posizione tomba / indicazioni consegna sull'ordine. */
    gravePosition?: string | null;
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
    /** Compenso spettante al fiorista per il servizio (solo interlocutore fiorista). */
    floristCompensation?: string | null;
    /** Indirizzo strutturato (cimitero/chiesa + città + tomba) per prompt e hard rules. */
    structuredDeliveryAddress?: string | null;
    /** True se in chat ci sono già foto outbound recenti. */
    photosAlreadySentInChat?: boolean;
    /** ID ordine collegato (per alert). */
    orderId?: string | null;
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
        const orderBasic = activeOrderBasic || (await lookupLastOrderByPhone(phoneE164));
        if (orderBasic) {
            order = await prisma.order.findUnique({
                where: { id: orderBasic.id },
                include: {
                    items: { include: { product: true } },
                    deliveryProof: true,
                },
            });
        }
    }

    const openStatuses = new Set(['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERING']);
    const hasActiveOrder = Boolean(order && openStatuses.has(order.status));
    const hasOrderContext = Boolean(order && order.status !== 'CANCELLED');
    const proofStatus = order?.deliveryProof?.status ?? null;

    const productsList = order?.items.map((item) => `${item.product.name} (x${item.quantity})`) ?? null;
    const hasPhotoBefore = order ? hasPhotoBeforeOption(order.items) : false;
    const optionals = order ? buildOrderOptionalsList(order.items) : [];
    const ticketMessage = order?.ticketMessage?.trim() || null;
    const customerNotes = stripInternalNotes(order?.additionalInstructions);
    const deliveryDate = order?.deliveryDate
        ? new Date(order.deliveryDate).toLocaleDateString('it-IT')
        : null;
    const floristCompensation =
        session.userType === 'FLORIST' && order
            ? formatFloristCompensationForTemplate(calculateFloristCompensation(order.items))
            : null;

    const location = order ? formatLocation(order.cemeteryCity, order.cemeteryName) : null;
    const grave = order?.gravePosition?.trim() || null;
    const structuredDeliveryAddress = [grave, location].filter(Boolean).join(' — ') || null;
    const photosAlreadySentInChat = sessionHasRecentOutboundPhotos(session);

    const mode: VeraConversationMode =
        session.userType === 'FLORIST'
            ? 'fiorista'
            : hasActiveOrder || proofStatus === 'COMPLETED' || order?.status === 'COMPLETED'
              ? 'ordine_attivo'
              : 'pre_acquisto';

    return {
        phoneE164,
        displayNameFromWhatsApp: displayName,
        firstName,
        userType: session.userType,
        mode,
        hasActiveOrder: hasActiveOrder || hasOrderContext,
        orderId: order?.id ?? null,
        orderNumber: order?.orderNumber ?? null,
        orderStatus: order?.status ?? null,
        deceasedName: order?.deceasedName ?? null,
        deliveryLocation: location,
        gravePosition: grave,
        structuredDeliveryAddress,
        proofStatus,
        photosAlreadySentInChat,
        buyerName: order?.buyerFullName ?? null,
        partnerName,
        productsList,
        hasPhotoBefore,
        deliveryDate,
        optionals,
        ticketMessage,
        customerNotes,
        floristCompensation,
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
            ctx.userType === 'FLORIST' && ctx.floristCompensation
                ? `- Compenso fiorista (listino sistema, NON certezza assoluta se contestato): ${ctx.floristCompensation} — se il fiorista chiede/contesta il compenso: NON confermare cifre, escalate allo Staff`
                : '',
            `- Opzione "Foto prima della posa": ${ctx.hasPhotoBefore ? 'ATTIVA (Il fiorista deve inviare sia la foto prima che dopo la posa)' : 'DISATTIVA (Il fiorista deve inviare solo la foto dopo la posa)'}`,
            ctx.optionals && ctx.optionals.length
                ? `- Optional/accessori inclusi: ${ctx.optionals.join(', ')} (ricorda al fiorista di posizionarli e conferma al cliente che sono previsti)`
                : '',
            ctx.ticketMessage
                ? `- Testo biglietto/nastro commemorativo (ESATTO): "${ctx.ticketMessage}"`
                : `- Testo biglietto/nastro: MANCANTE — se richiesto: presa in carico + escalation Staff, non inventare`,
            ctx.customerNotes
                ? `- Note/richieste specifiche: ${ctx.customerNotes} (tienile presenti e comunicale al fiorista se rilevanti)`
                : '',
            `- Defunto commemorato: ${ctx.deceasedName ?? 'Non in anagrafica'}`,
            `- Luogo di consegna (Cimitero/Città): ${ctx.deliveryLocation ?? 'Non specificato'}`,
            ctx.structuredDeliveryAddress
                ? `- Indirizzo/indicazioni strutturate: ${ctx.structuredDeliveryAddress}`
                : '',
            ctx.gravePosition
                ? `- Indicazioni tomba/consegna: ${ctx.gravePosition}`
                : `- Indicazioni tomba/consegna: MANCANTI (se richieste: una sola presa in carico + escalation prioritaria Staff, senza loop)`,
            `- Data di consegna prevista: ${ctx.deliveryDate ?? 'Non specificata'}`,
            ctx.proofStatus ? `- Stato prove di consegna: ${ctx.proofStatus}` : '',
            ctx.photosAlreadySentInChat
                ? `- Foto già inviate in questa chat: SÌ — VIETATO dire "in preparazione" / "non appena sarà posizionato"; conferma che le foto sono già state inviate`
                : `- Foto già inviate in questa chat: no o non rilevate`,
            'REGOLA DATI: rispondi solo con questi campi. Se un dato operativo manca, non inventarlo e non ripetere richieste di attesa: scala allo Staff con i pezzi già noti.',
            'REGOLA MODIFICA CLIENTE: se chiede cambio data/orario/varietà fiori, presa in carico + staff — nessuna conferma arbitraria di fattibilità.'
        );
    } else {
        lines.push(
            'Nessun ordine attivo rilevato per questo numero.'
        );
    }

    return lines.filter(Boolean).join('\n');
}

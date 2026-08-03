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
import { resolveFloristDeliveryDeadline } from '@/lib/orders/formatFloristDeliveryDeadline';
import { sessionHasRecentOutboundPhotos } from '@/lib/vera/deliveryContextGate';
import { lookupLastOrderByPhone } from '@/lib/whatsapp/orderStatusInquiry';
import type { ProfileUserType } from '@prisma/client';
import {
    profileUserTypePromptLabel,
    sanitizePlannedDeliveryDates,
    VERA_GUEST_UNPROFILED_RULES,
} from '@/lib/users/profileUserType';

export type VeraConversationMode = 'pre_acquisto' | 'ordine_attivo' | 'fiorista';

export interface VeraCallerContext {
    phoneE164: string | null;
    displayNameFromWhatsApp: string | null;
    firstName: string | null;
    userType: ChatSession['userType'];
    /** Profilazione commerciale User.userType (Nuovo / Abituale / Abbonato). Null = Guest non profilato. */
    profileUserType: ProfileUserType | null;
    /**
     * True se non fiorista e manca anagrafica User (o profilazione assente):
     * contatto WhatsApp non ancora profilato → regole Guest.
     */
    isGuestOrUnprofiled: boolean;
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
    /** Date future programmate (prenotazione senza impegno). */
    plannedDeliveryDates?: string[] | null;
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

    let order = null;
    let partnerName: string | null = null;
    let partnerNotes: string | null = null;

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
            select: { id: true, shopName: true, ownerName: true, internalNotes: true },
        });

        if (partner) {
            partnerName = partner.ownerName || partner.shopName || null;
            partnerNotes = partner.internalNotes || null;
            // Trova l'ultimo ordine attivo per questo fiorista
            order = await prisma.order.findFirst({
                where: {
                    partnerId: partner.id,
                    deletedAt: null,
                    status: { in: ['ACCEPTED', 'IN_PROGRESS', 'PENDING', 'DELIVERING'] },
                    NOT: {
                        status: 'PENDING',
                        partnerPaymentStatus: 'UNPAID',
                        isTest: false,
                    },
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
    const deliveryDeadline = order
        ? resolveFloristDeliveryDeadline({
              deliveryDate: order.deliveryDate,
              createdAt: order.createdAt,
          })
        : null;
    const deliveryDate = deliveryDeadline?.label ?? null;
    const floristCompensation =
        session.userType === 'FLORIST' && order
            ? formatFloristCompensationForTemplate(calculateFloristCompensation(order.items, partnerNotes))
            : null;

    const location = order ? formatLocation(order.cemeteryCity, order.cemeteryName) : null;
    const grave = order?.gravePosition?.trim() || null;
    const structuredDeliveryAddress = [grave, location].filter(Boolean).join(' — ') || null;
    // Foto già in chat: solo outbound con media (non basta un template testo).
    const photosAlreadySentInChat = sessionHasRecentOutboundPhotos(session);

    const rawNameForFirst = session.userType === 'FLORIST' 
        ? (partnerName || displayName) 
        : (order?.buyerFullName || displayName);
    const firstName = rawNameForFirst ? extractVeraFirstName(rawNameForFirst) : null;

    const mode: VeraConversationMode =
        session.userType === 'FLORIST'
            ? 'fiorista'
            : hasActiveOrder || proofStatus === 'COMPLETED' || order?.status === 'COMPLETED'
              ? 'ordine_attivo'
              : 'pre_acquisto';

    let profileUserType: ProfileUserType | null = null;
    let plannedDeliveryDates: string[] = [];

    if (session.userType !== 'FLORIST' && phoneE164) {
        const phoneDigits = phoneE164.replace(/\D/g, '');
        const linkedUser =
            (order?.userId
                ? await prisma.user.findUnique({
                      where: { id: order.userId },
                      select: { userType: true, plannedDeliveryDates: true },
                  })
                : null) ||
            (await prisma.user.findFirst({
                where: {
                    deletedAt: null,
                    OR: [
                        { phone: phoneE164 },
                        { phone: { contains: phoneDigits.slice(-9) } },
                    ],
                },
                select: { userType: true, plannedDeliveryDates: true },
            }));
        if (linkedUser) {
            profileUserType = linkedUser.userType;
            plannedDeliveryDates = sanitizePlannedDeliveryDates(linkedUser.plannedDeliveryDates);
        }
    }

    // Nessuna anagrafica User collegata al numero → Guest / non profilato.
    const isGuestOrUnprofiled = session.userType !== 'FLORIST' && profileUserType === null;

    return {
        phoneE164,
        displayNameFromWhatsApp: displayName,
        firstName,
        userType: session.userType,
        profileUserType,
        isGuestOrUnprofiled,
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
        plannedDeliveryDates,
        optionals,
        ticketMessage,
        customerNotes,
        floristCompensation,
    };
}

export function buildCallerContextPromptBlock(ctx: VeraCallerContext): string {
    const whoIsTalking = ctx.userType === 'FLORIST'
        ? `Fiorista Partner (Nome: ${ctx.partnerName || ctx.displayNameFromWhatsApp || 'Non specificato'})`
        : ctx.isGuestOrUnprofiled
          ? `Guest / Nuovo contatto (Nome WhatsApp: ${ctx.displayNameFromWhatsApp || 'Non specificato'} — non ancora profilato in anagrafica)`
          : `Utente (Nome: ${ctx.buyerName || ctx.displayNameFromWhatsApp || 'Non specificato'})`;

    const profileLine =
        ctx.userType === 'FLORIST'
            ? ''
            : ctx.isGuestOrUnprofiled
              ? [
                    `Profilazione Utente: ${profileUserTypePromptLabel(ctx.profileUserType)}`,
                    'STATO: CONTATTO NON PROFILATO — applica le regole Guest (accoglienza empatica, discrimina FT/FF/PA, guida delicata all\'ordine, presenta Giardino della Memoria senza impegno, mai pressione commerciale).',
                    VERA_GUEST_UNPROFILED_RULES,
                ].join('\n')
              : `Profilazione Utente: ${profileUserTypePromptLabel(ctx.profileUserType)} — adatta tono e continuità (Nuovo=guida delicata; Abituale=familiare; Abbonato=riconosci il percorso ricorrente, mai pressione commerciale)`;

    const lines = [
        '=== CONTESTO DETTAGLIATO E DINAMICO DELL\'ORDINE (DATABASE) ===',
        `Chi sta parlando: ${whoIsTalking}`,
        `Nome di battesimo da usare per il saluto (Usa questo per "Gentile [Nome]" o "Buongiorno [Nome]"): ${ctx.firstName || 'Non specificato'}`,
        `Telefono: ${ctx.phoneE164 ?? 'Non disponibile'}`,
        `Ruolo interlocutore: ${ctx.userType}`,
        profileLine,
        ctx.plannedDeliveryDates && ctx.plannedDeliveryDates.length
            ? `Date future programmate (prenotazione SENZA impegno): ${ctx.plannedDeliveryDates.join(', ')} — non inventare addebiti; sono solo preferenze commemorative`
            : '',
        `Stato conversazione: ${ctx.mode === 'pre_acquisto' ? 'PRE-ACQUISTO (Nessun ordine attivo)' : ctx.mode === 'ordine_attivo' ? 'ORDINE ATTIVO' : 'FIORISTA PARTNER'}`,
    ];

    if (ctx.hasActiveOrder) {
        lines.push(
            `DETTAGLI ORDINE ATTIVO:`,
            `- Codice Ordine (ID): ${ctx.orderNumber ?? 'Nessuno'}`,
            `- Stato Attuale Ordine: ${ctx.orderStatus ?? 'Sconosciuto'}`,
            `- Prodotto acquistato: ${ctx.productsList?.join(', ') || 'Nessun prodotto'}`,
            ctx.userType === 'FLORIST' && ctx.floristCompensation
                ? `- Compenso fiorista (tabella rigida FLOREM_NET, somma articoli — MAI %): ${ctx.floristCompensation} — se contestato: NON inventare, escalate allo Staff (Regola Aurea)`
                : '',
            `- Opzione "Foto prima della posa": ${ctx.hasPhotoBefore ? 'ATTIVA (Il fiorista deve inviare sia la foto prima che dopo la posa)' : 'DISATTIVA (Il fiorista deve inviare solo la foto dopo la posa)'}`,
            ctx.optionals && ctx.optionals.length
                ? `- Optional/accessori inclusi: ${ctx.optionals.join(', ')} (ricorda al fiorista di posizionarli e conferma all'utente che sono previsti)`
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
            `- 📅 CONSEGNA ENTRO: ${ctx.deliveryDate ?? 'Non specificata'}`,
            ctx.proofStatus ? `- Stato prove di consegna: ${ctx.proofStatus}` : '',
            ctx.photosAlreadySentInChat
                ? `- Foto già inviate in questa chat: SÌ — VIETATO dire "in preparazione" / "non appena sarà posizionato"; se l'utente contesta foto uguali/sbagliate → escalate Staff, non ripetere "già inviate"`
                : `- Foto già inviate in questa chat: no o non rilevate`,
            'REGOLA DATI: rispondi solo con questi campi. Se un dato operativo manca, non inventarlo e non ripetere richieste di attesa: scala allo Staff con i pezzi già noti.',
            'REGOLA MODIFICA UTENTE: se chiede cambio data/orario/varietà fiori, presa in carico + staff — nessuna conferma arbitraria di fattibilità. Pagamenti PayPal/Stripe non sono modifiche ordine.'
        );
    } else {
        lines.push(
            'Nessun ordine attivo rilevato per questo numero.',
            ctx.isGuestOrUnprofiled
                ? 'GUEST: non inventare ordini o defunti; chiedi con garbo se serve un omaggio su tomba (FT), per un funerale (FF) o una pianta (PA), poi guida verso i dati essenziali.'
                : ''
        );
    }

    return lines.filter(Boolean).join('\n');
}

export function extractVeraFirstName(fullName?: string | null): string {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return '';

    // Rimuoviamo Sig., Sig.ra, Signora, Signor, dr., dott., dott.ssa, gentile, ecc.
    const clean = trimmed
        .replace(/^(sig\.|sig\.ra|signora|signor|egregio|egregia|gentile|dott\.|dott\.ssa|dr\.|dr\.ssa)\s+/i, '')
        .trim();

    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';

    const firstName = parts[0]!;
    // Sanitizzazione del nome: prendiamo solo caratteri alfabetici
    const cleanFirstName = firstName.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’-]/g, '');
    const lower = cleanFirstName.toLowerCase();
    if (!cleanFirstName || lower === 'prova' || lower === 'test' || lower === 'sandbox' || lower === 'dev') {
        return '';
    }

    return cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1);
}

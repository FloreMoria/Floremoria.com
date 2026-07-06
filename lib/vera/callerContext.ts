import type { ChatSession } from '@/lib/chatStore';
import { sanitizeWhatsAppDisplayName } from '@/lib/vera/displayName';
import { lookupActiveOrderByPhone } from '@/lib/whatsapp/orderStatusInquiry';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';

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

    if (session.userType === 'FLORIST') {
        return {
            phoneE164,
            displayNameFromWhatsApp: displayName,
            firstName,
            userType: session.userType,
            mode: 'fiorista',
            hasActiveOrder: false,
            orderNumber: null,
            orderStatus: null,
            deceasedName: null,
            deliveryLocation: null,
            proofStatus: null,
        };
    }

    const order = phoneE164 ? await lookupActiveOrderByPhone(phoneE164) : null;
    const hasActiveOrder = Boolean(order);
    const proofStatus = order?.deliveryProof?.status ?? null;

    return {
        phoneE164,
        displayNameFromWhatsApp: displayName,
        firstName,
        userType: session.userType,
        mode: hasActiveOrder ? 'ordine_attivo' : 'pre_acquisto',
        hasActiveOrder,
        orderNumber: order?.orderNumber ?? null,
        orderStatus: order?.status ?? null,
        deceasedName: order?.deceasedName ?? null,
        deliveryLocation: order ? formatLocation(order.cemeteryCity, order.cemeteryName) : null,
        proofStatus,
    };
}

export function buildCallerContextPromptBlock(ctx: VeraCallerContext): string {
    const lines = [
        '=== CONTESTO UTENTE CORRENTE (UNICA FONTE DATI PERSONALI) ===',
        `Telefono chat: ${ctx.phoneE164 ?? 'non disponibile'}`,
        `Nome profilo WhatsApp: ${ctx.displayNameFromWhatsApp ?? 'non disponibile'}`,
        `Tipo contatto: ${ctx.userType}`,
        `Modalità conversazione: ${ctx.mode === 'pre_acquisto' ? 'PRE-ACQUISTO (nessun ordine DB per questo numero)' : ctx.mode === 'ordine_attivo' ? 'ORDINE ATTIVO' : 'FIORISTA PARTNER'}`,
    ];

    if (ctx.mode === 'pre_acquisto') {
        lines.push(
            'ORDINE DATABASE: nessuno ordine attivo associato a questo numero (ignora ordini completati o storici di test).',
            'METODO LUCIANO: Lei formale, tono paziente e disponibile; usa solo il nome profilo WhatsApp se valido.',
            'Chiedi una verifica alla volta (tomba o funerale, città, orario). VIETATO citare codici ordine, defunti o luoghi non forniti ora dall\'utente.',
        );
    } else if (ctx.mode === 'ordine_attivo' && ctx.hasActiveOrder) {
        lines.push(
            `ORDINE DATABASE (solo questo, se pertinente): ${ctx.orderNumber ?? 'senza codice'}`,
            `Stato ordine: ${ctx.orderStatus ?? 'sconosciuto'}`,
            ctx.deceasedName ? `Defunto (ordine DB): ${ctx.deceasedName}` : 'Defunto: non in anagrafica',
            ctx.deliveryLocation ? `Luogo consegna (ordine DB): ${ctx.deliveryLocation}` : '',
            ctx.proofStatus ? `Prova fotografica: ${ctx.proofStatus}` : '',
        );
    }

    return lines.filter(Boolean).join('\n');
}

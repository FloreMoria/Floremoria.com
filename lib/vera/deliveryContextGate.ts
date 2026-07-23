/**
 * Context gate consegna/foto (P0 Carolina/Maria).
 * Perché: Gemini non deve dire “in preparazione” se posa/foto risultano già fatte.
 */
import type { ChatSession } from '@/lib/chatStore';
import type { VeraCallerContext } from '@/lib/vera/callerContext';

const PHOTO_OR_DELIVERY_ASK =
    /foto|posa|consegnat|consegna|arriv|ricevut|mand|invi|dove sono|posso vedere|non ho ricevuto|non arriva|giardino|testimonianz/i;

const FORBIDDEN_PENDING_PHRASES =
    /non appena (sar[aà]|verr[aà]|saranno)|in preparazione|si sta occupando|ancora non|appena (sar[aà]|complet|posizion)|quando (sar[aà]|avr[aà]) (posizion|consegn)|preparando i fiori|partner.{0,40}al lavoro/i;

export function isAskingAboutPhotosOrDelivery(message: string): boolean {
    return PHOTO_OR_DELIVERY_ASK.test(message || '');
}

/** Prove / stato ordine già conclusi lato sistema. */
export function isOrderDeliveryCompleted(
    ctx: Pick<VeraCallerContext, 'orderStatus' | 'proofStatus' | 'photosAlreadySentInChat'>
): boolean {
    if (ctx.proofStatus === 'COMPLETED') return true;
    if (ctx.orderStatus === 'COMPLETED') return true;
    if (ctx.photosAlreadySentInChat) return true;
    return false;
}

/** True se in chat ci sono outbound con media recenti (foto staff/fiorista già mandate). */
export function sessionHasRecentOutboundPhotos(session: ChatSession, withinHours = 72): boolean {
    const cutoff = Date.now() - withinHours * 3600_000;
    return session.messages.some((m) => {
        if (m.direction !== 'OUTBOUND' || !m.mediaUrl) return false;
        if (!m.createdAt) return true;
        const t = new Date(m.createdAt).getTime();
        return Number.isFinite(t) ? t >= cutoff : true;
    });
}

export function buildDeliveryAlreadyDoneReply(params: {
    firstName?: string | null;
    deceasedName?: string | null;
    userType: ChatSession['userType'];
}): string {
    const dear = params.deceasedName?.trim() || 'il Suo caro';
    if (params.userType === 'FLORIST') {
        return (
            `Confermo: la posa risulta già registrata a sistema` +
            (params.deceasedName ? ` per ${params.deceasedName}` : '') +
            `. Se il cliente non vede le foto, lo staff può reinviare da Communications. Grazie.`
        );
    }
    const who = params.firstName ? `Gentile ${params.firstName}, ` : '';
    return (
        `${who}Le confermo che le foto della consegna` +
        (params.deceasedName ? ` nel ricordo di ${dear}` : '') +
        ` Le sono già state inviate in questa chat. ` +
        `Se non Le compaiono, mi dica pure: lo Staff può reinviare subito la testimonianza. Restiamo a Sua disposizione.`
    );
}

/** Post-check: se il modello ignora il gate, blocca formulazioni “ancora in preparazione”. */
export function replyViolatesDeliveryContextGate(reply: string): boolean {
    return FORBIDDEN_PENDING_PHRASES.test(reply || '');
}

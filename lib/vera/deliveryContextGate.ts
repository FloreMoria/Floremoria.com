/**
 * Context gate consegna/foto (P0 Carolina/Maria).
 * Perché: Gemini non deve dire “in preparazione” se posa/foto risultano già fatte.
 * Attenzione: pattern stretto — non matchare “informazioni” via sottostringa “invi”.
 */
import type { ChatSession } from '@/lib/chatStore';
import type { VeraCallerContext } from '@/lib/vera/callerContext';

/** Finestra in cui un ordine chiuso può ancora giustificare reply post-consegna. */
export const RECENT_CLOSED_ORDER_HOURS = 48;

const PHOTO_OR_DELIVERY_ASK =
    /\b(foto|posa|consegnat[oaie]?|consegna|arriv(at[oaie]?|a)|ricevut[oaie]?|mand(ami|atemi|are)?|invi(ami|atemi|are)?|dove sono|posso vedere|non ho ricevuto|non arriva|giardino|testimonianz)\b/i;

const FORBIDDEN_PENDING_PHRASES =
    /non appena (sar[aà]|verr[aà]|saranno)|in preparazione|si sta occupando|ancora non|appena (sar[aà]|complet|posizion)|quando (sar[aà]|avr[aà]) (posizion|consegn)|preparando i fiori|partner.{0,40}al lavoro/i;

/** Segnalazione che le foto sono sbagliate / duplicate / solo "prima della posa". */
const PHOTO_DISPUTE_PATTERN =
    /foto.{0,60}(ugual|sbagli|errat|non (sono|è|e) (la|corrett)|stess[oa]|prima della posa)|due foto.{0,20}ugual|errore.{0,40}foto|prima della posa|non (ho )?ricevut[oa].{0,30}foto|nella chat non ho ricevuto le foto/i;

const EXPLICIT_DELIVERY_STATUS_ASK =
    /\b(a che punto|avete consegnato|non vedo le foto|foto della (consegna|posa)|stato (del )?mio ordine|dove (sono|e|è) (le )?foto|avete inviato le foto|non (mi )?arrivano le foto)\b/i;

export function isAskingAboutPhotosOrDelivery(message: string): boolean {
    return PHOTO_OR_DELIVERY_ASK.test(message || '');
}

/** Richiesta esplicita di aggiornamento consegna/foto (non assistenza generica). */
export function isExplicitDeliveryOrPhotoStatusAsk(message: string): boolean {
    const raw = message || '';
    if (!raw.trim()) return false;
    if (EXPLICIT_DELIVERY_STATUS_ASK.test(raw)) return true;
    return isAskingAboutPhotosOrDelivery(raw);
}

/** True se l'utente contesta qualità/slot delle foto (non basta dire "già inviate"). */
export function isPhotoProofDispute(message: string): boolean {
    return PHOTO_DISPUTE_PATTERN.test(message || '');
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

/** Ordine chiuso ancora “fresco” (default 48h) — solo allora ha senso il copione post-consegna. */
export function isRecentClosedOrderContext(
    ctx: Pick<VeraCallerContext, 'orderUpdatedAtMs' | 'orderStatus' | 'proofStatus'>,
    withinHours = RECENT_CLOSED_ORDER_HOURS
): boolean {
    const ms = ctx.orderUpdatedAtMs;
    if (ms == null || !Number.isFinite(ms)) return false;
    const closed = ctx.orderStatus === 'COMPLETED' || ctx.proofStatus === 'COMPLETED';
    if (!closed) return false;
    return Date.now() - ms <= withinHours * 3600_000;
}

/**
 * Quando è lecito rispondere con stato consegna/foto già fatte.
 * Perché: evita di agganciarci a ordini completati da settimane su un nuovo contatto.
 */
export function shouldReplyWithHistoricalDeliveryStatus(
    message: string,
    ctx: Pick<
        VeraCallerContext,
        'orderStatus' | 'proofStatus' | 'photosAlreadySentInChat' | 'orderUpdatedAtMs' | 'hasActiveOrder'
    >
): boolean {
    if (!isOrderDeliveryCompleted(ctx)) return false;
    if (ctx.hasActiveOrder) return false;
    if (EXPLICIT_DELIVERY_STATUS_ASK.test(message || '')) return true;
    if (isAskingAboutPhotosOrDelivery(message) && isRecentClosedOrderContext(ctx)) return true;
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
            `. Se l'utente non vede le foto, lo staff può reinviare da Communications. Grazie.`
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

/** Contesta foto: presa in carico staff, niente "già inviate". */
export function buildPhotoProofDisputeReply(params: {
    firstName?: string | null;
    deceasedName?: string | null;
}): string {
    const who = params.firstName ? `Gentile ${params.firstName}, ` : '';
    const dear = params.deceasedName?.trim();
    return (
        `${who}La ringrazio per la segnalazione` +
        (dear ? ` sulle foto nel ricordo di ${dear}` : ' sulle foto') +
        `. Ho avvisato subito lo Staff: verifichiamo e Le reinviamo la testimonianza corretta della posa qui in chat. Restiamo a Sua disposizione.`
    );
}

/** Post-check: se il modello ignora il gate, blocca formulazioni “ancora in preparazione”. */
export function replyViolatesDeliveryContextGate(reply: string): boolean {
    return FORBIDDEN_PENDING_PHRASES.test(reply || '');
}

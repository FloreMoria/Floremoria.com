/**
 * VERA — sistema operativo (tool calling / intent dispatcher).
 *
 * Classifica i dati estratti dalla chat, aggiorna l'ordine, notifica il fiorista
 * SOLO per contenuti OPERATIVE_FLORIST e scala allo Staff su ALERT / CONFIDENTIAL.
 *
 * Assunzione: Order non ha un campo `internalNotes` dedicato → le note riservate
 * e il log cronologico vivono in `additionalInstructions` dietro delimitatori
 * che `stripInternalNotes` nasconde al fiorista.
 */

import prisma from '@/lib/prisma';
import {
    B2B_METADATA_DELIMITER,
    VERA_AUDIT_DELIMITER,
    VERA_INTERNAL_DELIMITER,
} from '@/lib/orders/orderOptionals';
import {
    setVeraOperationalAlert,
    type VeraAlertPriority,
    type VeraAlertType,
} from '@/lib/vera/operationalAlerts';
import { sendWhatsAppTextMessage, normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { sendStaffPushNotification } from '@/lib/push/staffPush';

/** Classi informative per routing fiorista / staff. */
export type VeraInfoClass =
    | 'OPERATIVE_FLORIST'
    | 'CONFIDENTIAL_INTERNAL'
    | 'ALERT_REQUIRED';

export type VeraUpdateSource = 'client' | 'florist';

export type VeraUpdateType =
    | 'cardText'
    | 'gravePosition'
    | 'deliveryPreference'
    | 'productDetail'
    | 'customerNotes'
    | 'internalNotes'
    | 'alert';

/** Dati strutturati estratti dalla conversazione (cardText = ticketMessage DB). */
export interface VeraExtractedOrderData {
    cardText?: string | null;
    gravePosition?: string | null;
    deliveryPreference?: string | null;
    productDetail?: string | null;
    /** Note operative condivisibili col fiorista (posizione/orario/prodotto). */
    notes?: string | null;
    /** Note riservate (fattura, pagamento, prezzi) — mai al fiorista. */
    internalNotes?: string | null;
    /** Motivo alert se classificato ALERT_REQUIRED. */
    alertReason?: string | null;
}

export interface VeraClassifiedFragment {
    class: VeraInfoClass;
    updateType: VeraUpdateType;
    content: string;
    field?: keyof VeraExtractedOrderData;
}

export interface VeraDispatchResult {
    classes: VeraInfoClass[];
    fragments: VeraClassifiedFragment[];
    extracted: VeraExtractedOrderData;
    orderUpdated: boolean;
    floristNotified: boolean;
    alertCreated: boolean;
    confirmationHints: string[];
    auditLines: string[];
}

const ECONOMIC_LEAK_PATTERN =
    /\b(prezz|scont|rimbors|fattur|ricevut|pagament|paypal|stripe|bonific|iban|margine|compenso|euro|€|\d+[.,]\d{2})\b/i;

const CONFIDENTIAL_PATTERN =
    /\b(fattur[ae]?|ricevut[ae]?|scont[oi]|rimbors\w*|prezz[oi]|pagament\w*|paypal|stripe|bonific\w*|iban|carta\s+di\s+credito|home\s*banking|transazion\w*|nota\s+privat)/i;

const ALERT_PATTERN =
    /\b(annull\w*|cancell\w*|reclamo|lament\w*|non\s+va\s+bene|sbagliat\w*|last[\s-]?minute|all'?ultimo\s+momento|urgenti?ss?im\w*|sospend\w*|rifiut\w*\s+l'?ordine)\b/i;

const CARD_TEXT_PATTERN =
    /(?:(?:testo\s+(?:del\s+)?(?:bigliett\w*|nastr\w*)|bigliett\w*|nastr\w*|messaggio\s+(?:sul\s+)?(?:bigliett\w*|nastr\w*)|dedica|scrivi(?:\s+sul\s+nastro)?)\s*[:\-–]?\s*[«"“']?)([\s\S]{3,280}?)(?:[»"”']?\s*$|[»"”'](?=\s|$))/i;

const GRAVE_PATTERN =
    /(?:(?:posizione|tomba|loculo|campo|settore|fila|indicazioni?\s+(?:tomba|cimitero))\s*[:\-–]?\s*)([^\n.]{4,160})|(?:\b(?:campo|settore|fila|loculo)\s+[^\n,]{1,40})/i;

const DELIVERY_PREF_PATTERN =
    /(?:(?:orario\s+(?:di\s+)?consegna|preferisc\w*\s+(?:consegn|orario)|preferenza\s+(?:di\s+)?consegna|consegna\s+(?:la\s+mattina|il\s+pomeriggio|entro|alle))\s*[:\-–]?\s*)([^\n.]{3,120})|(?:\b(?:consegna\s+)?(?:mattina|pomeriggio)\b(?:\s+se\s+possibile)?)/i;

const PRODUCT_DETAIL_PATTERN =
    /(?:(?:variet[aà]|colore(?:\s+dei?\s+fiori)?|composizione|preferisco\s+(?:anthurium|gigli|rose?|fiori)|(?:anthurium|gigli)\s+(?:bianch\w*|ross\w*)?)\s*[:\-–]\s*)([^\n.]{3,120})/i;

function italyNowIso(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).replace(' ', 'T');
}

function pushUnique(list: VeraInfoClass[], value: VeraInfoClass): void {
    if (!list.includes(value)) list.push(value);
}

function cleanExtract(value: string | undefined | null): string | null {
    if (!value) return null;
    const t = value
        .replace(/\s+/g, ' ')
        .replace(/^["«“'\s]+|["»”'\s.]+$/g, '')
        .trim();
    return t.length >= 2 ? t.slice(0, 500) : null;
}

/**
 * Classifica e estrae frammenti operativi / riservati / critici da un messaggio chat.
 * Perché: il routing fiorista deve essere deterministico e a prova di leak economico.
 */
export function classifyAndExtractVeraMessage(message: string): {
    classes: VeraInfoClass[];
    fragments: VeraClassifiedFragment[];
    extracted: VeraExtractedOrderData;
} {
    const text = (message || '').trim();
    const classes: VeraInfoClass[] = [];
    const fragments: VeraClassifiedFragment[] = [];
    const extracted: VeraExtractedOrderData = {};

    if (!text) {
        return { classes, fragments, extracted };
    }

    if (ALERT_PATTERN.test(text)) {
        pushUnique(classes, 'ALERT_REQUIRED');
        const reason = cleanExtract(text.slice(0, 280)) || 'Segnalazione critica in chat';
        extracted.alertReason = reason;
        fragments.push({
            class: 'ALERT_REQUIRED',
            updateType: 'alert',
            content: reason,
        });
    }

    if (CONFIDENTIAL_PATTERN.test(text)) {
        pushUnique(classes, 'CONFIDENTIAL_INTERNAL');
        const note = cleanExtract(text.slice(0, 400)) || text.slice(0, 200);
        extracted.internalNotes = note;
        fragments.push({
            class: 'CONFIDENTIAL_INTERNAL',
            updateType: 'internalNotes',
            content: note,
            field: 'internalNotes',
        });
    }

    const cardMatch = text.match(CARD_TEXT_PATTERN);
    const cardText = cleanExtract(cardMatch?.[1] || null);
    if (cardText && !ECONOMIC_LEAK_PATTERN.test(cardText)) {
        pushUnique(classes, 'OPERATIVE_FLORIST');
        extracted.cardText = cardText;
        fragments.push({
            class: 'OPERATIVE_FLORIST',
            updateType: 'cardText',
            content: cardText,
            field: 'cardText',
        });
    }

    const graveMatch = text.match(GRAVE_PATTERN);
    const gravePosition = cleanExtract(graveMatch?.[1] || graveMatch?.[0] || null);
    if (gravePosition && !CONFIDENTIAL_PATTERN.test(gravePosition)) {
        pushUnique(classes, 'OPERATIVE_FLORIST');
        extracted.gravePosition = gravePosition;
        fragments.push({
            class: 'OPERATIVE_FLORIST',
            updateType: 'gravePosition',
            content: gravePosition,
            field: 'gravePosition',
        });
    }

    const deliveryMatch = text.match(DELIVERY_PREF_PATTERN);
    const deliveryPreference = cleanExtract(deliveryMatch?.[1] || deliveryMatch?.[0] || null);
    if (deliveryPreference && !CONFIDENTIAL_PATTERN.test(deliveryPreference)) {
        pushUnique(classes, 'OPERATIVE_FLORIST');
        extracted.deliveryPreference = deliveryPreference;
        const noteLine = `Preferenza consegna: ${deliveryPreference}`;
        extracted.notes = extracted.notes
            ? `${extracted.notes}; ${noteLine}`
            : noteLine;
        fragments.push({
            class: 'OPERATIVE_FLORIST',
            updateType: 'deliveryPreference',
            content: deliveryPreference,
            field: 'notes',
        });
    }

    const productMatch = text.match(PRODUCT_DETAIL_PATTERN);
    const productDetail = cleanExtract(productMatch?.[1] || null);
    if (productDetail && !CONFIDENTIAL_PATTERN.test(productDetail) && !ECONOMIC_LEAK_PATTERN.test(productDetail)) {
        pushUnique(classes, 'OPERATIVE_FLORIST');
        extracted.productDetail = productDetail;
        const noteLine = `Dettaglio prodotto: ${productDetail}`;
        extracted.notes = extracted.notes
            ? `${extracted.notes}; ${noteLine}`
            : noteLine;
        fragments.push({
            class: 'OPERATIVE_FLORIST',
            updateType: 'productDetail',
            content: productDetail,
            field: 'notes',
        });
    }

    return { classes, fragments, extracted };
}

/** Splitta additionalInstructions in sezioni pubbliche / internal / audit / B2B. */
export function parseAdditionalInstructions(raw: string | null | undefined): {
    publicNotes: string;
    internalNotes: string;
    auditLog: string;
    b2bMetadata: string;
} {
    const full = (raw || '').trim();
    let working = full;
    let b2bMetadata = '';
    if (working.includes(B2B_METADATA_DELIMITER)) {
        const [before, ...rest] = working.split(B2B_METADATA_DELIMITER);
        working = before.trim();
        b2bMetadata = rest.join(B2B_METADATA_DELIMITER).trim();
    }

    let publicNotes = working;
    let internalNotes = '';
    let auditLog = '';

    if (publicNotes.includes(VERA_AUDIT_DELIMITER)) {
        const [before, ...rest] = publicNotes.split(VERA_AUDIT_DELIMITER);
        publicNotes = before.trim();
        auditLog = rest.join(VERA_AUDIT_DELIMITER).trim();
    }
    if (publicNotes.includes(VERA_INTERNAL_DELIMITER)) {
        const [before, ...rest] = publicNotes.split(VERA_INTERNAL_DELIMITER);
        publicNotes = before.trim();
        const internalBlock = rest.join(VERA_INTERNAL_DELIMITER).trim();
        // Se audit era dopo internal nello stesso blocco legacy, separa
        if (internalBlock.includes(VERA_AUDIT_DELIMITER)) {
            const [intBefore, ...auditRest] = internalBlock.split(VERA_AUDIT_DELIMITER);
            internalNotes = intBefore.trim();
            auditLog = [auditLog, auditRest.join(VERA_AUDIT_DELIMITER).trim()]
                .filter(Boolean)
                .join('\n');
        } else {
            internalNotes = internalBlock;
        }
    }

    return { publicNotes, internalNotes, auditLog, b2bMetadata };
}

function composeAdditionalInstructions(parts: {
    publicNotes: string;
    internalNotes: string;
    auditLog: string;
    b2bMetadata: string;
}): string {
    const chunks: string[] = [];
    if (parts.publicNotes.trim()) chunks.push(parts.publicNotes.trim());
    if (parts.internalNotes.trim()) {
        chunks.push(`${VERA_INTERNAL_DELIMITER}\n${parts.internalNotes.trim()}`);
    }
    if (parts.auditLog.trim()) {
        chunks.push(`${VERA_AUDIT_DELIMITER}\n${parts.auditLog.trim()}`);
    }
    let out = chunks.join('\n\n').trim();
    if (parts.b2bMetadata.trim()) {
        out = out
            ? `${out}\n\n${B2B_METADATA_DELIMITER}\n${parts.b2bMetadata.trim()}`
            : `${B2B_METADATA_DELIMITER}\n${parts.b2bMetadata.trim()}`;
    }
    return out;
}

function appendLine(existing: string, line: string): string {
    const L = line.trim();
    if (!L) return existing;
    if (!existing.trim()) return L;
    if (existing.includes(L)) return existing;
    return `${existing.trim()}\n${L}`;
}

/**
 * Aggiorna i campi ordine pertinenti e appende log "Aggiornato da Vera: …".
 */
export async function updateOrderFromConversation(
    orderId: string,
    extractedData: VeraExtractedOrderData,
    source: VeraUpdateSource
): Promise<{ updated: boolean; auditLines: string[]; fields: string[] }> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            ticketMessage: true,
            gravePosition: true,
            additionalInstructions: true,
        },
    });
    if (!order) {
        console.warn(`[vera-actions] Ordine non trovato: ${orderId}`);
        return { updated: false, auditLines: [], fields: [] };
    }

    const parsed = parseAdditionalInstructions(order.additionalInstructions);
    const auditLines: string[] = [];
    const fields: string[] = [];
    const data: {
        ticketMessage?: string;
        gravePosition?: string;
        additionalInstructions?: string;
    } = {};

    if (extractedData.cardText?.trim()) {
        data.ticketMessage = extractedData.cardText.trim().slice(0, 500);
        fields.push('ticketMessage');
        auditLines.push(
            `Aggiornato da Vera: testo biglietto/nastro (${source}) — "${data.ticketMessage.slice(0, 120)}"`
        );
    }

    if (extractedData.gravePosition?.trim()) {
        data.gravePosition = extractedData.gravePosition.trim().slice(0, 300);
        fields.push('gravePosition');
        auditLines.push(
            `Aggiornato da Vera: posizione tomba (${source}) — ${data.gravePosition.slice(0, 120)}`
        );
    }

    if (extractedData.notes?.trim()) {
        parsed.publicNotes = appendLine(parsed.publicNotes, extractedData.notes.trim());
        fields.push('notes');
        auditLines.push(
            `Aggiornato da Vera: note operative (${source}) — ${extractedData.notes.trim().slice(0, 160)}`
        );
    }

    if (extractedData.internalNotes?.trim()) {
        parsed.internalNotes = appendLine(
            parsed.internalNotes,
            `[${italyNowIso()}] ${extractedData.internalNotes.trim().slice(0, 400)}`
        );
        fields.push('internalNotes');
        auditLines.push(
            `Aggiornato da Vera: nota interna riservata (${source}) — non inoltrata al fiorista`
        );
    }

    if (extractedData.deliveryPreference?.trim() && !extractedData.notes?.includes(extractedData.deliveryPreference)) {
        const line = `Preferenza consegna: ${extractedData.deliveryPreference.trim()}`;
        parsed.publicNotes = appendLine(parsed.publicNotes, line);
        if (!fields.includes('notes')) fields.push('notes');
        auditLines.push(`Aggiornato da Vera: preferenza consegna (${source})`);
    }

    for (const line of auditLines) {
        parsed.auditLog = appendLine(parsed.auditLog, `[${italyNowIso()}] ${line}`);
    }

    if (auditLines.length || fields.length) {
        data.additionalInstructions = composeAdditionalInstructions(parsed);
    }

    if (!Object.keys(data).length) {
        return { updated: false, auditLines: [], fields: [] };
    }

    await prisma.order.update({
        where: { id: orderId },
        data,
    });

    console.info('[vera-actions] updateOrderFromConversation', {
        orderId,
        source,
        fields,
        auditLines,
    });

    return { updated: true, auditLines, fields };
}

/**
 * Notifica il fiorista SOLO se updateType è operativo.
 * Blocco categorico di prezzi, margini, pagamenti, fatture.
 */
export async function notifyFloristIfApplicable(
    orderId: string,
    updateType: VeraUpdateType,
    content: string
): Promise<{ sent: boolean; blocked: boolean; reason?: string }> {
    const operativeTypes: VeraUpdateType[] = [
        'cardText',
        'gravePosition',
        'deliveryPreference',
        'productDetail',
        'customerNotes',
    ];

    if (!operativeTypes.includes(updateType) || updateType === 'internalNotes' || updateType === 'alert') {
        return {
            sent: false,
            blocked: true,
            reason: `updateType ${updateType} non inoltrabile al fiorista`,
        };
    }

    if (ECONOMIC_LEAK_PATTERN.test(content) || CONFIDENTIAL_PATTERN.test(content)) {
        console.warn('[vera-actions] Blocco leak economico/confidenziale verso fiorista', {
            orderId,
            updateType,
        });
        return {
            sent: false,
            blocked: true,
            reason: 'contenuto economico o confidenziale bloccato',
        };
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
            orderNumber: true,
            deceasedName: true,
            partner: { select: { whatsappNumber: true, shopName: true, ownerName: true } },
        },
    });

    const phone = normalizePhoneE164(order?.partner?.whatsappNumber || '');
    if (!phone) {
        return { sent: false, blocked: false, reason: 'whatsapp fiorista assente' };
    }

    const orderCode = order?.orderNumber || orderId.slice(-6).toUpperCase();
    const labelByType: Record<string, string> = {
        cardText: 'Testo biglietto/nastro aggiornato',
        gravePosition: 'Indicazioni posizione tomba aggiornate',
        deliveryPreference: 'Preferenza orario/consegna aggiornata',
        productDetail: 'Dettaglio prodotto aggiornato',
        customerNotes: 'Note operative aggiornate',
    };

    const body =
        `Aggiornamento ordine ${orderCode}` +
        (order?.deceasedName ? ` (${order.deceasedName})` : '') +
        `\n${labelByType[updateType] || 'Aggiornamento operativo'}:\n` +
        `${content.trim().slice(0, 400)}\n\n` +
        `— Vera | Staff FloreMoria`;

    const send = await sendWhatsAppTextMessage(phone, body);
    console.info('[vera-actions] notifyFloristIfApplicable', {
        orderId,
        updateType,
        phone: phone.slice(-4),
        ok: send.ok,
    });

    return { sent: send.ok, blocked: false };
}

function mapAlertReasonToType(reason: string): VeraAlertType {
    const r = reason.toLowerCase();
    if (/annull|cancell/.test(r)) return 'cancellation_request';
    if (/reclam|lament/.test(r)) return 'complaint';
    if (/last[\s-]?minute|ultimo\s+momento|urgent/.test(r)) return 'last_minute_change';
    if (/fattur|ricevut|prezz|scont|rimbors|pagament/.test(r)) return 'confidential_request';
    return 'user_modification_request';
}

function mapPriority(reason: string, priority?: VeraAlertPriority): VeraAlertPriority {
    if (priority) return priority;
    if (/annull|cancell|reclam|urgent/.test(reason.toLowerCase())) return 'urgent';
    return 'high';
}

/**
 * Registra alert dashboard + push staff quando serve attenzione umana.
 */
export async function createAdminAlert(
    orderId: string,
    reason: string,
    priority: VeraAlertPriority = 'high'
): Promise<void> {
    const type = mapAlertReasonToType(reason);
    const resolvedPriority = mapPriority(reason, priority);

    await setVeraOperationalAlert({
        orderId,
        type,
        message: reason.slice(0, 500),
        priority: resolvedPriority,
        freezeOrder: type === 'cancellation_request' || type === 'last_minute_change',
    });

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true },
    });
    const label = order?.orderNumber || orderId.slice(-6).toUpperCase();

    await sendStaffPushNotification({
        title: `🚨 VERA — attenzione ordine ${label}`,
        body: reason.slice(0, 180),
        url: `/dashboard/orders?open=${encodeURIComponent(orderId)}`,
        tag: `vera-alert-${orderId}`,
    }).catch((err) => {
        console.warn('[vera-actions] Push staff fallita:', err);
    });

    console.warn('[vera-actions] createAdminAlert', {
        orderId,
        type,
        priority: resolvedPriority,
        reason: reason.slice(0, 160),
    });
}

/** Conferme conversazionali precise (SOFIA + ALMA) dopo registrazione. */
export function buildVeraRegistrationConfirmations(
    extracted: VeraExtractedOrderData,
    opts: {
        floristNotified: boolean;
        alertCreated: boolean;
        confidentialOnly?: boolean;
        firstName?: string | null;
    }
): string[] {
    const hints: string[] = [];
    const who = opts.firstName?.trim() ? opts.firstName.trim() : null;

    if (extracted.cardText) {
        hints.push(`Ho registrato con cura il testo del Suo biglietto.`);
    }
    if (extracted.gravePosition) {
        hints.push(`Ho registrato le indicazioni sulla posizione.`);
    }
    if (extracted.deliveryPreference || extracted.productDetail || extracted.notes) {
        hints.push(`Ho annotato le Sue preferenze per la consegna.`);
    }
    if (extracted.internalNotes || opts.confidentialOnly) {
        hints.push(
            `Ho preso in carico la Sua richiesta speciale e l'ho affidata direttamente al nostro Staff, che se ne prenderà cura con la massima attenzione.`
        );
    }
    if (opts.alertCreated) {
        hints.push(
            `La Sua segnalazione è prioritaria: il nostro Staff La ricontatterà qui non appena verificata.`
        );
    }

    if (hints.length && who) {
        hints[0] = hints[0].replace(/^Ho /, `${who}, ho `).replace(/^La Sua/, `${who}, la Sua`);
    }

    return hints;
}

/**
 * Dispatcher operativo completo: classifica → aggiorna DB → notify fiorista → alert staff.
 */
export async function processVeraConversationActions(input: {
    orderId: string;
    message: string;
    source: VeraUpdateSource;
    firstName?: string | null;
}): Promise<VeraDispatchResult> {
    const { classes, fragments, extracted } = classifyAndExtractVeraMessage(input.message);

    const empty: VeraDispatchResult = {
        classes,
        fragments,
        extracted,
        orderUpdated: false,
        floristNotified: false,
        alertCreated: false,
        confirmationHints: [],
        auditLines: [],
    };

    if (!classes.length && !Object.values(extracted).some(Boolean)) {
        return empty;
    }

    const update = await updateOrderFromConversation(input.orderId, extracted, input.source);

    let floristNotified = false;
    if (input.source !== 'florist') {
        for (const fragment of fragments) {
            if (fragment.class !== 'OPERATIVE_FLORIST') continue;
            const notify = await notifyFloristIfApplicable(
                input.orderId,
                fragment.updateType,
                fragment.content
            );
            if (notify.sent) floristNotified = true;
        }
    }

    let alertCreated = false;
    if (classes.includes('ALERT_REQUIRED')) {
        await createAdminAlert(
            input.orderId,
            extracted.alertReason || input.message.slice(0, 280),
            'urgent'
        );
        alertCreated = true;
    } else if (classes.includes('CONFIDENTIAL_INTERNAL') && !classes.includes('OPERATIVE_FLORIST')) {
        await createAdminAlert(
            input.orderId,
            `Richiesta riservata in chat: ${extracted.internalNotes?.slice(0, 240) || input.message.slice(0, 200)}`,
            'high'
        );
        alertCreated = true;
    }

    const confirmationHints = buildVeraRegistrationConfirmations(extracted, {
        floristNotified,
        alertCreated,
        confidentialOnly:
            classes.includes('CONFIDENTIAL_INTERNAL') && !classes.includes('OPERATIVE_FLORIST'),
        firstName: input.firstName,
    });

    return {
        classes,
        fragments,
        extracted,
        orderUpdated: update.updated,
        floristNotified,
        alertCreated,
        confirmationHints,
        auditLines: update.auditLines,
    };
}

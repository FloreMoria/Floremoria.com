/**
 * Magic Link & Proof of Delivery — notifica WhatsApp post-posa fiori via Futuria.
 *
 * Set-and-Forget: non propaga eccezioni al chiamante (webhook Futuria / upload proof).
 */
import { buildProofFotoAccessUrl } from '@/lib/auth/proofFotoAccess';
import { addMessage, updateSessionProfile } from '@/lib/chatStore';
import { getSiteBaseUrl, getFuturiaWhatsAppProofTemplateId } from './config';
import {
    FuturiaApiError,
    isFuturiaConfigured,
    isSameAsBusinessWhatsAppPhone,
    normalizeFuturiaPhone,
    sendFuturiaWhatsApp,
    sendFuturiaWhatsAppCtaUrl,
    upsertFuturiaContact,
} from './client';

export interface ProofOfDeliveryInput {
    orderId: string;
    orderNumber?: string | null;
    buyerFullName?: string | null;
    buyerEmail?: string | null;
    customerPhone?: string | null;
    deceasedName?: string | null;
    cemeteryCity?: string | null;
    cemeteryName?: string | null;
    deliveryProvince?: string | null;
    photoAfterUrl?: string | null;
}

export interface ProofOfDeliveryResult {
    ok: boolean;
    skipped?: string;
    messageId?: string;
    deliveryStatus?: string;
    deliveryError?: string;
    fotoUrl?: string;
}

/** Città/luogo per il messaggio WhatsApp (es. Reggio Calabria). */
export function resolvePartnerCity(order: Pick<
    ProofOfDeliveryInput,
    'cemeteryCity' | 'cemeteryName' | 'deliveryProvince'
>): string {
    const city = order.cemeteryCity?.trim();
    if (city && city.toLowerCase() !== 'non specificato') return city;
    const cemetery = order.cemeteryName?.trim();
    if (cemetery) return cemetery;
    return order.deliveryProvince?.trim() || 'Italia';
}

function toAbsoluteAssetUrl(url: string): string {
    if (url.startsWith('http')) return url;
    const base = getSiteBaseUrl();
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

/**
 * Testo ufficiale Proof of Delivery (SOFIA/ALMA).
 * Il link foto va inviato separatamente (pulsante CTA o riga "Clicca qui").
 */
export function renderProofOfDeliveryWhatsAppMessage(params: {
    partnerCity: string;
    deceasedName: string;
}): string {
    return `Il nostro partner di ${params.partnerCity} ha posato i suoi fiori per onorare il ricordo di ${params.deceasedName}.`;
}

/** Fallback testuale quando il pulsante CTA non è supportato dall'API. */
export function renderProofFotoLinkMessage(fotoUrl: string): string {
    return `Clicca qui\n${fotoUrl}`;
}

function toWhatsAppSessionPhone(e164Phone: string): string {
    return e164Phone.startsWith('whatsapp:') ? e164Phone : `whatsapp:${e164Phone}`;
}

async function logProofToDashboard(
    phoneE164: string,
    buyerName: string,
    message: string,
    order: ProofOfDeliveryInput
): Promise<void> {
    try {
        const address = toWhatsAppSessionPhone(phoneE164);
        await addMessage(address, 'OUTBOUND', message, undefined, {
            eventType: 'PROOF_OF_DELIVERY',
            orderId: order.orderId,
            ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
        });
        await updateSessionProfile(address, {
            userType: 'UTENTE',
            ...(buyerName ? { name: buyerName } : {}),
        });
    } catch (e) {
        console.warn('[proof-of-delivery] Registrazione dashboard non riuscita (non bloccante):', e);
    }
}

/**
 * Invia notifica WhatsApp: testo brand + foto fiorista + link corto FOTO → bacheca utente.
 */
export async function sendProofOfDeliveryNotification(
    order: ProofOfDeliveryInput
): Promise<ProofOfDeliveryResult> {
    if (!isFuturiaConfigured()) {
        console.warn('[proof-of-delivery] Futuria non configurato: invio saltato.');
        return { ok: false, skipped: 'futuria_not_configured' };
    }

    const phone = normalizeFuturiaPhone(order.customerPhone);
    if (!phone) {
        console.warn(
            `[proof-of-delivery] Telefono assente/non valido per ordine ${order.orderNumber || order.orderId}.`
        );
        return { ok: false, skipped: 'invalid_phone' };
    }

    if (isSameAsBusinessWhatsAppPhone(phone)) {
        console.warn(
            `[proof-of-delivery] Destinatario ${phone} coincide con la linea business WhatsApp.`
        );
        return { ok: false, skipped: 'recipient_is_business_line' };
    }

    const templateId = getFuturiaWhatsAppProofTemplateId();
    const partnerCity = resolvePartnerCity(order);
    const deceasedName = (order.deceasedName || 'chi ama').trim();
    const buyerName = (order.buyerFullName || 'Utente').trim();
    const fotoUrl = await buildProofFotoAccessUrl(order.orderId, order.orderNumber);

    const bodyMessage = renderProofOfDeliveryWhatsAppMessage({
        partnerCity,
        deceasedName,
    });
    const linkFallbackMessage = renderProofFotoLinkMessage(fotoUrl);

    const photoAttachment = order.photoAfterUrl
        ? toAbsoluteAssetUrl(order.photoAfterUrl)
        : undefined;

    try {
        const contactId = await upsertFuturiaContact(
            {
                phone,
                name: buyerName,
                ...(order.buyerEmail ? { email: order.buyerEmail } : {}),
                deceasedName,
                orderNumber: order.orderNumber,
                tags: ['floremoria-proof-of-delivery'],
            },
            { source: 'paid_order_followup', orderId: order.orderId }
        );

        // 1) Foto del fiorista (se presente)
        if (photoAttachment) {
            const photoSend = await sendFuturiaWhatsApp({
                contactId,
                message: `Testimonianza fotografica — ${deceasedName}`,
                attachments: [photoAttachment],
            });
            const photoFailed =
                photoSend.deliveryStatus?.toLowerCase() === 'failed' || photoSend.deliveryError;
            if (photoFailed) {
                console.warn(
                    `[proof-of-delivery] Allegato foto non consegnato (continuo con testo):`,
                    photoSend.deliveryError
                );
            }
        }

        // 2) Messaggio con pulsante FOTO (o fallback "Clicca qui" + link corto)
        let messageId: string | undefined;
        let deliveryStatus: string | undefined;
        let deliveryError: string | undefined;
        let usedCtaButton = false;

        if (!templateId) {
            try {
                const ctaSend = await sendFuturiaWhatsAppCtaUrl({
                    contactId,
                    body: bodyMessage,
                    buttonText: 'FOTO',
                    url: fotoUrl,
                });
                messageId = ctaSend.messageId;
                deliveryStatus = ctaSend.deliveryStatus;
                deliveryError = ctaSend.deliveryError;
                usedCtaButton = Boolean(messageId) && deliveryStatus?.toLowerCase() !== 'failed';
            } catch (e) {
                console.warn(
                    '[proof-of-delivery] Pulsante CTA non disponibile via API, fallback testuale:',
                    e instanceof Error ? e.message : e
                );
            }
        }

        if (!usedCtaButton) {
            if (!templateId) {
                const bodySend = await sendFuturiaWhatsApp({ contactId, message: bodyMessage });
                messageId = bodySend.messageId;
                deliveryStatus = bodySend.deliveryStatus;
                deliveryError = bodySend.deliveryError;
            }

            const linkSend = await sendFuturiaWhatsApp({
                contactId,
                ...(templateId
                    ? { templateId, message: `${bodyMessage}\n\n${linkFallbackMessage}` }
                    : { message: linkFallbackMessage }),
            });
            messageId = linkSend.messageId ?? messageId;
            deliveryStatus = linkSend.deliveryStatus ?? deliveryStatus;
            deliveryError = linkSend.deliveryError ?? deliveryError;
        }

        const logMessage = usedCtaButton
            ? `${bodyMessage}\n\n[Pulsante FOTO → ${fotoUrl}]`
            : `${bodyMessage}\n\n${linkFallbackMessage}`;

        const failed =
            deliveryStatus?.toLowerCase() === 'failed' ||
            Boolean(deliveryError?.trim());

        if (failed) {
            console.error(
                `[proof-of-delivery] Consegna fallita ordine ${order.orderNumber || order.orderId}:`,
                deliveryError || deliveryStatus
            );
            return {
                ok: false,
                skipped: templateId ? 'delivery_failed' : 'delivery_failed_needs_template',
                messageId,
                deliveryStatus,
                deliveryError,
                fotoUrl,
            };
        }

        await logProofToDashboard(phone, buyerName, logMessage, order);

        console.info(
            `[proof-of-delivery] Inviato ordine ${order.orderNumber || order.orderId}, messageId=${messageId || 'n/a'}, status=${deliveryStatus || 'unknown'}`
        );

        return {
            ok: true,
            messageId,
            deliveryStatus,
            fotoUrl,
        };
    } catch (e) {
        const msg =
            e instanceof FuturiaApiError
                ? `${e.message}${e.body ? ` — ${e.body.slice(0, 400)}` : ''}`
                : e instanceof Error
                  ? e.message
                  : String(e);
        console.error(
            `[proof-of-delivery] Invio fallito ordine ${order.orderNumber || order.orderId}:`,
            msg
        );
        return { ok: false, skipped: 'send_failed' };
    }
}

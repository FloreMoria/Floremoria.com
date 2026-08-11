/**
 * Servizio unico di invio messaggi WhatsApp per Vera e il sistema con fallback automatico
 * su WhatsApp Template quando la finestra di sessione 24h Meta è chiusa.
 */

import { addMessage, getSession, updateSessionProfile } from '@/lib/chatStore';
import {
    sendWhatsAppTextMessage,
    sendWhatsAppTemplateMessage,
    normalizePhoneE164,
    type WhatsAppSendResult,
} from '@/lib/whatsapp/metaCloudApiClient';
import {
    getProactiveWhatsAppTemplate,
    sanitizeMetaTemplateParam,
    extractFirstName,
    normalizeOrderCode,
} from '@/lib/whatsapp/approvedTemplates';
import { tryClaimIdenticalTextOutbound } from '@/lib/whatsapp/veraWebhookDedup';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';

export interface SendWhatsAppMessageOptions {
    recipientName?: string;
    orderCode?: string;
    /** HEADER Meta in fallback template (es. "Nuovo Ordine FloreMoria"). Default: orderCode. */
    headerTitle?: string;
    sessionPhone?: string;
    source?: string;
    userType?: 'UTENTE' | 'FLORIST' | 'UNKNOWN';
    /** Se true, non tenta il free-text: solo template (finestra 24h chiusa / primo contatto). */
    forceTemplate?: boolean;
    /** Se true, in caso di errore 24h non invia il template proattivo (Punto A preferisce cascata dedicata). */
    disableTemplateFallback?: boolean;
}

export interface SendWhatsAppMessageResult extends WhatsAppSendResult {
    fallbackExecuted?: boolean;
}

/**
 * Riconosce se un errore di invio Meta/Twilio è causato dalla finestra 24h chiusa.
 * Meta Cloud API Error 131047: "Message failed to send because more than 24 hours have passed..."
 * Twilio / Meta Subcode 470, 21610.
 */
export function is24HourWindowError(result: WhatsAppSendResult): boolean {
    if (result.ok) return false;
    const code = result.errorCode;
    const subcode = result.errorSubcode;
    const err = (result.error || '').toLowerCase();

    if (code === 131047 || code === 470 || code === 21610) return true;
    if (subcode === 131047 || subcode === 470 || subcode === 21610) return true;

    if (
        err.includes('131047') ||
        err.includes('21610') ||
        err.includes('470') ||
        err.includes('24 hour') ||
        err.includes('24-hour') ||
        err.includes('outside the allowed window') ||
        err.includes('session expired') ||
        err.includes('window closed') ||
        err.includes('more than 24 hours have passed')
    ) {
        return true;
    }

    return false;
}

/**
 * Tenta di estrarre un codice ordine (es. FT-CO-26-005 o FF-PN-26-004) dal testo del messaggio.
 */
export function extractOrderCodeFromText(text: string): string | null {
    const match = text.match(/\b([A-Z]{2}-[A-Z]{2}-\d{2}-\d{3,4})\b/i);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Invia un messaggio WhatsApp (session message). Se la finestra 24h Meta è chiusa:
 * 1. Intercetta l'errore in modo trasparente senza interrompere l'esecuzione.
 * 2. Attiva automaticamente il fallback utilizzando il template approvato ('floremoria_messaggio_personalizzato_fiorista').
 * 3. Mappa i parametri (nome destinatario, riferimento ordine, testo/link aggiornamento).
 * 4. Registra nei log di sistema 'WhatsApp 24h Window Closed: Fallback to Template Executed'.
 * 5. Se l'invio ha esito positivo, segna il messaggio come inviato e aggiorna la cronologia chat della Dashboard.
 */
export async function sendWhatsAppMessage(
    phone: string,
    messageText: string,
    options?: SendWhatsAppMessageOptions
): Promise<SendWhatsAppMessageResult> {
    const text = messageText.trim();
    if (!text) {
        return { ok: false, error: 'Messaggio vuoto.' };
    }

    // Dedup SOLO testo identico entro pochi secondi (mai per media/image API).
    const phoneE164 = normalizePhoneE164(phone);
    if (phoneE164) {
        const textOk = await tryClaimIdenticalTextOutbound({ phoneE164, text });
        if (!textOk) {
            return {
                ok: false,
                error: 'duplicate_text_prevented: stesso testo già inviato pochi secondi fa.',
                errorCode: 409,
            };
        }
    }

    // Hard guard: Punto A / nuovo ordine fiorista non deve mai passare da free-text (Meta 131047).
    const floristNewOrderTemplateOnly =
        options?.source === 'puntoA_florist_new_order' ||
        options?.source === 'florist_new_order';
    if (floristNewOrderTemplateOnly && !options?.forceTemplate) {
        console.error(
            `[whatsapp-send] Rifiutato free-text per fiorista (source=${options?.source}). Usare solo template Meta approvati.`
        );
        return {
            ok: false,
            error: 'florist_new_order_requires_template: free-text bloccato (Meta 131047).',
            errorCode: 131047,
            fallbackExecuted: false,
        };
    }

    // 1. Tenta invio messaggio libero (session message), salvo forceTemplate
    if (!options?.forceTemplate) {
        const initialSend = await sendWhatsAppTextMessage(phone, text);

        if (initialSend.ok) {
            return { ...initialSend, fallbackExecuted: false };
        }

        // Se l'errore non riguarda la finestra 24h chiusa, restituisci il risultato direttamente
        if (!is24HourWindowError(initialSend)) {
            return { ...initialSend, fallbackExecuted: false };
        }

        if (options?.disableTemplateFallback) {
            return { ...initialSend, fallbackExecuted: false };
        }

        // 2. Intercetta errore finestra 24h chiusa e registra nei log di sistema
        console.warn('WhatsApp 24h Window Closed: Fallback to Template Executed', {
            phone,
            initialError: initialSend.error,
            errorCode: initialSend.errorCode,
            errorSubcode: initialSend.errorSubcode,
        });
    } else {
        console.info('[whatsapp] forceTemplate: salto free-text, invio diretto template', {
            phone,
            source: options.source,
        });
    }

    // Mappatura parametri per il template di notifica logistica / messaggio personalizzato
    const templateSpec = getProactiveWhatsAppTemplate();

    const rawOrderCode =
        options?.orderCode ||
        extractOrderCodeFromText(text) ||
        'FLOREMORIA';
    const orderCode = normalizeOrderCode(rawOrderCode) || 'FLOREMORIA';

    const rawFirstName =
        options?.recipientName ||
        'Cliente';
    const recipientFirstName = extractFirstName(rawFirstName) || 'Cliente';

    const staffNotes = sanitizeMetaTemplateParam(text, 900) || 'Aggiornamento sul Suo servizio.';

    // Meta FT body-only: {{1}} nome, {{2}} ordine, {{3}} note.
    const components = [
        {
            type: 'body' as const,
            parameters: [
                {
                    type: 'text' as const,
                    text: sanitizeMetaTemplateParam(recipientFirstName, 60) || '-',
                },
                {
                    type: 'text' as const,
                    text: sanitizeMetaTemplateParam(orderCode, 40) || '-',
                },
                {
                    type: 'text' as const,
                    text: staffNotes,
                },
            ],
        },
    ];

    // 3. Fallback / invio diretto via WhatsApp Template
    const templateResult = await sendWhatsAppTemplateMessage(
        phone,
        templateSpec.metaName,
        templateSpec.language,
        components,
        {
            expectedBodyParamCount: 3,
            expectedHeaderTextParamCount: 0,
        }
    );

    if (!templateResult.ok) {
        console.error('[whatsapp-24h-fallback] Fallback su template fallito:', templateResult.error);
        return {
            ok: false,
            error: `Invio fallito (finestra 24h chiusa & fallback template: ${templateResult.error})`,
            errorCode: templateResult.errorCode,
            fallbackExecuted: true,
        };
    }

    // 4. Se l'invio ha esito positivo, segna il messaggio come inviato su WhatsApp e aggiorna la cronologia chat Dashboard
    const sessionPhone = options?.sessionPhone || (phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone.replace(/^\+?/, '+')}`);
    try {
        await getSession(sessionPhone);
        if (options?.recipientName) {
            await updateSessionProfile(sessionPhone, {
                name: options.recipientName,
                userType: options.userType ?? 'UNKNOWN',
                status: 'HUMAN_INTERVENTION',
            });
        }
        await addMessage(sessionPhone, 'OUTBOUND', text, undefined, {
            source: options?.source || 'vera',
            outboundMode: options?.forceTemplate ? 'template_forced' : 'template_fallback_24h',
            templateName: templateSpec.metaName,
            orderCode,
            recipientFirstName,
            ...buildOutboundWamidMetadata(templateResult.messageId),
        });
        console.info(`[whatsapp-24h-fallback] Messaggio registrato con successo su chat Dashboard per ${sessionPhone}`);
    } catch (dbErr) {
        console.warn('[whatsapp-24h-fallback] Aggiornamento chat Dashboard fallito:', dbErr);
    }

    return {
        ok: true,
        messageId: templateResult.messageId,
        fallbackExecuted: true,
    };
}

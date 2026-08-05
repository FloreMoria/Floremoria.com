import prisma from '@/lib/prisma';
import {
    addMessage,
    getSession,
    setSessionStatus,
    updateSessionProfile,
    type ChatSession,
} from '@/lib/chatStore';
import {
    buildOperatorTemplateComponents,
    buildProactiveTemplateComponents,
    getApprovedWhatsAppTemplate,
    getProactiveWhatsAppTemplate,
    listApprovedWhatsAppTemplates,
    PROACTIVE_CONVERSATION_TEMPLATE_ID,
    ProactiveTemplateValidationError,
    renderOperatorTemplatePreview,
    renderProactiveTemplateMessage,
    validateProactiveTemplateBodyValues,
    type WhatsAppTemplateDefinition,
} from '@/lib/whatsapp/approvedTemplates';
import { requiresTemplateMessage } from '@/lib/whatsapp/messagingWindow';
import {
    sendWhatsAppTemplateMessage,
    sendWhatsAppTextMessage,
    type WhatsAppSendResult,
} from '@/lib/whatsapp/metaCloudApiClient';
import { buildContactInitials, toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';

export interface StartConversationInput {
    phoneRaw: string;
    displayName?: string;
    userType?: 'UTENTE' | 'FLORIST' | 'UNKNOWN';
    /** {{1}} Nome di battesimo destinatario (legacy proactive) */
    recipientFirstName?: string;
    /** {{2}} Codice ordine (es. FF-PN-26-004) */
    orderCode?: string;
    /** {{3}} Note libere staff */
    staffNotes?: string;
    templateId?: string;
    templateParams?: string[];
    /** Valori dinamici per i campi del template selezionato. */
    templateFieldValues?: Record<string, string>;
    messageText?: string;
}

export interface StartConversationResult {
    ok: boolean;
    session?: ChatSession;
    mode?: 'template' | 'freetext';
    requiresTemplate?: boolean;
    templates?: WhatsAppTemplateDefinition[];
    error?: string;
    send?: WhatsAppSendResult;
}

async function assertNotBlacklisted(sessionPhone: string): Promise<string | null> {
    const e164 = sessionPhone.replace(/^whatsapp:/, '');
    const blacklisted = await prisma.phoneBlacklist.findUnique({ where: { phone: e164 } });
    if (blacklisted) return 'Numero in blacklist: invio non consentito.';
    return null;
}

async function ensureStaffSession(
    sessionPhone: string,
    displayName?: string,
    userType: 'UTENTE' | 'FLORIST' | 'UNKNOWN' = 'UNKNOWN'
): Promise<ChatSession> {
    await getSession(sessionPhone);
    const name = displayName?.trim() || sessionPhone.replace('whatsapp:', '');
    return updateSessionProfile(sessionPhone, {
        name,
        userType,
        status: 'HUMAN_INTERVENTION',
        initials: buildContactInitials(name),
    });
}

export async function evaluateConversationOutbound(
    sessionPhone: string
): Promise<{ session: ChatSession; requiresTemplate: boolean }> {
    const session = await getSession(sessionPhone);
    return {
        session,
        requiresTemplate: requiresTemplateMessage(session),
    };
}

function resolveFieldValues(input: StartConversationInput): Record<string, string> {
    const fromPayload =
        input.templateFieldValues && typeof input.templateFieldValues === 'object'
            ? Object.fromEntries(
                  Object.entries(input.templateFieldValues).map(([k, v]) => [k, String(v ?? '')])
              )
            : {};

    // Retrocompat: campi legacy del template personalizzato staff.
    if (input.recipientFirstName && !fromPayload.recipientFirstName) {
        fromPayload.recipientFirstName = input.recipientFirstName;
    }
    if (input.orderCode && !fromPayload.orderCode) {
        fromPayload.orderCode = input.orderCode;
    }
    if (input.staffNotes && !fromPayload.staffNotes) {
        fromPayload.staffNotes = input.staffNotes;
    }

    return fromPayload;
}

export async function startProactiveConversation(
    input: StartConversationInput
): Promise<StartConversationResult> {
    const sessionPhone = toWhatsAppSessionPhone(input.phoneRaw);
    if (!sessionPhone) {
        return { ok: false, error: 'Numero di telefono non valido. Usi il formato internazionale, es. +393331112222.' };
    }

    const blacklistError = await assertNotBlacklisted(sessionPhone);
    if (blacklistError) return { ok: false, error: blacklistError };

    const { session, requiresTemplate } = await evaluateConversationOutbound(sessionPhone);

    if (requiresTemplate) {
        const templateId = input.templateId?.trim() || PROACTIVE_CONVERSATION_TEMPLATE_ID;
        const template = getApprovedWhatsAppTemplate(templateId);
        if (!template) {
            return {
                ok: false,
                requiresTemplate: true,
                templates: listApprovedWhatsAppTemplates(),
                session,
                error: 'Template Meta non riconosciuto.',
            };
        }

        const fieldValues = resolveFieldValues(input);
        let components;
        let logBody: string;

        try {
            if (template.id === PROACTIVE_CONVERSATION_TEMPLATE_ID) {
                const templateValues = validateProactiveTemplateBodyValues({
                    recipientFirstName: fieldValues.recipientFirstName ?? input.recipientFirstName,
                    orderCode: fieldValues.orderCode ?? input.orderCode,
                    staffNotes: fieldValues.staffNotes ?? input.staffNotes,
                });
                components = buildProactiveTemplateComponents(templateValues);
                logBody = renderProactiveTemplateMessage(
                    templateValues.recipientFirstName,
                    templateValues.orderCode,
                    templateValues.staffNotes
                );
            } else {
                components = buildOperatorTemplateComponents(template, fieldValues);
                logBody = renderOperatorTemplatePreview(template, fieldValues);
            }
        } catch (e) {
            const message =
                e instanceof ProactiveTemplateValidationError
                    ? e.message
                    : 'Parametri template non validi.';
            return {
                ok: false,
                requiresTemplate: true,
                templates: listApprovedWhatsAppTemplates(),
                session,
                error: message,
            };
        }

        const send = await sendWhatsAppTemplateMessage(
            sessionPhone,
            template.metaName,
            template.language,
            components,
            {
                expectedBodyParamCount: template.bodyParamCount,
                expectedHeaderTextParamCount:
                    template.headerTextParamCount > 0 ? template.headerTextParamCount : undefined,
            }
        );

        if (!send.ok) {
            return { ok: false, session, error: send.error ?? 'Invio template WhatsApp fallito.', send };
        }

        await ensureStaffSession(sessionPhone, input.displayName, input.userType ?? 'UNKNOWN');
        await setSessionStatus(sessionPhone, 'HUMAN_INTERVENTION');
        const logged = await addMessage(sessionPhone, 'OUTBOUND', logBody, undefined, {
            source: 'operator',
            outboundMode: 'template',
            templateId: template.id,
            templateName: template.metaName,
            ...buildOutboundWamidMetadata(send.messageId),
        });

        return { ok: true, session: logged, mode: 'template', send };
    }

    const text = input.messageText?.trim();
    if (!text) {
        return {
            ok: false,
            requiresTemplate: false,
            session,
            error: 'Inserisca il testo del messaggio.',
        };
    }

    const send = await sendWhatsAppTextMessage(sessionPhone, text);
    if (!send.ok) {
        return { ok: false, session, error: send.error ?? 'Invio WhatsApp fallito.', send };
    }

    await ensureStaffSession(sessionPhone, input.displayName, input.userType ?? 'UNKNOWN');
    await setSessionStatus(sessionPhone, 'HUMAN_INTERVENTION');
    const logged = await addMessage(sessionPhone, 'OUTBOUND', text, undefined, {
        source: 'operator',
        outboundMode: 'freetext',
        ...buildOutboundWamidMetadata(send.messageId),
    });

    return { ok: true, session: logged, mode: 'freetext', send };
}

/** Espone il catalogo template per la dashboard (senza side-effect). */
export function listOperatorWhatsAppTemplates(): WhatsAppTemplateDefinition[] {
    return listApprovedWhatsAppTemplates();
}

export function getDefaultOperatorTemplate(): WhatsAppTemplateDefinition {
    return getProactiveWhatsAppTemplate();
}

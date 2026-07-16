/**
 * VERA AI Reply — Generatore di risposte WhatsApp (Meta Cloud API) per FloreMoria.
 *
 * Routing (tassativo):
 *  - Template Meta: solo outbound proattivo (workflow ordini / notifiche), mai risposte in chat aperta.
 *  - Finestra 24h attiva (ultimo inbound utente/fiorista): testo in entrata → Gemini esclusivo.
 *  - Fuori finestra: regole deterministiche di fallback + Gemini se generico.
 *
 * Eccezioni operative prima di Gemini: escalation umana, eccezioni fiorista (tomba/chiusura),
 * modifica ordine, recensione Punto H, pre-acquisto Luciano.
 */

import {
    buildSymmetricCourtesyReply,
    isIsolatedCourtesyMessage,
} from '@/lib/vera/courtesyDebounce';
import {
    buildWhatsAppAiReply,
    buildSimpleThanksReply,
    ensureCatalogLinksInReply,
    ensureRespectfulOpening,
    isClosingMessage,
    STANDARD_GUIDANCE_MESSAGE,
} from '@/lib/whatsappKnowledge';
import { isActiveConversationWindow } from '@/lib/whatsapp/messagingWindow';
import { isOrderTrackingInquiry, lookupActiveOrderByPhone, lookupLastOrderByPhone, tryBuildOrderTrackingReply } from '@/lib/whatsapp/orderStatusInquiry';
import {
    buildVeraKnowledgeContext,
    buildVeraWhatsAppSystemInstruction,
    resolveVeraCallerContext,
} from '@/lib/vera';
import { onOrderStatusChanged } from '@/lib/orders/orderStatusFilter';
import { buildPreAcquisitionLucianoReply, isPreAcquisitionIntent } from '@/lib/vera/preAcquisitionIntent';
import { sanitizeWhatsAppDisplayName } from '@/lib/vera/displayName';
import {
    detectFloristException,
    handleFloristException,
    handleUserModificationRequest,
    isUserModificationRequest,
} from '@/lib/vera/orderWorkflow/exceptionScenarios';
import { tryRunPuntoHReviewRequest } from '@/lib/vera/orderWorkflow/puntoHReview';
import type { VeraCallerContext } from '@/lib/vera';
import type { ChatSession } from '@/lib/chatStore';
import {
    buildAccessoryPriceReply,
    buildCemeteryCoverageReply,
    buildFloristMiniAppSupportReply,
    buildInstantTransferPaymentReply,
    buildNewOrderLocationReply,
    buildOperatorHandoffReply,
    buildStandalonePhotoTextReply,
    buildWarmPraiseThanksReply,
    buildWebsiteFormIssueReply,
    finalizeVeraReplyText,
    GEMINI_MAX_OUTPUT_TOKENS,
    isCemeteryCoverageQuestion,
    isConfusionMessage,
    isInstantTransferPaymentRequest,
    isStandalonePhotoText,
    isWarmPraiseThanks,
    isWebsiteFormIssue,
    looksIncompleteReply,
    repairIncompleteReply,
    totalConfusionIncludingCurrent,
} from '@/lib/vera/conversationScenarioHandlers';

export const VERA_CLOSING_SIGNATURE =
    'Tutto lo Staff di FloreMoria le augura il meglio e la saluta cordialmente 🌹';

/** Parole chiave che indicano un congedo esplicito (non saluti iniziali). */
const FAREWELL_PHRASES = [
    'arrivederci',
    'a presto',
    'buona giornata',
    'buona serata',
    'buona notte',
    'ci sentiamo',
    'va bene cosi',
    'va bene così',
    'ho finito',
    'non serve altro',
    'a risentirci',
];

function normalizeForFarewell(message: string): string {
    return message
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isFarewellMessage(message: string): boolean {
    const m = normalizeForFarewell(message);
    if (!m) return false;

    // Congedo esplicito (non saluti isolati: "ciao" / "grazie" da soli → saluto simmetrico)
    if (FAREWELL_PHRASES.some((phrase) => m.includes(phrase))) return true;

    // Ringraziamento + congedo nella stessa frase
    if (m.includes('grazie') && FAREWELL_PHRASES.some((phrase) => m.includes(phrase))) return true;

    return false;
}

function stripClosingSignature(text: string): string {
    const escaped = VERA_CLOSING_SIGNATURE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`\\n*${escaped}\\s*$`, 'i'), '').trim();
}

function getDisplayNameFromSession(session: ChatSession, callerContext?: VeraCallerContext): string | undefined {
    if (callerContext?.firstName) return callerContext.firstName;
    const sanitized = sanitizeWhatsAppDisplayName(session.name);
    if (!sanitized) return undefined;
    const parts = sanitized.split(' ').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : undefined;
}

function sanitizeVeraReplyText(text: string): string {
    const cleaned = text
        .split('\n')
        .filter((line) => {
            const l = line.trim();
            if (!l) return true;
            const lower = l.toLowerCase();
            if (lower.startsWith('" ->') || lower.startsWith('->')) return false;
            if (lower === '*' || lower.startsWith('* ')) return false;
            if (/^(wait|let'?s|note:|thinking|output:)/i.test(l)) return false;
            if (/wait.*respectful/i.test(l)) return false;
            if (/^["'].*["']$/.test(l) && l.length < 80) return false;
            return true;
        })
        .join('\n')
        .replace(/^["']\s*/gm, '')
        .replace(/\s*["']$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Scarta risposte quasi vuote o solo link dopo pulizia
    if (!cleaned || cleaned.replace(/https?:\/\/\S+/g, '').trim().length < 3) {
        return '';
    }
    return cleaned;
}

function polishVeraReply(
    reply: string,
    message: string,
    session: ChatSession,
    callerContext: VeraCallerContext
): string {
    if (isIsolatedCourtesyMessage(message)) {
        return reply;
    }
    const hasPriorOutbound = session.messages.some((m) => m.direction === 'OUTBOUND');
    const closing = isClosingMessage(message);
    const skipCatalogLinks = isOrderTrackingInquiry(message);
    const skipOpeningPrefix = skipCatalogLinks || /^gentile\s+/i.test(reply.trim());
    let text = finalizeVeraReplyText(stripClosingSignature(reply), session.userType);
    if (!text) return reply;

    if (looksIncompleteReply(text)) {
        text = repairIncompleteReply(text, session.userType);
    }

    if (!closing && !skipOpeningPrefix) {
        text = ensureRespectfulOpening(
            text,
            hasPriorOutbound,
            getDisplayNameFromSession(session, callerContext)
        );
    }
    if (!closing && !skipCatalogLinks) {
        text = ensureCatalogLinksInReply(
            text,
            message,
            session.messages.map((m) => ({
                direction: m.direction,
                body: m.body,
                mediaUrl: m.mediaUrl,
                createdAt: m.createdAt,
            })),
            { userType: session.userType, skipCatalog: looksIncompleteReply(text) }
        );
    }
    return finalizeVeraReplyText(text, session.userType);
}

function shouldAppendSignature(message: string): boolean {
    return isFarewellMessage(message);
}

/** Costruisce il blocco storico messaggi per il prompt Gemini (ultimi N messaggi). */
function buildHistoryBlock(session: ChatSession, maxMessages = 12): string {
    const recent = session.messages.slice(-maxMessages);
    if (recent.length === 0) return '';
    return recent
        .map((msg) => {
            const role = msg.direction === 'INBOUND' ? 'UTENTE' : 'VERA';
            return `[${role}]: ${msg.body}`;
        })
        .join('\n');
}

/**
 * Chiama Google Gemini con il system prompt VERA completo.
 * Richiede GEMINI_API_KEY nel environment.
 * Ritorna null in caso di errore (il chiamante usa il fallback deterministico).
 */
async function callGeminiVera(
    userMessage: string,
    session: ChatSession,
    callerContext: VeraCallerContext
): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        console.warn('[vera-ai] GEMINI_API_KEY non configurata: salto LLM, uso risposta deterministica.');
        return null;
    }

    const model = process.env.POSTMAN_GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
    const knowledgeContext = buildVeraKnowledgeContext(session.userType);

    const systemInstruction = `${buildVeraWhatsAppSystemInstruction(
        callerContext,
        session.userType,
        knowledgeContext,
        session.name
    )}

Rispondi SOLO al messaggio dell'utente alla fine della conversazione, tenendo conto dello storico messaggi fornito.`;

    // Costruzione della chat history strutturata come alternanza di ruoli per Gemini
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    // Prendi gli ultimi messaggi validi (body non vuoto)
    const prevMessages = session.messages.filter(m => m.body?.trim());

    // Se l'ultimo messaggio nella sessione è già quello corrente dell'utente, lo escludiamo dall'history
    // in modo da appenderlo esplicitamente alla fine per garantire che il turno finale sia 'user'
    let historyMessages = prevMessages;
    if (historyMessages.length > 0 && historyMessages[historyMessages.length - 1].body?.trim() === userMessage.trim()) {
        historyMessages = historyMessages.slice(0, -1);
    }

    // Teniamo gli ultimi 6-8 messaggi storici (quindi massimo 6/7 messaggi prima del messaggio corrente)
    historyMessages = historyMessages.slice(-6);

    for (const msg of historyMessages) {
        const role = msg.direction === 'INBOUND' ? 'user' : 'model';
        contents.push({
            role,
            parts: [{ text: msg.body!.trim() }]
        });
    }

    // Aggiungiamo sempre alla fine il messaggio corrente come turno dell'utente ('user')
    contents.push({
        role: 'user',
        parts: [{ text: userMessage.trim() }]
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
            temperature: 0.45,
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
            topP: 0.9,
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const err = await res.text().catch(() => '');
            console.error(`[vera-ai] Gemini HTTP ${res.status}:`, err.slice(0, 300));
            return null;
        }

        const data = (await res.json()) as {
            candidates?: Array<{
                content?: { parts?: Array<{ text?: string }> };
                finishReason?: string;
            }>;
        };

        const finishReason = data?.candidates?.[0]?.finishReason;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) {
            console.warn('[vera-ai] Gemini: risposta vuota o bloccata.');
            return null;
        }
        if (finishReason === 'MAX_TOKENS') {
            console.warn('[vera-ai] Gemini: risposta troncata (MAX_TOKENS).');
        }
        const sanitized = finalizeVeraReplyText(sanitizeVeraReplyText(text), session.userType);
        if (!sanitized) {
            console.warn('[vera-ai] Gemini: risposta scartata dopo sanitizzazione.');
            return null;
        }
        return sanitized;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[vera-ai] Errore chiamata Gemini:', msg);
        return null;
    }
}

/** Messaggio utente per Gemini quando il testo è vuoto ma c'è un allegato. */
function buildGeminiUserMessage(
    message: string,
    mediaUrl?: string | null,
    userType?: ChatSession['userType']
): string {
    const text = message.trim();
    if (text && text !== '[media]') return text;
    if (!mediaUrl) return text || '(messaggio vuoto)';
    if (userType === 'FLORIST') {
        return '[Il fiorista ha inviato un allegato (foto o media) senza testo. Rispondi in modo umano e contestuale; se è una foto di posa, ringrazia e conferma che la registriamo.]';
    }
    return '[L\'utente ha inviato un allegato senza testo. Rispondi con empatia e chiedi gentilmente come puoi aiutare.]';
}

async function replyViaGeminiInActiveWindow(
    message: string,
    session: ChatSession,
    callerContext: VeraCallerContext,
    mediaUrl?: string | null
): Promise<VeraReplyResult | null> {
    const geminiReply = await callGeminiVera(
        buildGeminiUserMessage(message, mediaUrl, session.userType),
        session,
        callerContext
    );
    if (!geminiReply) return null;

    let replyText = geminiReply;
    if (!isClosingMessage(message)) {
        replyText = polishVeraReply(replyText, message, session, callerContext);
    } else {
        replyText = stripClosingSignature(replyText);
    }
    replyText = stripClosingSignature(replyText);
    if (shouldAppendSignature(message) && !replyText.includes(VERA_CLOSING_SIGNATURE)) {
        replyText = `${replyText}\n\n${VERA_CLOSING_SIGNATURE}`;
    }
    return { text: replyText, source: 'gemini', shouldEscalate: false };
}

export interface VeraReplyResult {
    text: string;
    source: 'deterministic' | 'gemini' | 'fallback';
    shouldEscalate: boolean;
}

/**
 * Genera la risposta VERA per un messaggio WhatsApp in entrata.
 *
 * @param message     Testo grezzo del messaggio utente
 * @param session     Sessione WhatsApp corrente (include cronologia)
 * @param mediaUrl    URL media allegato (opzionale)
 */
export async function generateVeraReply(
    message: string,
    session: ChatSession,
    mediaUrl?: string | null
): Promise<VeraReplyResult> {
    const { shouldEscalateToHuman, getHumanEscalationReason } = await import('@/lib/floremDigitalAssistant');

    const callerContext = await resolveVeraCallerContext(session);

    if (
        session.userType !== 'FLORIST' &&
        callerContext.mode === 'pre_acquisto' &&
        isPreAcquisitionIntent(message)
    ) {
        const replyText = buildPreAcquisitionLucianoReply(callerContext.firstName);
        return { text: replyText, source: 'deterministic', shouldEscalate: false };
    }

    if (session.userType === 'FLORIST' && callerContext.phoneE164) {
        const phoneDigits = callerContext.phoneE164.replace(/\D/g, '');
        const partner = await import('@/lib/prisma').then((m) =>
            m.default.partner.findFirst({
                where: {
                    deletedAt: null,
                    OR: [
                        { whatsappNumber: callerContext.phoneE164! },
                        { whatsappNumber: { contains: phoneDigits.slice(-9) } },
                    ],
                },
                select: { id: true, shopName: true, ownerName: true },
            })
        );

        if (partner) {
            // Verifica se il fiorista ha ordini in stato "Ricevuto" (ACCEPTED) in sospeso
            const acceptedOrder = await import('@/lib/prisma').then((m) =>
                m.default.order.findFirst({
                    where: {
                        partnerId: partner.id,
                        status: 'ACCEPTED',
                        deletedAt: null,
                    },
                })
            );

            if (acceptedOrder) {
                const AFFIRMATIVE_PATTERN = /^(ok|si|sì|accett[oa]|conferm[oa]|va\s+bene|ricevut[oa]|disponibile|preso\s+in\s+carico)/i;
                if (AFFIRMATIVE_PATTERN.test(message.trim())) {
                    // Transizione 1: PREME "In Lavorazione" (IN_PROGRESS)
                    await import('@/lib/prisma').then((m) =>
                        m.default.order.update({
                            where: { id: acceptedOrder.id },
                            data: { status: 'IN_PROGRESS' },
                        })
                    );
                    await onOrderStatusChanged(acceptedOrder.id, 'IN_PROGRESS');

                    // Transizione 2: PREME "In Attesa" (PENDING) e attende
                    await import('@/lib/prisma').then((m) =>
                        m.default.order.update({
                            where: { id: acceptedOrder.id },
                            data: { status: 'PENDING' },
                        })
                    );
                    await onOrderStatusChanged(acceptedOrder.id, 'PENDING');

                    // Risponde al fiorista con il link univoco alla mini-app
                    const { buildFloristDeliveryUrl } = await import('@/lib/orders/resolveOrderIdentifier');
                    const { extractFirstName } = await import('@/lib/whatsapp/proactiveTemplateParams');
                    
                    const deliveryUrl = buildFloristDeliveryUrl({ id: acceptedOrder.id, orderNumber: acceptedOrder.orderNumber });
                    const floristFirstName = extractFirstName(partner.ownerName || partner.shopName);

                    const reply = `Perfetto ${floristFirstName}, incarico confermato! Ecco il link della mini-app per effettuare le foto prima e dopo la posa: ${deliveryUrl}\n\nBuon lavoro!`;
                    return { text: reply, source: 'deterministic', shouldEscalate: false };
                }
            }

            const floristException = detectFloristException(message);
            if (floristException) {
                const handled = await handleFloristException({
                    partnerId: partner.id,
                    message,
                    type: floristException,
                });
                if (handled.handled) {
                    const reply =
                        floristException === 'tomb_not_found'
                            ? 'Ricevuto. Abbiamo avvisato l\'utente e il nostro staff per le indicazioni precise della tomba.'
                            : 'Ricevuto. Consegneremo il primo giorno utile di apertura e terremo aggiornato l\'utente.';
                    return { text: reply, source: 'deterministic', shouldEscalate: false };
                }
            }
        }
    }

    if (session.userType !== 'FLORIST' && callerContext.phoneE164) {
        const activeOrder = await lookupActiveOrderByPhone(callerContext.phoneE164);
        if (activeOrder && isUserModificationRequest(message)) {
            await handleUserModificationRequest({ orderId: activeOrder.id, message });
            return {
                text:
                    'La ringrazio per la Sua segnalazione. Ho trasmesso la richiesta al nostro Staff, che La ricontatterà al più presto con un aggiornamento.',
                source: 'deterministic',
                shouldEscalate: true,
            };
        }

        const recentOrder = await lookupLastOrderByPhone(callerContext.phoneE164);
        if (recentOrder?.deliveryProof?.status === 'COMPLETED') {
            const review = await tryRunPuntoHReviewRequest({
                orderId: recentOrder.id,
                userId: recentOrder.userId,
                customerPhone: recentOrder.customerPhone,
                message,
            });
            if (review.sent) {
                return {
                    text: 'La ringraziamo di cuore. Se desidera, il link per la recensione è già stato inviato in questo messaggio.',
                    source: 'deterministic',
                    shouldEscalate: false,
                };
            }
        }
    }

    // ── Prezzi accessori (lumino, biglietto, ceri, nastro) ────────────────────
    const accessoryReply = buildAccessoryPriceReply(message, session);
    if (accessoryReply) {
        return { text: accessoryReply, source: 'deterministic', shouldEscalate: false };
    }

    // ── Copertura consegna cimiteri ───────────────────────────────────────────
    if (isCemeteryCoverageQuestion(message)) {
        return {
            text: buildCemeteryCoverageReply(session),
            source: 'deterministic',
            shouldEscalate: false,
        };
    }

    // ── Bonifico istantaneo ───────────────────────────────────────────────────
    if (isInstantTransferPaymentRequest(message)) {
        return {
            text: buildInstantTransferPaymentReply(session),
            source: 'deterministic',
            shouldEscalate: false,
        };
    }

    // ── Problema sito / indirizzo non inseribile ──────────────────────────────
    if (isWebsiteFormIssue(message)) {
        return {
            text: buildWebsiteFormIssueReply(session),
            source: 'deterministic',
            shouldEscalate: false,
        };
    }

    // ── Ringraziamento caloroso (non cortesia isolata) ─────────────────────────
    if (isWarmPraiseThanks(message)) {
        return {
            text: buildWarmPraiseThanksReply(session),
            source: 'deterministic',
            shouldEscalate: false,
        };
    }

    // ── Testo "foto" senza allegato ───────────────────────────────────────────
    if (isStandalonePhotoText(message, mediaUrl)) {
        return {
            text: buildStandalonePhotoTextReply(session),
            source: 'deterministic',
            shouldEscalate: false,
        };
    }

    // ── Nuovo ordine con località (pre-acquisto attivo) ───────────────────────
    const newOrderReply = buildNewOrderLocationReply(message, session);
    if (newOrderReply) {
        return { text: newOrderReply, source: 'deterministic', shouldEscalate: false };
    }

    // ── Stato ordine / foto / urgenza (anche in finestra 24h) ─────────────────
    if (session.userType !== 'FLORIST' && isOrderTrackingInquiry(message)) {
        const orderReply = await tryBuildOrderTrackingReply(
            session.phone,
            session.name || '',
            message
        );
        if (orderReply) {
            return { text: orderReply, source: 'deterministic', shouldEscalate: false };
        }
    }

    // ── Fiorista: supporto mini-app ───────────────────────────────────────────
    if (session.userType === 'FLORIST') {
        const miniAppReply = buildFloristMiniAppSupportReply(message, session);
        if (miniAppReply) {
            return { text: miniAppReply, source: 'deterministic', shouldEscalate: false };
        }
    }

    // ── Confusione ripetuta → operatore umano ─────────────────────────────────
    if (isConfusionMessage(message) && totalConfusionIncludingCurrent(session, message) >= 2) {
        return {
            text: buildOperatorHandoffReply(),
            source: 'deterministic',
            shouldEscalate: true,
        };
    }

    // ── Escalation a operatore umano (richiesta esplicita) ────────────────────
    const escalationReason = getHumanEscalationReason(message);
    if (escalationReason) {
        console.info(`[vera-ai] Escalation umana: ${escalationReason}`);
        return {
            text: buildOperatorHandoffReply(),
            source: 'deterministic',
            shouldEscalate: true,
        };
    }

    // ── Finestra 24h attiva: Gemini esclusivo per testo (utenti e fioristi) ───
    if (isActiveConversationWindow(session)) {
        const geminiResult = await replyViaGeminiInActiveWindow(
            message,
            session,
            callerContext,
            mediaUrl
        );
        if (geminiResult) return geminiResult;

        const fallbackText =
            session.userType === 'FLORIST'
                ? 'Grazie per il messaggio, lo leggo subito. Buon lavoro 🌹'
                : STANDARD_GUIDANCE_MESSAGE;
        return { text: fallbackText, source: 'fallback', shouldEscalate: false };
    }

    // ── Fuori finestra 24h: cortesia isolata ─────────────────────────────────
    if (isIsolatedCourtesyMessage(message)) {
        return {
            text: buildSymmetricCourtesyReply({
                message,
                userType: session.userType,
                displayName: getDisplayNameFromSession(session, callerContext),
            }),
            source: 'deterministic',
            shouldEscalate: false,
        };
    }

    // ── Fuori finestra: regole deterministiche + Gemini se generico ───────────
    const deterministicReply = buildWhatsAppAiReply({
        message,
        userName: session.name || '',
        userType: session.userType,
        mediaUrl,
        history: session.messages.map((m) => ({
            direction: m.direction,
            body: m.body,
            mediaUrl: m.mediaUrl,
            createdAt: m.createdAt,
        })),
    });

    const isGenericFallback = deterministicReply.trim() === STANDARD_GUIDANCE_MESSAGE.trim();

    let replyText: string;
    let source: VeraReplyResult['source'];

    if (!isGenericFallback) {
        // Match specifico trovato: usa la risposta deterministica
        replyText = deterministicReply;
        source = 'deterministic';
    } else if (isClosingMessage(message)) {
        replyText = buildSimpleThanksReply();
        source = 'deterministic';
    } else {
        // Nessun match specifico: prova Gemini LLM
        const geminiReply = await callGeminiVera(message, session, callerContext);

        if (geminiReply) {
            replyText = geminiReply;
            source = 'gemini';
        } else {
            // Doppio fallback: risposta guida standard
            replyText = STANDARD_GUIDANCE_MESSAGE;
            source = 'fallback';
        }
    }

    // ── Rifinitura: tono commemorativo + link (non su messaggi di chiusura) ───
    if (!isClosingMessage(message)) {
        replyText = polishVeraReply(replyText, message, session, callerContext);
    } else {
        replyText = stripClosingSignature(replyText);
    }

    // ── Firma di chiusura (solo su congedo esplicito dell'Utente) ─────────────
    replyText = stripClosingSignature(replyText);
    if (shouldAppendSignature(message) && !replyText.includes(VERA_CLOSING_SIGNATURE)) {
        replyText = `${replyText}\n\n${VERA_CLOSING_SIGNATURE}`;
    }

    return { text: replyText, source, shouldEscalate: false };
}

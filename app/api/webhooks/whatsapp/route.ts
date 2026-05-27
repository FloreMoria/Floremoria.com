import { NextResponse } from 'next/server';
import { addMessage, getSession, setSessionStatus, updateSessionProfile } from '@/lib/chatStore';
import prisma from '@/lib/prisma';
import twilio from 'twilio';
import { getHumanEscalationReason, shouldEscalateToHuman } from '@/lib/floremDigitalAssistant';
import { buildWhatsAppAiReply, loadWhatsAppCoreKb } from '@/lib/whatsappKnowledge';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

function isTwilioSignatureValidationEnabled(): boolean {
    const raw = (process.env.TWILIO_VALIDATE_SIGNATURE || '').trim().toLowerCase();
    // Default: ON in production unless explicitly disabled.
    if (!raw) return true;
    return !['false', '0', 'no', 'off'].includes(raw);
}

function xmlResponse(xml: string, status = 200): NextResponse {
    return new NextResponse(xml, {
        status,
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
        },
    });
}

function twimlMessageResponse(message?: string): NextResponse {
    const messagingResponse = new twilio.twiml.MessagingResponse();
    if (message && message.trim()) {
        messagingResponse.message(message);
    }
    return xmlResponse(messagingResponse.toString(), 200);
}

async function sendTwilioRestReply(to: string, message?: string): Promise<boolean> {
    if (!message?.trim()) return false;
    if (!accountSid || !authToken) return false;

    try {
        const client = twilio(accountSid, authToken);
        await client.messages.create({
            body: message,
            from: twilioNumber,
            to,
        });
        return true;
    } catch (err) {
        console.error('[Twilio REST Send Error]', err);
        return false;
    }
}

async function respondWithTwimlAndRest(to: string, message?: string): Promise<NextResponse> {
    const restDelivered = await sendTwilioRestReply(to, message);
    // Evita doppi invii: se il REST va a buon fine, TwiML risponde vuoto ma valido.
    if (restDelivered) {
        return twimlMessageResponse();
    }
    return twimlMessageResponse(message);
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function extractOnboardingChoice(rawMessage: string): 'UTENTE' | 'FLORIST' | null {
    const msg = rawMessage.trim();
    if (/^\[?1\]?$/.test(msg)) return 'UTENTE';
    if (/^\[?2\]?$/.test(msg)) return 'FLORIST';
    return null;
}

function extractOrderCode(rawMessage: string): string | null {
    const orderMatch = rawMessage.match(/\b(?:FT|FF|FA|FP)-[A-Z]{2}-\d{2}-\d{3}\b/i);
    return orderMatch ? orderMatch[0].toUpperCase() : null;
}

function normalizePhone(phone: string): string {
    return phone.replace('whatsapp:', '').replace(/[^\d+]/g, '').trim();
}

function isSupportInfoRequest(rawMessage: string): boolean {
    const m = rawMessage.toLowerCase();
    return ['orari', 'orario', 'assistenza', 'operatore', 'umano'].some((keyword) => m.includes(keyword));
}

function buildWelcomeMessage(kb: { supportHours: string }): string {
    return [
        'Buongiorno, sono VERA, assistenza virtuale di FloreMoria.',
        `Siamo disponibili ${kb.supportHours}. Come posso aiutarla?`,
        'Se desidera parlare con lo staff umano, scriva UMANO.',
        'Per iniziare scelga un profilo:',
        '[1] Sono un Utente',
        '[2] Sono un fiorista partner',
    ].join('\n');
}

export async function POST(request: Request) {
    try {
        let body: any = {};
        const twilioParams: Record<string, string> = {};
        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            formData.forEach((value, key) => {
                const normalized = typeof value === 'string' ? value : String(value);
                body[key] = normalized;
                twilioParams[key] = normalized;
            });
        } else {
            body = await request.json();
            Object.entries(body || {}).forEach(([key, value]) => {
                twilioParams[key] = asString(value);
            });
        }

        console.log('[WhatsApp Webhook IN] received payload:', JSON.stringify(body));

        // Twilio parameters: From, Body, MediaUrl0, ProfileName, MessageSid
        const phone = asString(body.From) || 'whatsapp:+393339999999';
        const rawMessage = asString(body.Body);
        const mediaUrl = asString(body.MediaUrl0) || null;
        const profileName = asString(body.ProfileName) || 'Utente';
        const messageSid = asString(body.MessageSid);
        const normalizedPhone = normalizePhone(phone);
        const kb = loadWhatsAppCoreKb();

        // Validazione della firma Twilio (X-Twilio-Signature) in produzione.
        // Override emergenza: TWILIO_VALIDATE_SIGNATURE=false per non bloccare il canale durante troubleshooting.
        const isProd = process.env.NODE_ENV === 'production';
        const signatureRequested = isTwilioSignatureValidationEnabled();
        const enforceTwilioSignature = signatureRequested && !!authToken;
        if (isProd && signatureRequested && !authToken) {
            console.warn('[WhatsApp Webhook Security] TWILIO_AUTH_TOKEN mancante: bypass firma attivato per continuita operativa.');
        }
        if (isProd && enforceTwilioSignature) {
            const signature = request.headers.get('x-twilio-signature') || '';
            const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'www.floremoria.com';
            const proto = request.headers.get('x-forwarded-proto') || 'https';
            const absoluteUrl = `${proto}://${host}${new URL(request.url).pathname}${new URL(request.url).search}`;
            const isValid = twilio.validateRequest(authToken, signature, absoluteUrl, twilioParams);
            if (!isValid) {
                console.warn('[WhatsApp Webhook Security] Validazione della firma fallita per la richiesta:', {
                    signature,
                    absoluteUrl,
                    bodyKeys: Object.keys(twilioParams),
                });
                return xmlResponse('<Response></Response>', 403);
            }
        } else if (isProd && !enforceTwilioSignature) {
            console.warn('[WhatsApp Webhook Security] Firma Twilio disattivata via TWILIO_VALIDATE_SIGNATURE=false');
        }

        // 1. Get or create session
        let session = await getSession(phone);
        if (session.name === phone.replace('whatsapp:', '')) {
            session = await updateSessionProfile(phone, { name: profileName });
        }

        // Deduplica dei messaggi (Idempotency): se abbiamo già elaborato questo MessageSid in sessione, evitiamo risposte duplicate
        if (messageSid && session.messages.some((msg) => msg.metadata?.messageSid === messageSid)) {
            console.info(`[WhatsApp Deduplication] Messaggio già elaborato: ${messageSid}. Rispondo con TwiML vuoto.`);
            return twimlMessageResponse();
        }

        // 2. Save incoming message immediately (dashboard/chat DB sync).
        await addMessage(
            phone, 
            'INBOUND', 
            rawMessage, 
            mediaUrl || undefined, 
            messageSid ? { messageSid } : undefined
        );

        // 3. Check for explicit or emotional human handoff trigger.
        const wantsHuman = shouldEscalateToHuman(rawMessage);
        const escalationReason = wantsHuman ? getHumanEscalationReason(rawMessage) : null;
        if (wantsHuman && session.status !== 'HUMAN_INTERVENTION') {
            if (process.env.NODE_ENV === 'development') {
                console.info(`[WhatsApp Handoff] ${phone} => HUMAN_INTERVENTION (${escalationReason || 'unknown'})`);
            }
            await setSessionStatus(phone, 'HUMAN_INTERVENTION');
            session = await updateSessionProfile(phone, { welcomeSent: true });
            const humanNotice = 'Ti passo subito a un operatore umano. Restiamo con te.';
            const welcomeMessage = buildWelcomeMessage(kb);
            const composedHumanReply = `${welcomeMessage}\n\n${humanNotice}`;

            await addMessage(phone, 'OUTBOUND', composedHumanReply, undefined, {
                eventType: 'HUMAN_HANDOFF',
                handoffReason: escalationReason || 'unknown',
                handoffAt: new Date().toISOString(),
            });
            return await respondWithTwimlAndRest(phone, composedHumanReply);
        }

        // Welcome kit one-shot per session.
        if (!session.welcomeSent) {
            const welcomeMessage = buildWelcomeMessage(kb);
            session = await updateSessionProfile(phone, { welcomeSent: true });
            await addMessage(phone, 'OUTBOUND', welcomeMessage);
            return await respondWithTwimlAndRest(phone, welcomeMessage);
        }

        // Explicit support keywords bypass generic flows and repeat essential info.
        if (isSupportInfoRequest(rawMessage) && !wantsHuman) {
            const supportReply = buildWelcomeMessage(kb);
            await addMessage(phone, 'OUTBOUND', supportReply);
            return await respondWithTwimlAndRest(phone, supportReply);
        }

        // 4. Determine user type if unknown (DB match + onboarding flow)
        if (session.userType === 'UNKNOWN') {
            try {
                // Try matching with Partner
                const partner = await prisma.partner.findFirst({
                    where: { 
                        whatsappNumber: { contains: normalizedPhone },
                        deletedAt: null 
                    }
                });
                if (partner) {
                    session = await updateSessionProfile(phone, {
                        userType: 'FLORIST',
                        name: partner.shopName,
                    });
                } else {
                    // Try matching with Order Utente
                    const order = await prisma.order.findFirst({
                        where: { customerPhone: { contains: normalizedPhone } }
                    });
                    if (order) {
                        session = await updateSessionProfile(phone, {
                            userType: 'UTENTE',
                            name: order.buyerFullName || profileName,
                        });
                    }
                }
            } catch (dbErr) {
                console.warn('Database unreachable, fallback onboarding only', dbErr);
            }

            if (session.userType === 'UNKNOWN') {
                const choice = extractOnboardingChoice(rawMessage);
                if (!choice) {
                    const onboardingMessage = 'Per proseguire, risponda con [1] se e Utente oppure [2] se e fiorista partner.';
                    await addMessage(phone, 'OUTBOUND', onboardingMessage);
                    return await respondWithTwimlAndRest(phone, onboardingMessage);
                }

                if (choice === 'UTENTE') {
                    const fallbackName = profileName || `Utente ${normalizedPhone.slice(-4) || 'Nuovo'}`;
                    const initials = fallbackName
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() || '')
                        .join('') || 'UT';
                    session = await updateSessionProfile(phone, {
                        userType: 'UTENTE',
                        name: fallbackName,
                        initials,
                    });
                    const confirmation = 'Perfetto, profilo registrato come UTENTE. Come posso aiutarti oggi?';
                    await addMessage(phone, 'OUTBOUND', confirmation);
                    return await respondWithTwimlAndRest(phone, confirmation);
                }

                const floristPending = 'Ricevuto. Profilo fiorista in verifica: tra poco ti invieremo il testo di convalida dedicato.';
                await setSessionStatus(phone, 'HUMAN_INTERVENTION');
                await addMessage(phone, 'OUTBOUND', floristPending);
                return await respondWithTwimlAndRest(phone, floristPending);
            }
        }

        // 5. If AI Assistant is active (AI_ACTIVE), respond automatically
        if (session.status === 'AI_ACTIVE') {
            const sessionWithHistory = await getSession(phone);
            const replyText = buildWhatsAppAiReply({
                message: rawMessage,
                userName: session.name,
                userType: session.userType,
                mediaUrl,
                history: sessionWithHistory.messages.map((msg) => ({
                    direction: msg.direction,
                    body: msg.body,
                    mediaUrl: msg.mediaUrl,
                })),
            });

            // Se il fiorista invia una foto, proviamo ad agganciarla all'ordine indicato nel testo.
            if (session.userType === 'FLORIST' && mediaUrl) {
                const orderNum = extractOrderCode(rawMessage);
                if (orderNum) {
                    try {
                        const targetOrder = await prisma.order.findFirst({
                            where: { orderNumber: orderNum },
                        });
                        if (targetOrder) {
                            let partnerIdForProof = targetOrder.partnerId;
                            if (!partnerIdForProof) {
                                const matchedPartner = await prisma.partner.findFirst({
                                    where: {
                                        whatsappNumber: { contains: normalizedPhone },
                                        deletedAt: null,
                                    },
                                    select: { id: true },
                                });
                                partnerIdForProof = matchedPartner?.id || null;
                            }

                            if (!partnerIdForProof) {
                                console.warn(`[Photo Ingestion] Missing partner for order ${orderNum}, skipping proof create.`);
                            } else {
                                await prisma.deliveryProof.upsert({
                                    where: { orderId: targetOrder.id },
                                    update: {
                                        photoAfterUrl: mediaUrl,
                                        timestampAfter: new Date(),
                                        status: 'COMPLETED',
                                    },
                                    create: {
                                        orderId: targetOrder.id,
                                        partnerId: partnerIdForProof,
                                        photoAfterUrl: mediaUrl,
                                        timestampAfter: new Date(),
                                        status: 'COMPLETED',
                                    },
                                });
                                console.log(`[Photo Ingestion] Photo associated with order ${orderNum}`);
                            }
                        }
                    } catch (dbErr) {
                        console.warn('[Photo Ingestion Database Error] Running in offline fallback mode:', dbErr);
                    }
                }
            }

            // Save outbound message in store and return via TwiML.
            await addMessage(phone, 'OUTBOUND', replyText);
            return await respondWithTwimlAndRest(phone, replyText);
        }

        // No automated response for this branch, but Twilio still needs valid TwiML XML.
        return await respondWithTwimlAndRest(phone);

    } catch (error) {
        console.error('[WhatsApp Webhook ERR]', error);
        return twimlMessageResponse('Abbiamo ricevuto il Suo messaggio e la contatteremo tra pochi minuti.');
    }
}

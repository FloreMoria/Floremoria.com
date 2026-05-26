import { NextResponse } from 'next/server';
import { addMessage, getSession, setSessionStatus, updateSessionProfile } from '@/lib/chatStore';
import prisma from '@/lib/prisma';
import twilio from 'twilio';
import { getHumanEscalationReason, shouldEscalateToHuman } from '@/lib/floremDigitalAssistant';
import { buildWhatsAppAiReply, loadWhatsAppCoreKb } from '@/lib/whatsappKnowledge';

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

export async function POST(request: Request) {
    try {
        let body: any = {};
        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            formData.forEach((value, key) => {
                body[key] = value;
            });
        } else {
            body = await request.json();
        }

        console.log('[WhatsApp Webhook IN] received payload:', JSON.stringify(body));

        // Twilio parameters: From, Body, MediaUrl0, ProfileName
        const phone = asString(body.From) || 'whatsapp:+393339999999';
        const rawMessage = asString(body.Body);
        const mediaUrl = asString(body.MediaUrl0) || null;
        const profileName = asString(body.ProfileName) || 'Utente';
        const normalizedPhone = normalizePhone(phone);
        const kb = loadWhatsAppCoreKb();

        // 1. Get or create session
        let session = await getSession(phone);
        if (session.name === phone.replace('whatsapp:', '')) {
            session = await updateSessionProfile(phone, { name: profileName });
        }

        // 2. Save incoming message immediately (dashboard/chat DB sync).
        await addMessage(phone, 'INBOUND', rawMessage, mediaUrl || undefined);

        // 3. Check for explicit or emotional human handoff trigger.
        const wantsHuman = shouldEscalateToHuman(rawMessage);
        const escalationReason = wantsHuman ? getHumanEscalationReason(rawMessage) : null;
        if (wantsHuman && session.status !== 'HUMAN_INTERVENTION') {
            if (process.env.NODE_ENV === 'development') {
                console.info(`[WhatsApp Handoff] ${phone} => HUMAN_INTERVENTION (${escalationReason || 'unknown'})`);
            }
            await setSessionStatus(phone, 'HUMAN_INTERVENTION');
            const humanNotice = 'Ti passo subito a un operatore umano. Restiamo con te.';

            await addMessage(phone, 'OUTBOUND', humanNotice, undefined, {
                eventType: 'HUMAN_HANDOFF',
                handoffReason: escalationReason || 'unknown',
                handoffAt: new Date().toISOString(),
            });
            return twimlMessageResponse(humanNotice);
        }

        // Welcome kit one-shot per session.
        if (!session.welcomeSent) {
            const welcomeLines = [
                `Buongiorno, sono VERA, assistenza virtuale FloreMoria.`,
                `Siamo disponibili ${kb.supportHours}.`,
                `Se desidera parlare con lo staff umano, scriva UMANO.`,
            ];
            if (session.userType === 'UNKNOWN') {
                welcomeLines.push('Per iniziare scelga un profilo:');
                welcomeLines.push('[1] Sono un Utente');
                welcomeLines.push('[2] Sono un fiorista partner');
            }
            const welcomeMessage = welcomeLines.join('\n');
            session = await updateSessionProfile(phone, { welcomeSent: true });
            await addMessage(phone, 'OUTBOUND', welcomeMessage);
            return twimlMessageResponse(welcomeMessage);
        }

        // Explicit support keywords bypass generic flows and repeat essential info.
        if (isSupportInfoRequest(rawMessage) && !wantsHuman) {
            const supportReply = `Assistenza FloreMoria: siamo disponibili ${kb.supportHours}. Se desidera, puo scrivere UMANO e La mettiamo subito in contatto con lo staff.`;
            await addMessage(phone, 'OUTBOUND', supportReply);
            return twimlMessageResponse(supportReply);
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
                    return twimlMessageResponse(onboardingMessage);
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
                    return twimlMessageResponse(confirmation);
                }

                const floristPending = 'Ricevuto. Profilo fiorista in verifica: tra poco ti invieremo il testo di convalida dedicato.';
                await setSessionStatus(phone, 'HUMAN_INTERVENTION');
                await addMessage(phone, 'OUTBOUND', floristPending);
                return twimlMessageResponse(floristPending);
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
            return twimlMessageResponse(replyText);
        }

        // No automated response for this branch, but Twilio still needs valid TwiML XML.
        return twimlMessageResponse();

    } catch (error) {
        console.error('[WhatsApp Webhook ERR]', error);
        return twimlMessageResponse('Abbiamo ricevuto il Suo messaggio e la contatteremo tra pochi minuti.');
    }
}

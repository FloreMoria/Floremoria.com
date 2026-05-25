import { NextResponse } from 'next/server';
import { addMessage, getSession, setSessionStatus } from '@/lib/chatStore';
import prisma from '@/lib/prisma';
import twilio from 'twilio';
import { FLOREM_HUMAN_OPERATOR_TRIGGER } from '@/lib/floremDigitalAssistant';
import { buildWhatsAppAiReply } from '@/lib/whatsappKnowledge';

// Load Twilio credentials to allow reply if configured
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

async function sendTwilioReply(to: string, text: string) {
    if (!accountSid || !authToken) {
        console.log(`[Twilio Mock Reply] To: ${to} | Text: ${text}`);
        return;
    }
    try {
        const client = twilio(accountSid, authToken);
        await client.messages.create({
            body: text,
            from: twilioNumber,
            to: to
        });
        console.log(`[Twilio Sent Success] To: ${to}`);
    } catch (err) {
        console.error('[Twilio Send Error]', err);
    }
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
        const phone = body.From || 'whatsapp:+393339999999';
        const rawMessage = body.Body || '';
        const mediaUrl = body.MediaUrl0 || null;
        const profileName = body.ProfileName || 'Cliente';

        // 1. Get or create session
        const session = getSession(phone);
        if (session.name === phone.replace('whatsapp:', '')) {
            session.name = profileName;
        }

        // 2. Determine user type if unknown (try matching with DB)
        if (session.userType === 'UNKNOWN') {
            try {
                // Try matching with Partner
                const partner = await prisma.partner.findFirst({
                    where: { 
                        whatsappNumber: { contains: phone.replace('whatsapp:', '').trim() },
                        deletedAt: null 
                    }
                });
                if (partner) {
                    session.userType = 'FLORIST';
                    session.name = partner.shopName;
                } else {
                    // Try matching with Order client
                    const order = await prisma.order.findFirst({
                        where: { customerPhone: { contains: phone.replace('whatsapp:', '').trim() } }
                    });
                    if (order) {
                        session.userType = 'CLIENT';
                        session.name = order.buyerFullName || profileName;
                    } else {
                        session.userType = 'CLIENT';
                    }
                }
            } catch (dbErr) {
                console.warn('Database unreachable, matching locally or setting default to CLIENT', dbErr);
                // Fallback local matching
                if (phone.includes('3444222333') || rawMessage.toLowerCase().includes('fiorista')) {
                    session.userType = 'FLORIST';
                    session.name = 'Medda Gabriele';
                } else {
                    session.userType = 'CLIENT';
                }
            }
        }

        // 3. Save incoming message
        addMessage(phone, 'INBOUND', rawMessage, mediaUrl);

        // 4. Check for UMANO (Human) handoff trigger
        const lowerMsg = rawMessage.toLowerCase();
        const wantsHuman = rawMessage.toUpperCase().includes(FLOREM_HUMAN_OPERATOR_TRIGGER);

        if (wantsHuman && session.status !== 'HUMAN_INTERVENTION') {
            setSessionStatus(phone, 'HUMAN_INTERVENTION');
            const humanNotice = 'Ti passo subito a un operatore umano. Restiamo con te.';
            
            // Save outbound message in store and send via Twilio
            addMessage(phone, 'OUTBOUND', humanNotice);
            await sendTwilioReply(phone, humanNotice);
            
            return new NextResponse('Handoff Triggered', { status: 200 });
        }

        // 5. If AI Assistant is active (AI_ACTIVE), respond automatically
        if (session.status === 'AI_ACTIVE') {
            const replyText = buildWhatsAppAiReply({
                message: rawMessage,
                userName: session.name,
                userType: session.userType,
                mediaUrl,
            });

            // Se il fiorista invia una foto, proviamo ad agganciarla all'ordine indicato nel testo.
            if (session.userType === 'FLORIST' && mediaUrl) {
                const orderMatch = rawMessage.match(/\b(?:FT|FF|FA|FP)-[A-Z]{2}-\d{2}-\d{3}\b/i);
                const orderNum = orderMatch ? orderMatch[0].toUpperCase() : null;
                if (orderNum) {
                    try {
                        const targetOrder = await prisma.order.findFirst({
                            where: { orderNumber: orderNum },
                        });
                        if (targetOrder) {
                            await prisma.deliveryProof.upsert({
                                where: { orderId: targetOrder.id },
                                update: {
                                    photoAfterUrl: mediaUrl,
                                    timestampAfter: new Date(),
                                    status: 'COMPLETED',
                                },
                                create: {
                                    orderId: targetOrder.id,
                                    partnerId: targetOrder.partnerId || 'default-partner',
                                    photoAfterUrl: mediaUrl,
                                    timestampAfter: new Date(),
                                    status: 'COMPLETED',
                                },
                            });
                            console.log(`[Photo Ingestion] Photo associated with order ${orderNum}`);
                        }
                    } catch (dbErr) {
                        console.warn('[Photo Ingestion Database Error] Running in offline fallback mode:', dbErr);
                    }
                }
            }

            // Save outbound message in store and send via Twilio
            addMessage(phone, 'OUTBOUND', replyText);
            await sendTwilioReply(phone, replyText);
        }

        return new NextResponse('Webhook Processed', { status: 200 });

    } catch (error) {
        console.error('[WhatsApp Webhook ERR]', error);
        return new NextResponse('Internal Webhook Error', { status: 500 });
    }
}

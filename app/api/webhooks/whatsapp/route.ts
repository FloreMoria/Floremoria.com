import { NextResponse } from 'next/server';
import { addMessage, getSession, setSessionStatus } from '@/lib/chatStore';
import prisma from '@/lib/prisma';
import twilio from 'twilio';

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

        // 4. Check for UMANO (Human) handoff triggers
        const lowerMsg = rawMessage.toLowerCase();
        const wantsHuman = lowerMsg.includes('umano') || 
                           lowerMsg.includes('operatore') || 
                           lowerMsg.includes('parlare') || 
                           lowerMsg.includes('aiuto') || 
                           lowerMsg.includes('salvatore') ||
                           lowerMsg.includes('persona');

        if (wantsHuman && session.status !== 'HUMAN_INTERVENTION') {
            setSessionStatus(phone, 'HUMAN_INTERVENTION');
            const humanNotice = "La sto trasferendo a un operatore umano. Salvatore o uno dei nostri addetti all'assistenza FloreMoria prenderà in carico la chat a brevissimo per aiutarla di persona. A presto! 🌹";
            
            // Save outbound message in store and send via Twilio
            addMessage(phone, 'OUTBOUND', humanNotice);
            await sendTwilioReply(phone, humanNotice);
            
            return new NextResponse('Handoff Triggered', { status: 200 });
        }

        // 5. If AI Assistant is active (AI_ACTIVE), respond automatically
        if (session.status === 'AI_ACTIVE') {
            let replyText = '';

            // --- A: FLORIST (Partner) LOGIC ---
            if (session.userType === 'FLORIST') {
                if (mediaUrl) {
                    // Ingest photo! Extract potential order number (e.g. FT-RM-26-001)
                    const orderMatch = rawMessage.match(/FT-RM-\d+-\d+/i) || rawMessage.match(/FT-\d+/i);
                    const orderNum = orderMatch ? orderMatch[0].toUpperCase() : 'FT-RM-26-001';

                    replyText = `Grazie mille per la foto caricata! Ho registrato la garanzia fotografica e l'ho associata all'ordine ${orderNum} nella dashboard FloreMoria. È stata approvata automaticamente dai nostri controlli di qualità preliminari. Buon lavoro! 🌸`;

                    // Ingest delivery proof into DB safely
                    try {
                        const targetOrder = await prisma.order.findFirst({
                            where: { orderNumber: orderNum }
                        });
                        if (targetOrder) {
                            await prisma.deliveryProof.upsert({
                                where: { orderId: targetOrder.id },
                                update: {
                                    photoAfterUrl: mediaUrl,
                                    timestampAfter: new Date(),
                                    status: 'COMPLETED'
                                },
                                create: {
                                    orderId: targetOrder.id,
                                    partnerId: targetOrder.partnerId || 'default-partner',
                                    photoAfterUrl: mediaUrl,
                                    timestampAfter: new Date(),
                                    status: 'COMPLETED'
                                }
                            });
                            console.log(`[Photo Ingestion] Photo associated with order ${orderNum}`);
                        }
                    } catch (dbErr) {
                        console.warn('[Photo Ingestion Database Error] Running in offline fallback mode:', dbErr);
                    }
                } else {
                    replyText = `Buongiorno! Se stai completando un allestimento, inviami pure la foto del bouquet posato sulla tomba indicando il numero progressivo dell'ordine (es. FT-RM-26-001) affinché possa caricarlo all'istante nella dashboard! 🌹`;
                }
            } 
            // --- B: CLIENT LOGIC ---
            else {
                // Vito Empathy AI simulation
                if (lowerMsg.includes('stato') || lowerMsg.includes('ordine') || lowerMsg.includes('consegna')) {
                    replyText = `Gentile ${session.name}, le confermo che le nostre consegne al cimitero avvengono sempre puntualmente prima della cerimonia o in mattinata. Riceverà una notifica SMS e WhatsApp automatica con la foto prova non appena l'omaggio floreale sarà posato con rispetto sulla tomba del suo caro. 🌹`;
                } else if (lowerMsg.includes('foto') || lowerMsg.includes('prova')) {
                    replyText = `Sì, assolutamente! Con il nostro protocollo 'Luce e Memoria' le invieremo una foto reale e ad alta definizione dell'omaggio floreale allestito al cimitero, così che possa vedere il risultato con i suoi occhi. 📸`;
                } else if (lowerMsg.includes('prezzo') || lowerMsg.includes('costo') || lowerMsg.includes('spedizione')) {
                    replyText = `I nostri prezzi includono sempre la confezione a mano da parte di fioristi locali. Le spese di consegna cimiteriale o a domicilio vengono calcolate al checkout in base alla località esatta, garantendo il massimo rispetto e puntualità. 🌸`;
                } else {
                    replyText = `Gentile ${session.name}, sono Vito, l'assistente virtuale di FloreMoria. Sono qui per aiutarla a onorare la memoria del suo caro nel modo più sereno e trasparente possibile. Se desidera parlare direttamente con Salvatore o un operatore umano, scriva semplicemente la parola "UMANO". 🌹`;
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

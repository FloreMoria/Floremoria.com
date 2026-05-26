import { NextResponse } from 'next/server';
import { getChatStore, addMessage, setSessionStatus } from '@/lib/chatStore';
import twilio from 'twilio';

// Load Twilio credentials to allow actual outbound messaging from dashboard
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

async function sendTwilioMessage(to: string, text: string) {
    if (!accountSid || !authToken) {
        console.log(`[Twilio Mock Send Dashboard] To: ${to} | Text: ${text}`);
        return true;
    }
    try {
        const client = twilio(accountSid, authToken);
        await client.messages.create({
            body: text,
            from: twilioNumber,
            to: to
        });
        console.log(`[Twilio Dashboard Success] Sent to ${to}`);
        return true;
    } catch (err: any) {
        console.error('[Twilio Dashboard Send Error]', err);
        throw new Error(err.message || 'Errore durante l\'invio del messaggio tramite Twilio.');
    }
}

function emptySessionsResponse(reason: string) {
    return NextResponse.json(
        {
            success: true,
            sessions: [],
            degraded: true,
            reason,
        },
        { status: 200 },
    );
}

// GET: Retrieve all active chat sessions from persistent store
export async function GET() {
    if (!hasDatabaseUrl) {
        console.warn('[Communications Dashboard] DATABASE_URL assente: ritorno sessions vuoto.');
        return emptySessionsResponse('DATABASE_URL missing');
    }

    try {
        const store = await getChatStore();
        // Convert record to array, sorted by last updated timestamp
        const sessions = Object.values(store).sort((a, b) => {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return NextResponse.json({ success: true, sessions });
    } catch (err: any) {
        console.error('[Communications Dashboard GET Error]', err);
        return emptySessionsResponse(err?.message || 'chat store unavailable');
    }
}

// POST: Send outbound manual operator message or change session AI/HUMAN status
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { phone, action, messageText, status } = body;

        if (!phone) {
            return NextResponse.json({ success: false, error: 'Parametro "phone" mancante.' }, { status: 400 });
        }

        // Action A: Toggle Session Status (AI vs Human Operator)
        if (action === 'updateStatus') {
            if (!status || !['AI_ACTIVE', 'HUMAN_INTERVENTION', 'CLOSED'].includes(status)) {
                return NextResponse.json({ success: false, error: 'Stato non valido.' }, { status: 400 });
            }
            const session = await setSessionStatus(phone, status);
            return NextResponse.json({ success: true, session });
        }

        // Action B: Send Outbound Chat Message
        if (action === 'sendMessage') {
            if (!messageText || messageText.trim() === '') {
                return NextResponse.json({ success: false, error: 'Parametro "messageText" vuoto o mancante.' }, { status: 400 });
            }

            // 1. Send via Twilio
            await sendTwilioMessage(phone, messageText);

            // 2. Save in local database
            const session = await addMessage(phone, 'OUTBOUND', messageText);

            return NextResponse.json({ success: true, session });
        }

        return NextResponse.json({ success: false, error: 'Azione non riconosciuta.' }, { status: 400 });

    } catch (err: any) {
        console.error('[Communications Dashboard Action Error]', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

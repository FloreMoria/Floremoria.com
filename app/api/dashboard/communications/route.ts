import { NextResponse } from 'next/server';
import { getChatStore, addMessage, setSessionStatus } from '@/lib/chatStore';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

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

export async function GET() {
    if (!hasDatabaseUrl) {
        console.warn('[Communications Dashboard] DATABASE_URL assente: ritorno sessions vuoto.');
        return emptySessionsResponse('DATABASE_URL missing');
    }

    try {
        const store = await getChatStore();
        const sessions = Object.values(store).sort((a, b) => {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return NextResponse.json({ success: true, sessions });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Communications Dashboard GET Error]', message);
        return emptySessionsResponse(message || 'chat store unavailable');
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { phone, action, messageText, status } = body;

        if (!phone) {
            return NextResponse.json({ success: false, error: 'Parametro "phone" mancante.' }, { status: 400 });
        }

        if (action === 'updateStatus') {
            if (!status || !['AI_ACTIVE', 'HUMAN_INTERVENTION', 'CLOSED'].includes(status)) {
                return NextResponse.json({ success: false, error: 'Stato non valido.' }, { status: 400 });
            }
            const session = await setSessionStatus(phone, status);
            return NextResponse.json({ success: true, session });
        }

        if (action === 'sendMessage') {
            if (!messageText || messageText.trim() === '') {
                return NextResponse.json({ success: false, error: 'Parametro "messageText" vuoto o mancante.' }, { status: 400 });
            }

            const sendResult = await sendWhatsAppTextMessage(phone, messageText.trim());
            if (!sendResult.ok) {
                return NextResponse.json(
                    {
                        success: false,
                        error: sendResult.error ?? 'Invio WhatsApp Meta fallito.',
                    },
                    { status: 502 }
                );
            }

            const session = await addMessage(phone, 'OUTBOUND', messageText.trim(), undefined, {
                source: 'operator',
                ...(sendResult.messageId ? { whatsAppMessageId: sendResult.messageId } : {}),
            });

            return NextResponse.json({ success: true, session });
        }

        return NextResponse.json({ success: false, error: 'Azione non riconosciuta.' }, { status: 400 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Communications Dashboard Action Error]', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

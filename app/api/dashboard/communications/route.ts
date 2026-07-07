import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { getChatStore, addMessage, setSessionStatus, getSession } from '@/lib/chatStore';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { getProactiveWhatsAppTemplate, listApprovedWhatsAppTemplates } from '@/lib/whatsapp/approvedTemplates';
import { requiresTemplateMessage } from '@/lib/whatsapp/messagingWindow';
import { startProactiveConversation } from '@/lib/whatsapp/proactiveMessaging';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';
import { toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';
import { triggerPostmanBackgroundSync } from '@/lib/postman/triggerBackgroundSync';

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
    after(() => {
        void triggerPostmanBackgroundSync();
    });

    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

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
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = await req.json();
        const {
            phone,
            action,
            messageText,
            status,
            displayName,
            userType,
            templateId,
            templateParams,
            recipientFirstName,
            orderCode,
            staffNotes,
            phoneRaw,
        } = body;

        if (action === 'getTemplates') {
            const template = getProactiveWhatsAppTemplate();
            return NextResponse.json({
                success: true,
                template: {
                    id: template.id,
                    metaName: template.metaName,
                    label: template.label,
                    description: template.description,
                    language: template.language,
                    parameterLabels: template.parameterLabels,
                    bodyTemplate: template.bodyTemplate,
                },
                templates: listApprovedWhatsAppTemplates().map((item) => ({
                    id: item.id,
                    metaName: item.metaName,
                    label: item.label,
                    description: item.description,
                    language: item.language,
                    parameterLabels: item.parameterLabels,
                    bodyTemplate: item.bodyTemplate,
                })),
            });
        }

        if (action === 'checkMessagingWindow') {
            const sessionPhone = toWhatsAppSessionPhone(phoneRaw || phone);
            if (!sessionPhone) {
                return NextResponse.json({ success: false, error: 'Numero non valido.' }, { status: 400 });
            }
            const session = await getSession(sessionPhone);
            return NextResponse.json({
                success: true,
                phone: sessionPhone,
                requiresTemplate: requiresTemplateMessage(session),
                session,
            });
        }

        if (action === 'startConversation') {
            const result = await startProactiveConversation({
                phoneRaw: phoneRaw || phone,
                displayName,
                userType,
                templateId,
                recipientFirstName: typeof recipientFirstName === 'string' ? recipientFirstName : undefined,
                orderCode: typeof orderCode === 'string' ? orderCode : undefined,
                staffNotes: typeof staffNotes === 'string' ? staffNotes : undefined,
                templateParams: Array.isArray(templateParams) ? templateParams.map(String) : undefined,
                messageText,
            });

            if (!result.ok) {
                return NextResponse.json(
                    {
                        success: false,
                        requiresTemplate: result.requiresTemplate ?? false,
                        templates: result.templates,
                        session: result.session,
                        error: result.error,
                        send: result.send,
                    },
                    { status: result.requiresTemplate ? 409 : 502 }
                );
            }

            return NextResponse.json({
                success: true,
                session: result.session,
                mode: result.mode,
                send: result.send,
            });
        }

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

            const session = await getSession(phone);
            if (requiresTemplateMessage(session)) {
                return NextResponse.json(
                    {
                        success: false,
                        requiresTemplate: true,
                        templates: listApprovedWhatsAppTemplates(),
                        error: 'Finestra 24h scaduta: usi "Nuova conversazione" con un template WhatsApp approvato.',
                    },
                    { status: 409 }
                );
            }

            const sendResult = await sendWhatsAppTextMessage(phone, messageText.trim());
            if (!sendResult.ok) {
                return NextResponse.json(
                    {
                        success: false,
                        error: sendResult.error ?? 'Invio WhatsApp Meta fallito.',
                        errorCode: sendResult.errorCode,
                    },
                    { status: 502 }
                );
            }

            const updatedSession = await addMessage(phone, 'OUTBOUND', messageText.trim(), undefined, {
                source: 'operator',
                outboundMode: 'freetext',
                ...(sendResult.messageId ? { whatsAppMessageId: sendResult.messageId } : {}),
            });

            return NextResponse.json({ success: true, session: updatedSession });
        }

        return NextResponse.json({ success: false, error: 'Azione non riconosciuta.' }, { status: 400 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Communications Dashboard Action Error]', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

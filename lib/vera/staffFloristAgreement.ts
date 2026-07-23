/**
 * Skip Punto A se staff e fiorista hanno già un accordo recente in chat (P1 Antonella).
 */
import prisma from '@/lib/prisma';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';

const AGREEMENT_HINT =
    /va bene|va benissimo|conferm|d'accordo|daccordo|ok per|previsto per|consegna|gioved[iì]|sabato|domenica|luned[iì]|marted[iì]|mercoled[iì]|venerd[iì]|luglio|agosto|settembre|ottobre|novembre|dicembre|\d{1,2}\s*\/\s*\d{1,2}/i;

/**
 * True se in chat fiorista c'è outbound operator recente che parla di consegna/accordo,
 * o inbound fiorista di conferma subito dopo un operator.
 */
export async function hasRecentStaffFloristAgreement(params: {
    partnerWhatsApp: string | null | undefined;
    orderNumber?: string | null;
    withinHours?: number;
}): Promise<boolean> {
    const e164 = normalizePhoneE164(params.partnerWhatsApp);
    if (!e164) return false;
    const phoneKey = e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`;
    const withinHours = params.withinHours ?? 48;
    const since = new Date(Date.now() - withinHours * 3600_000);

    const session = await prisma.whatsAppChatSession.findUnique({
        where: { phone: phoneKey },
        select: {
            messages: {
                where: { createdAt: { gte: since } },
                orderBy: { createdAt: 'asc' },
                select: {
                    direction: true,
                    body: true,
                    metadata: true,
                    createdAt: true,
                },
            },
        },
    });
    if (!session?.messages.length) return false;

    const orderHint = params.orderNumber?.trim();
    let lastOperatorAgreementAt: number | null = null;

    for (const m of session.messages) {
        const meta =
            m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
                ? (m.metadata as Record<string, unknown>)
                : {};
        const source = String(meta.source || '').toLowerCase();
        const body = m.body || '';
        const mentionsOrder = orderHint ? body.includes(orderHint) : true;

        if (m.direction === 'OUTBOUND' && source === 'operator' && mentionsOrder && AGREEMENT_HINT.test(body)) {
            lastOperatorAgreementAt = m.createdAt.getTime();
            continue;
        }

        if (
            lastOperatorAgreementAt != null &&
            m.direction === 'INBOUND' &&
            /^(ok|s[iì]|va bene|va benissimo|perfetto|d'accordo|👍|🙏)/i.test(body.trim())
        ) {
            return true;
        }

        if (m.direction === 'OUTBOUND' && source === 'operator' && mentionsOrder && AGREEMENT_HINT.test(body)) {
            // Anche solo proposta staff recente conta: evita re-sparare "nuova consegna".
            lastOperatorAgreementAt = m.createdAt.getTime();
        }
    }

    return lastOperatorAgreementAt != null;
}

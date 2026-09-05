/**
 * Ripara FF-MC-26-001 + unifica chat Oscar Delgadillo (+17134834061).
 * Eseguire: npx tsx scripts/repair-ff-mc-26-001-oscar-chat.ts
 */
import prisma from '../lib/prisma';
import { normalizePhoneE164 } from '../lib/whatsapp/metaCloudApiClient';
import { toWhatsAppSessionPhone } from '../lib/whatsapp/sessionPhone';
import { cleanupDeadAndDuplicateChatSessions } from '../lib/whatsapp/cleanupChatSessions';
import { sendWhatsAppTextMessage } from '../lib/whatsapp/metaCloudApiClient';

const ORDER_NUMBER = 'FF-MC-26-001';
const CANONICAL_E164 = '+17134834061';
const BAD_E164 = '+3917134834061';

async function mergeOscarSessions() {
    const canonicalKey = toWhatsAppSessionPhone(CANONICAL_E164)!;
    const badKey = `whatsapp:${BAD_E164}`;

    // Dopo fix normalize, badKey collassa su canonical — merge esplicito per sicurezza.
    const sessions = await prisma.whatsAppChatSession.findMany({
        where: {
            OR: [
                { phone: canonicalKey },
                { phone: badKey },
                { phone: { contains: '17134834061' } },
            ],
        },
        include: { messages: { select: { id: true } } },
    });

    console.log(
        '[repair] sessions found',
        sessions.map((s) => ({ id: s.id, phone: s.phone, msgs: s.messages.length })),
    );

    let keeper = sessions.find((s) => s.phone === canonicalKey);
    if (!keeper && sessions.length > 0) {
        keeper = sessions.sort((a, b) => b.messages.length - a.messages.length)[0]!;
        await prisma.whatsAppChatSession.update({
            where: { id: keeper.id },
            data: { phone: canonicalKey, name: keeper.name === 'ORD' ? 'Oscar' : keeper.name },
        });
        console.log('[repair] renamed keeper →', canonicalKey);
    }

    if (!keeper) {
        console.warn('[repair] nessuna sessione da unire');
        return;
    }

    for (const dup of sessions) {
        if (dup.id === keeper.id) continue;
        if (dup.messages.length > 0) {
            await prisma.whatsAppChatMessage.updateMany({
                where: { sessionId: dup.id },
                data: { sessionId: keeper.id },
            });
        }
        await prisma.whatsAppChatSession.delete({ where: { id: dup.id } });
        console.log('[repair] merged+deleted', dup.phone, '→', canonicalKey);
    }

    const last = await prisma.whatsAppChatMessage.findFirst({
        where: { sessionId: keeper.id },
        orderBy: { createdAt: 'desc' },
    });
    if (last) {
        await prisma.whatsAppChatSession.update({
            where: { id: keeper.id },
            data: {
                phone: canonicalKey,
                name: 'Oscar Delgadillo',
                lastMessage: last.body,
                updatedAt: new Date(),
            },
        });
    }
}

async function restoreOrderAwaitingAssignment() {
    const order = await prisma.order.findFirst({
        where: { orderNumber: ORDER_NUMBER, deletedAt: null },
        include: { partner: { select: { id: true, shopName: true, whatsappNumber: true, ownerName: true } } },
    });
    if (!order) {
        console.error('[repair] ordine non trovato');
        return;
    }

    const prevPartner = order.partner;
    console.log('[repair] order before', {
        status: order.status,
        partnerId: order.partnerId,
        partner: prevPartner?.shopName,
        phone: order.customerPhone,
    });

    const prevFlags =
        order.veraWorkflowFlags && typeof order.veraWorkflowFlags === 'object'
            ? { ...(order.veraWorkflowFlags as Record<string, unknown>) }
            : {};
    delete prevFlags.puntoA_florist;
    delete prevFlags.puntoA_florist_deferred;

    await prisma.order.update({
        where: { id: order.id },
        data: {
            partnerId: null,
            status: 'ACCEPTED',
            customerPhone: CANONICAL_E164,
            veraWorkflowFlags: {
                ...prevFlags,
                funeral_awaiting_assignment: true,
                repaired_ff_mc_26_001_at: new Date().toISOString(),
            },
        },
    });

    console.log('[repair] order → ACCEPTED, partnerId=null (attesa assegnazione)');

    // Revoca a Ciciliani/Carla se ancora assegnata e non ha confermato inbound sull'ordine
    if (prevPartner?.whatsappNumber) {
        const floristE164 = normalizePhoneE164(prevPartner.whatsappNumber);
        if (floristE164) {
            const inboundConfirm = await prisma.whatsAppChatMessage.findFirst({
                where: {
                    direction: 'INBOUND',
                    createdAt: { gte: new Date('2026-09-05T14:00:00Z') },
                    session: { phone: { contains: floristE164.replace(/^\+/, '') } },
                    body: { contains: 'FF-MC-26-001' },
                },
            });
            if (!inboundConfirm) {
                const revoke =
                    `Gentile ${prevPartner.ownerName?.split(/\s+/)[0] || 'Partner'}, ` +
                    `non tenere conto dell'incarico relativo all'ordine ${ORDER_NUMBER}: ` +
                    `l'assegnazione è stata ritirata in attesa di conferma staff. Grazie.`;
                const send = await sendWhatsAppTextMessage(floristE164, revoke);
                console.log('[repair] revoke florist', floristE164, send);
            } else {
                console.log('[repair] fiorista ha già risposto sull\'ordine: skip revoke WA');
            }
        }
    }
}

async function main() {
    console.log('[repair] normalize check', {
        us: normalizePhoneE164('17134834061'),
        bad: normalizePhoneE164('+3917134834061'),
        ok: normalizePhoneE164('+17134834061'),
    });

    await mergeOscarSessions();
    await restoreOrderAwaitingAssignment();

    const cleanup = await cleanupDeadAndDuplicateChatSessions({ dryRun: false });
    console.log('[repair] cleanup', {
        mergedGroups: cleanup.mergedGroups,
        messagesMoved: cleanup.messagesMoved,
        renames: cleanup.renames,
    });

    console.log('[repair] done');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

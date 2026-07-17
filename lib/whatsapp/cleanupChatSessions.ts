/**
 * Pulizia sessioni WhatsApp morte o duplicate.
 * - Duplicate: stesso E.164 dopo normalizePhoneE164 → merge messaggi nella sessione canonica, elimina le altre.
 * - Fantasmi prefisso: es. +3204910428 (mobile IT senza 39) → collassa su +393204910428.
 * - Morte: nessuna risposta INBOUND e nessuna utilità residua (vuote, o solo outbound senza ordine aperto).
 */
import prisma from '@/lib/prisma';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';

export interface CleanupChatSessionsResult {
    scanned: number;
    mergedGroups: number;
    messagesMoved: number;
    deletedDuplicates: number;
    deletedDead: number;
    deletedEmpty: number;
    renames: number;
    details: string[];
}

type SessionRow = {
    id: string;
    phone: string;
    name: string;
    userType: string;
    status: string;
    updatedAt: Date;
    messages: Array<{ id: string; direction: string; createdAt: Date }>;
};

function scoreSession(session: SessionRow): number {
    const inbound = session.messages.filter((m) => m.direction === 'INBOUND').length;
    const outbound = session.messages.filter((m) => m.direction === 'OUTBOUND').length;
    // Preferisci chat con risposte reali, poi volume, poi aggiornamento recente.
    return inbound * 1000 + outbound * 10 + Math.floor(session.updatedAt.getTime() / 1000);
}

async function phoneHasOpenOrder(e164: string): Promise<boolean> {
    const digits = e164.replace(/\D/g, '');
    const variants = Array.from(
        new Set([e164, digits, `+${digits}`, digits.slice(-10), `+39${digits.slice(-10)}`].filter(Boolean))
    );
    const order = await prisma.order.findFirst({
        where: {
            deletedAt: null,
            partnerPaymentStatus: 'PAID',
            status: { in: ['ACCEPTED', 'IN_PROGRESS', 'PENDING', 'DELIVERING'] },
            OR: [
                { customerPhone: { in: variants } },
                {
                    partner: {
                        deletedAt: null,
                        OR: variants.map((v) => ({ whatsappNumber: { contains: v.replace(/^\+/, '').slice(-9) } })),
                    },
                },
            ],
        },
        select: { id: true },
    });
    return Boolean(order);
}

/**
 * Esegue la pulizia in produzione/DB corrente.
 * dryRun=true: solo report, nessuna scrittura.
 */
export async function cleanupDeadAndDuplicateChatSessions(
    options: { dryRun?: boolean } = {}
): Promise<CleanupChatSessionsResult> {
    const dryRun = options.dryRun === true;
    const result: CleanupChatSessionsResult = {
        scanned: 0,
        mergedGroups: 0,
        messagesMoved: 0,
        deletedDuplicates: 0,
        deletedDead: 0,
        deletedEmpty: 0,
        renames: 0,
        details: [],
    };

    const sessions = (await prisma.whatsAppChatSession.findMany({
        include: {
            messages: { select: { id: true, direction: true, createdAt: true } },
        },
        orderBy: { updatedAt: 'desc' },
    })) as SessionRow[];

    result.scanned = sessions.length;

    const byCanonical = new Map<string, SessionRow[]>();
    const invalid: SessionRow[] = [];

    for (const session of sessions) {
        const e164 = normalizePhoneE164(session.phone);
        if (!e164) {
            invalid.push(session);
            continue;
        }
        const list = byCanonical.get(e164) ?? [];
        list.push(session);
        byCanonical.set(e164, list);
    }

    // 1) Sessioni con telefono non normalizzabile → elimina se vuote/senza inbound.
    for (const session of invalid) {
        const inbound = session.messages.some((m) => m.direction === 'INBOUND');
        if (inbound) {
            result.details.push(`SKIP invalid-but-active ${session.phone}`);
            continue;
        }
        result.details.push(`DELETE invalid ${session.phone} (${session.messages.length} msg)`);
        if (!dryRun) {
            await prisma.whatsAppChatSession.delete({ where: { id: session.id } });
        }
        if (session.messages.length === 0) result.deletedEmpty += 1;
        else result.deletedDead += 1;
    }

    // 2) Gruppi canonici: merge duplicate + rename fantasma + delete morte.
    for (const [e164, group] of byCanonical) {
        const canonicalPhone = toWhatsAppSessionPhone(e164)!;
        const sorted = [...group].sort((a, b) => {
            const aCanon = a.phone === canonicalPhone ? 1 : 0;
            const bCanon = b.phone === canonicalPhone ? 1 : 0;
            if (aCanon !== bCanon) return bCanon - aCanon;
            return scoreSession(b) - scoreSession(a);
        });
        const keeper = sorted[0]!;
        const others = sorted.slice(1);

        // Rinomina keeper se la chiave non è canonica (es. whatsapp:+3204910428).
        if (keeper.phone !== canonicalPhone) {
            result.details.push(`RENAME ${keeper.phone} → ${canonicalPhone}`);
            if (!dryRun) {
                await prisma.whatsAppChatSession.update({
                    where: { id: keeper.id },
                    data: { phone: canonicalPhone },
                });
            }
            result.renames += 1;
        }

        if (others.length > 0) {
            result.mergedGroups += 1;
            for (const dup of others) {
                const moveCount = dup.messages.length;
                result.details.push(
                    `MERGE ${dup.phone} → ${canonicalPhone} (move ${moveCount} msg, delete dup)`
                );
                if (!dryRun) {
                    if (moveCount > 0) {
                        await prisma.whatsAppChatMessage.updateMany({
                            where: { sessionId: dup.id },
                            data: { sessionId: keeper.id },
                        });
                    }
                    await prisma.whatsAppChatSession.delete({ where: { id: dup.id } });
                }
                result.messagesMoved += moveCount;
                result.deletedDuplicates += 1;
            }

            if (!dryRun && others.some((o) => o.messages.length > 0)) {
                const last = await prisma.whatsAppChatMessage.findFirst({
                    where: { sessionId: keeper.id },
                    orderBy: { createdAt: 'desc' },
                });
                if (last) {
                    await prisma.whatsAppChatSession.update({
                        where: { id: keeper.id },
                        data: {
                            lastMessage: last.body,
                            hasPhoto: Boolean(last.mediaUrl),
                            updatedAt: new Date(),
                        },
                    });
                }
            }
        }

        // 3) Morte: zero inbound sul gruppo canonico, non collegata a ordine aperto.
        const inboundCount = group.reduce(
            (n, s) => n + s.messages.filter((m) => m.direction === 'INBOUND').length,
            0
        );
        const totalMsgs = group.reduce((n, s) => n + s.messages.length, 0);
        if (inboundCount === 0) {
            const hasOpen = await phoneHasOpenOrder(e164);
            const isEmpty = totalMsgs === 0;
            const ageDays =
                (Date.now() - Math.max(...group.map((s) => s.updatedAt.getTime()))) /
                (24 * 60 * 60 * 1000);

            // Conserva outbound-only recenti o legati a ordini aperti (in attesa di risposta keep-alive).
            if (hasOpen && !isEmpty) {
                result.details.push(`KEEP outbound-waiting ${canonicalPhone} (ordine aperto)`);
                continue;
            }
            if (!isEmpty && ageDays < 2) {
                result.details.push(`KEEP outbound-recent ${canonicalPhone} (${ageDays.toFixed(1)}g)`);
                continue;
            }

            result.details.push(
                `DELETE dead ${keeper.phone} → ${canonicalPhone} (inbound=0, msgs=${totalMsgs}, age=${ageDays.toFixed(1)}g)`
            );
            if (!dryRun) {
                // Se le duplicate erano già cancellate, elimina solo il keeper.
                await prisma.whatsAppChatSession.delete({ where: { id: keeper.id } }).catch(() => undefined);
            }
            if (isEmpty) result.deletedEmpty += 1;
            else result.deletedDead += 1;
        }
    }

    return result;
}

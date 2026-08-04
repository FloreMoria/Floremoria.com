/**
 * Promemoria ricorrenze defunto a -3 giorni (nascita / morte).
 * Perché: presenza delicata senza pressione; solo su anagrafiche con date e utente raggiungibile.
 * ATTESA/PENDING: nessuna automazione (allineato a blockPendingAutomation).
 */
import prisma from '@/lib/prisma';
import { isOrderStatusBlockingVeraAutomation } from '@/lib/vera/orderWorkflow/blockPendingAutomation';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import { addMessage } from '@/lib/chatStore';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import { extractFirstName } from '@/lib/whatsapp/approvedTemplates';
import { loadWhatsAppCoreKb } from '@/lib/whatsappKnowledge';

export const ANNIVERSARY_REMINDER_EVENT = 'DECEASED_ANNIVERSARY_REMINDER';
export const ANNIVERSARY_LEAD_DAYS = 3;

export type AnniversaryKind = 'birth' | 'death';

export type AnniversaryReminderResult = {
    ok: boolean;
    targetDate: string;
    scannedProfiles: number;
    candidates: number;
    sent: number;
    skipped: number;
    errors: number;
    details: Array<{
        deceasedProfileId: string;
        userId: string;
        kind: AnniversaryKind;
        status: 'sent' | 'skipped' | 'error';
        reason?: string;
    }>;
};

type RomeYmd = { year: number; month: number; day: number; iso: string };

function getRomeYmd(base: Date = new Date()): RomeYmd {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(base);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, iso };
}

/** Somma giorni sul calendario Europe/Rome (mezzogiorno locale → UTC). */
export function addCalendarDaysRome(from: Date, days: number): RomeYmd {
    const start = getRomeYmd(from);
    // Costruisce un istante a mezzogiorno Rome e aggiunge giorni in ms (safe su DST per date-only).
    const noonUtc = Date.UTC(start.year, start.month - 1, start.day, 12, 0, 0);
    return getRomeYmd(new Date(noonUtc + days * 24 * 60 * 60 * 1000));
}

function matchesMonthDay(date: Date | null | undefined, month: number, day: number): boolean {
    if (!date) return false;
    return date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function catalogProposalsUrl(): string {
    const kb = loadWhatsAppCoreKb();
    const fromKb = kb.catalogTombsUrl?.trim();
    if (fromKb) return fromKb;
    const base =
        process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '') ||
        'https://www.floremoria.com';
    return `${base}/fiori-sulle-tombe`;
}

function buildAnniversaryMessage(input: {
    userName: string | null | undefined;
    deceasedName: string;
    kind: AnniversaryKind;
}): string {
    const first = extractFirstName(input.userName || '');
    const greeting = first ? `Gentile ${first}` : 'Gentile';
    const deceased = input.deceasedName.trim() || 'il Suo caro';
    const catalogUrl = catalogProposalsUrl();

    if (input.kind === 'birth') {
        return (
            `${greeting},\n\n` +
            `tra qualche giorno ricorre l'anniversario della nascita di ${deceased}. ` +
            `Se desidera dedicargli un pensiero floreale o una composizione per la tomba, ` +
            `siamo a Sua completa disposizione — con la stessa cura di sempre, senza alcuna fretta.\n\n` +
            `Può consultare le proposte (bouquet e accessori) qui:\n${catalogUrl}\n\n` +
            `Con rispetto,\nLo Staff di FloreMoria`
        );
    }

    return (
        `${greeting},\n\n` +
        `tra qualche giorno ricorre l'anniversario della scomparsa di ${deceased}. ` +
        `Se desidera dedicargli un pensiero floreale o una composizione per la tomba, ` +
        `siamo a Sua completa disposizione — con discrezione e rispetto, senza impegno.\n\n` +
        `Può consultare le proposte (bouquet e accessori) qui:\n${catalogUrl}\n\n` +
        `Con rispetto,\nLo Staff di FloreMoria`
    );
}

async function wasAnniversaryReminderSent(input: {
    deceasedProfileId: string;
    userId: string;
    kind: AnniversaryKind;
    year: number;
}): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM whatsapp_chat_messages
        WHERE direction = 'OUTBOUND'
          AND metadata IS NOT NULL
          AND metadata->>'eventType' = ${ANNIVERSARY_REMINDER_EVENT}
          AND metadata->>'deceasedProfileId' = ${input.deceasedProfileId}
          AND metadata->>'userId' = ${input.userId}
          AND metadata->>'anniversaryKind' = ${input.kind}
          AND metadata->>'anniversaryYear' = ${String(input.year)}
        LIMIT 1
    `;
    return rows.length > 0;
}

/**
 * Scansione giornaliera: ricorrenze nascita/morte esattamente tra 3 giorni (Europe/Rome).
 */
export async function runDeceasedAnniversaryReminders(
    options?: { now?: Date; leadDays?: number }
): Promise<AnniversaryReminderResult> {
    const leadDays = options?.leadDays ?? ANNIVERSARY_LEAD_DAYS;
    const now = options?.now ?? new Date();
    const target = addCalendarDaysRome(now, leadDays);
    const details: AnniversaryReminderResult['details'] = [];

    const profiles = await prisma.deceasedProfile.findMany({
        where: {
            userLinks: { some: {} },
        },
        select: {
            id: true,
            fullName: true,
            birthDate: true,
            deathDate: true,
            userLinks: {
                select: {
                    userId: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            deletedAt: true,
                            isTest: true,
                        },
                    },
                },
            },
            orders: {
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: {
                    id: true,
                    status: true,
                    deceasedBirthDate: true,
                    deceasedDeathDate: true,
                    orderNumber: true,
                },
            },
        },
    });

    let candidates = 0;
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const profile of profiles) {
        const birthDate =
            profile.birthDate ??
            profile.orders.find((o) => o.deceasedBirthDate)?.deceasedBirthDate ??
            null;
        const deathDate =
            profile.deathDate ??
            profile.orders.find((o) => o.deceasedDeathDate)?.deceasedDeathDate ??
            null;

        const kinds: AnniversaryKind[] = [];
        if (matchesMonthDay(birthDate, target.month, target.day)) kinds.push('birth');
        if (matchesMonthDay(deathDate, target.month, target.day)) kinds.push('death');
        if (kinds.length === 0) continue;

        // Se c'è un ordine in ATTESA/PENDING collegato al defunto → silenzio (solo intervento umano).
        const hasBlockedOrder = profile.orders.some((o) =>
            isOrderStatusBlockingVeraAutomation(o.status)
        );
        if (hasBlockedOrder) {
            for (const kind of kinds) {
                for (const link of profile.userLinks) {
                    skipped++;
                    details.push({
                        deceasedProfileId: profile.id,
                        userId: link.userId,
                        kind,
                        status: 'skipped',
                        reason: 'order_status_pending_attesa',
                    });
                }
            }
            continue;
        }

        for (const kind of kinds) {
            for (const link of profile.userLinks) {
                candidates++;
                const user = link.user;
                if (!user || user.deletedAt) {
                    skipped++;
                    details.push({
                        deceasedProfileId: profile.id,
                        userId: link.userId,
                        kind,
                        status: 'skipped',
                        reason: 'user_missing',
                    });
                    continue;
                }
                if (user.isTest) {
                    skipped++;
                    details.push({
                        deceasedProfileId: profile.id,
                        userId: user.id,
                        kind,
                        status: 'skipped',
                        reason: 'test_user',
                    });
                    continue;
                }

                const phoneE164 = normalizePhoneE164(user.phone);
                if (!phoneE164) {
                    skipped++;
                    details.push({
                        deceasedProfileId: profile.id,
                        userId: user.id,
                        kind,
                        status: 'skipped',
                        reason: 'missing_phone',
                    });
                    continue;
                }

                const already = await wasAnniversaryReminderSent({
                    deceasedProfileId: profile.id,
                    userId: user.id,
                    kind,
                    year: target.year,
                });
                if (already) {
                    skipped++;
                    details.push({
                        deceasedProfileId: profile.id,
                        userId: user.id,
                        kind,
                        status: 'skipped',
                        reason: 'already_sent_this_year',
                    });
                    continue;
                }

                const message = buildAnniversaryMessage({
                    userName: user.name,
                    deceasedName: profile.fullName,
                    kind,
                });

                const sessionPhone = `whatsapp:${phoneE164}`;
                const latestOrderCode = profile.orders.find((o) => o.orderNumber)?.orderNumber;

                try {
                    const send = await sendWhatsAppMessage(phoneE164, message, {
                        recipientName: user.name || undefined,
                        orderCode: latestOrderCode || 'FLOREMORIA',
                        headerTitle: 'Ricordo FloreMoria',
                        sessionPhone,
                        source: 'deceased_anniversary_reminder',
                        userType: 'UTENTE',
                        forceTemplate: false,
                    });

                    if (!send.ok) {
                        errors++;
                        details.push({
                            deceasedProfileId: profile.id,
                            userId: user.id,
                            kind,
                            status: 'error',
                            reason: send.error || 'send_failed',
                        });
                        continue;
                    }

                    const anniversaryMeta = {
                        eventType: ANNIVERSARY_REMINDER_EVENT,
                        anniversaryKind: kind,
                        anniversaryYear: String(target.year),
                        anniversaryTargetDate: target.iso,
                        deceasedProfileId: profile.id,
                        userId: user.id,
                        source: 'deceased_anniversary_reminder',
                        ...buildOutboundWamidMetadata(send.messageId),
                    };

                    if (!send.fallbackExecuted) {
                        await addMessage(sessionPhone, 'OUTBOUND', message, undefined, anniversaryMeta);
                    } else {
                        // Il fallback template ha già loggato il testo: annotiamo i marker dedup sull'ultimo OUTBOUND.
                        const session = await prisma.whatsAppChatSession.findUnique({
                            where: { phone: sessionPhone },
                            select: { id: true },
                        });
                        if (session) {
                            const last = await prisma.whatsAppChatMessage.findFirst({
                                where: { sessionId: session.id, direction: 'OUTBOUND' },
                                orderBy: { createdAt: 'desc' },
                            });
                            if (last) {
                                const prev =
                                    last.metadata && typeof last.metadata === 'object'
                                        ? (last.metadata as Record<string, unknown>)
                                        : {};
                                await prisma.whatsAppChatMessage.update({
                                    where: { id: last.id },
                                    data: {
                                        metadata: {
                                            ...prev,
                                            ...anniversaryMeta,
                                        },
                                    },
                                });
                            }
                        }
                    }

                    sent++;
                    details.push({
                        deceasedProfileId: profile.id,
                        userId: user.id,
                        kind,
                        status: 'sent',
                    });
                } catch (err) {
                    errors++;
                    const reason = err instanceof Error ? err.message : String(err);
                    console.error('[anniversary-reminder] send error', {
                        deceasedProfileId: profile.id,
                        userId: user.id,
                        kind,
                        reason,
                    });
                    details.push({
                        deceasedProfileId: profile.id,
                        userId: user.id,
                        kind,
                        status: 'error',
                        reason,
                    });
                }
            }
        }
    }

    console.info('[anniversary-reminder] batch', {
        targetDate: target.iso,
        scannedProfiles: profiles.length,
        candidates,
        sent,
        skipped,
        errors,
    });

    return {
        ok: errors === 0,
        targetDate: target.iso,
        scannedProfiles: profiles.length,
        candidates,
        sent,
        skipped,
        errors,
        details,
    };
}

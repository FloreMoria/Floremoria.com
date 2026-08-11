/**
 * Promemoria ricorrenze defunto a -4 giorni (nascita / morte).
 * Invio tassativo via template Meta `promemoria_anniversario_gdm` (fuori finestra 24h).
 * ATTESA/PENDING: nessuna automazione (allineato a blockPendingAutomation).
 */
import prisma from '@/lib/prisma';
import { isOrderStatusBlockingVeraAutomation } from '@/lib/vera/orderWorkflow/blockPendingAutomation';
import { addMessage } from '@/lib/chatStore';
import {
    normalizePhoneE164,
    sendWhatsAppTemplateMessage,
    type WhatsAppTemplateComponent,
} from '@/lib/whatsapp/metaCloudApiClient';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';
import { sanitizeMetaTemplateParam, ANNIVERSARY_GDM_BODY_PARAM_COUNT, ANNIVERSARY_GDM_HEADER_PARAM_COUNT } from '@/lib/whatsapp/approvedTemplates';
import { getVeraTemplate } from '@/lib/whatsapp/veraTemplateRegistry';
import { buildAnniversaryGdmReminderParams } from '@/lib/whatsapp/veraTemplateParams';
import { resolveAnniversaryGdmTemplateParams } from '@/lib/whatsapp/proactiveTemplateParams';
import { isWhatsAppAutoNotifyDisabled } from '@/lib/whatsapp/outboundGuards';
import { loadWhatsAppCoreKb } from '@/lib/whatsappKnowledge';
import { renderVeraTemplateBodyPreview } from '@/lib/whatsapp/logVeraTemplateOutbound';

export const ANNIVERSARY_REMINDER_EVENT = 'DECEASED_ANNIVERSARY_REMINDER';
/** Giorni di anticipo rispetto alla ricorrenza (Europe/Rome). */
export const ANNIVERSARY_LEAD_DAYS = 4;

export type AnniversaryKind = 'birth' | 'death';

export type AnniversaryReminderResult = {
    ok: boolean;
    /** Motivo di uscita anticipata del batch (es. kill-switch automatici). */
    skipReason?: string;
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
 * Scansione giornaliera: ricorrenze nascita/morte esattamente tra 4 giorni (Europe/Rome).
 */
export async function runDeceasedAnniversaryReminders(
    options?: { now?: Date; leadDays?: number }
): Promise<AnniversaryReminderResult> {
    const empty = (extra?: Partial<AnniversaryReminderResult>): AnniversaryReminderResult => ({
        ok: true,
        targetDate: '',
        scannedProfiles: 0,
        candidates: 0,
        sent: 0,
        skipped: 0,
        errors: 0,
        details: [],
        ...extra,
    });

    if (isWhatsAppAutoNotifyDisabled()) {
        return empty({ ok: true, skipReason: 'auto_notify_disabled', targetDate: getRomeYmd().iso });
    }

    const leadDays = options?.leadDays ?? ANNIVERSARY_LEAD_DAYS;
    const now = options?.now ?? new Date();
    const target = addCalendarDaysRome(now, leadDays);
    const details: AnniversaryReminderResult['details'] = [];
    const templateSpec = getVeraTemplate('anniversary_gdm_reminder');

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

        // Ordini in ATTESA/PENDING → silenzio (solo intervento umano).
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

                const resolved = resolveAnniversaryGdmTemplateParams({
                    userName: user.name,
                    deceasedFullName: profile.fullName,
                    catalogUrl: catalogProposalsUrl(),
                });
                const { bodyParams, headerTextParams } = buildAnniversaryGdmReminderParams({
                    userFirstName: resolved.userFirstName,
                    deceasedName: resolved.deceasedFullName,
                    catalogUrl: resolved.catalogUrl,
                });

                // Meta live: HEADER {{1}} defunto + BODY {{1}}/{{2}}/{{3}}.
                const components: WhatsAppTemplateComponent[] = [
                    {
                        type: 'header',
                        parameters: [
                            {
                                type: 'text' as const,
                                text: sanitizeMetaTemplateParam(
                                    headerTextParams[0] || resolved.deceasedFullName || '-'
                                ),
                            },
                        ],
                    },
                    {
                        type: 'body',
                        parameters: bodyParams.map((text) => ({
                            type: 'text' as const,
                            text: sanitizeMetaTemplateParam(text) || '-',
                        })),
                    },
                ];

                const sessionPhone = `whatsapp:${phoneE164}`;

                try {
                    const send = await sendWhatsAppTemplateMessage(
                        phoneE164,
                        templateSpec.metaName,
                        templateSpec.language,
                        components,
                        {
                            expectedBodyParamCount: ANNIVERSARY_GDM_BODY_PARAM_COUNT,
                            expectedHeaderTextParamCount: ANNIVERSARY_GDM_HEADER_PARAM_COUNT,
                        }
                    );

                    if (!send.ok) {
                        errors++;
                        details.push({
                            deceasedProfileId: profile.id,
                            userId: user.id,
                            kind,
                            status: 'error',
                            reason: send.error || 'template_send_failed',
                        });
                        continue;
                    }

                    const preview = [
                        headerTextParams[0] || '',
                        renderVeraTemplateBodyPreview('anniversary_gdm_reminder', bodyParams),
                    ]
                        .filter(Boolean)
                        .join('\n\n');
                    const anniversaryMeta = {
                        eventType: ANNIVERSARY_REMINDER_EVENT,
                        anniversaryKind: kind,
                        anniversaryYear: String(target.year),
                        anniversaryTargetDate: target.iso,
                        deceasedProfileId: profile.id,
                        userId: user.id,
                        source: 'deceased_anniversary_reminder',
                        outboundMode: 'template',
                        templateId: 'anniversary_gdm_reminder',
                        templateName: templateSpec.metaName,
                        ...buildOutboundWamidMetadata(send.messageId),
                    };

                    await addMessage(sessionPhone, 'OUTBOUND', preview, undefined, anniversaryMeta);

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
        leadDays,
        template: templateSpec.metaName,
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

import prisma from '@/lib/prisma';
import {
    computeCustomerConfirmSendAt,
    isCustomerConfirmSendDue,
} from '@/lib/datetime/customerConfirmSchedule';
import { resolveCustomerConfirmSubjectName } from '@/lib/orders/customerConfirmCategoryCopy';
import { parseOrderCategoryFromNumber } from '@/lib/orders/parseOrderCategory';
import { generateWarmOrderThought } from '@/lib/vera/generateWarmOrderThought';
import { resolveSafeBuyerFirstName } from '@/lib/vera/customerOrderConfirmCopy';
import {
    isWorkflowStepDone,
    markWorkflowStep,
    parseWorkflowFlags,
    type VeraWorkflowFlags,
} from '@/lib/vera/orderWorkflow/types';
import { wasOrderTemplateSent } from '@/lib/vera/orderWorkflow/orderOutboundDedup';
import {
    releaseWorkflowStep,
    tryClaimWorkflowStep,
} from '@/lib/vera/orderWorkflow/claimWorkflowStep';
import { enqueuePuntoBWake } from '@/lib/vera/orderWorkflow/schedulePuntoBWake';
import { buildCustomerOrderConfirmParams } from '@/lib/whatsapp/veraTemplateParams';
import { sendVeraTemplate } from '@/lib/whatsapp/sendVeraTemplate';
import { logVeraTemplateOutbound } from '@/lib/whatsapp/logVeraTemplateOutbound';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import {
    isWhatsAppAutoNotifyDisabledForOrder,
    shouldSkipTestOrderMetaSend,
} from '@/lib/whatsapp/outboundGuards';
import { veraAutomationBlockedSkipReason } from '@/lib/vera/orderWorkflow/blockPendingAutomation';

export interface PuntoBResult {
    ok: boolean;
    skipped?: string;
    error?: string;
    deferred?: boolean;
    scheduledFor?: string;
}

export interface PuntoBOptions {
    /** Solo reinvio manuale staff esplicito. Mai usare da onOrderStatusChanged. */
    force?: boolean;
    /** Ignora scheduling (es. flush cron quando l'orario è già dovuto). */
    bypassSchedule?: boolean;
    /**
     * Messaggio/domanda personalizzata per {{3}}.
     * Se `undefined` (auto workflow): genera warm thought Vera.
     * Se stringa (anche vuota, da UI staff): usa quel testo; vuoto → spazio Meta.
     */
    staffMessage?: string;
}

async function markPuntoBScheduled(
    orderId: string,
    flags: VeraWorkflowFlags,
    scheduledFor: Date
): Promise<void> {
    await prisma.order.update({
        where: { id: orderId },
        data: {
            veraWorkflowFlags: {
                ...flags,
                puntoB_customer_scheduled: scheduledFor.toISOString(),
            },
        },
    });
}

/**
 * PUNTO B — Conferma ordine utente (floremoria_conferma_ordine_utente).
 * Stato IN_PROGRESS, oppure post-pagamento schedulato (customerNotifyPaidAt).
 * Post-pagamento: +60s da paidAt; legacy dashboard: +30 min / 08:30.
 */
export async function runPuntoBCustomerOrderConfirm(
    orderId: string,
    options: PuntoBOptions = {}
): Promise<PuntoBResult> {
    const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: { user: { select: { name: true } } },
    });

    if (!order) return { ok: false, skipped: 'order_not_found' };

    const pendingBlock = veraAutomationBlockedSkipReason(order.status);
    if (pendingBlock) {
        console.info(
            `[vera-workflow] Punto B BLOCCATO (stato ATTESA/PENDING, solo manuale) ordine ${order.orderNumber || order.id}`
        );
        return { ok: true, skipped: pendingBlock };
    }

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    const postPaymentScheduled = Boolean(flags.customerNotifyPaidAt);

    if (order.status !== 'IN_PROGRESS' && !options.force && !postPaymentScheduled) {
        console.info(
            `[vera-workflow] Punto B in attesa: stato=${order.status} (serve IN_PROGRESS o post-pagamento) ordine ${order.orderNumber || order.id}`
        );
        return { ok: true, skipped: 'not_in_progress' };
    }

    if (isWhatsAppAutoNotifyDisabledForOrder(order.isTest)) {
        console.warn(`[vera-workflow] Punto B saltato (AUTO_NOTIFY disabled) ordine ${order.orderNumber || order.id}`);
        return { ok: true, skipped: 'auto_notify_disabled' };
    }
    if (shouldSkipTestOrderMetaSend(order.isTest) && !options.force) {
        console.warn(`[vera-workflow] Punto B saltato (ordine test, Meta bloccato) ordine ${order.orderNumber || order.id}`);
        const { setVeraOperationalAlert } = await import('@/lib/vera/operationalAlerts');
        await setVeraOperationalAlert({
            orderId: order.id,
            type: 'workflow_blocked',
            message:
                'Punto B non inviato: ordine isTest ma WHATSAPP_ALLOW_TEST_SENDS≠1 sul runtime Vercel. Aggiungere la env, RIDISTRIBUIRE il deploy, poi ritentare il workflow.',
            priority: 'urgent',
            freezeOrder: false,
        }).catch(() => undefined);
        return { ok: false, skipped: 'test_order_meta_blocked' };
    }

    if (!options.force) {
        if (order.confirmationMessageSent || isWorkflowStepDone(flags, 'puntoB_customer')) {
            return { ok: true, skipped: 'already_sent' };
        }

        if (await wasOrderTemplateSent(order.id, 'customer_order_confirm', order.orderNumber)) {
            await tryClaimWorkflowStep(order.id, 'puntoB_customer');
            await prisma.order.update({
                where: { id: order.id },
                data: { confirmationMessageSent: true },
            }).catch(() => null);
            console.info(
                `[vera-workflow] Punto B BLOCCATO duplicato chat ordine ${order.orderNumber || order.id}`
            );
            return { ok: true, skipped: 'duplicate_order_template' };
        }
    }

    // Scheduling Produzione (sandbox bypassa).
    if (!options.force && !options.bypassSchedule) {
        const paidAtRaw = flags.customerNotifyPaidAt;
        const scheduledRaw = flags.puntoB_customer_scheduled;
        const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;
        const sendAt = scheduledRaw
            ? new Date(scheduledRaw)
            : computeCustomerConfirmSendAt({
                  paidAt,
                  createdAt: order.createdAt,
                  isTest: order.isTest,
              });
        if (!isCustomerConfirmSendDue(sendAt)) {
            await markPuntoBScheduled(order.id, flags, sendAt).catch((err) => {
                console.error('[vera-workflow] Impossibile marcare Punto B schedulato:', err);
            });
            console.info('[customer-notify] Punto B schedulato', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                sendAt: sendAt.toISOString(),
                paidAt: paidAt?.toISOString(),
                postPayment: Boolean(paidAt),
            });
            enqueuePuntoBWake({ orderId: order.id, sendAt });
            return {
                ok: true,
                deferred: true,
                skipped: 'scheduled_for_later',
                scheduledFor: sendAt.toISOString(),
            };
        }
    }

    if (!options.force) {
        const claimed = await tryClaimWorkflowStep(order.id, 'puntoB_customer');
        if (!claimed) {
            console.info(
                `[vera-workflow] Punto B BLOCCATO claim (già preso) ordine ${order.orderNumber || order.id}`
            );
            return { ok: true, skipped: 'already_sent' };
        }
    }

    const phoneE164 = normalizePhoneE164(order.customerPhone);
    if (!phoneE164) {
        if (!options.force) await releaseWorkflowStep(order.id, 'puntoB_customer');
        console.warn('[vera-workflow] Punto B saltato: telefono non valido', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
        });
        return { ok: false, skipped: 'invalid_phone' };
    }

    const buyerName = resolveSafeBuyerFirstName(order.user?.name || order.buyerFullName);

    const orderCategory = parseOrderCategoryFromNumber(order.orderNumber);
    const subjectName = resolveCustomerConfirmSubjectName(orderCategory, order.deceasedName);

    // {{3}}: messaggio staff esplicito (UI) oppure warm thought auto; mai follow-up free-text separato.
    let slot3Message: string;
    if (options.staffMessage !== undefined) {
        slot3Message = options.staffMessage;
    } else {
        slot3Message = await generateWarmOrderThought({
            buyerName,
            deceasedName: subjectName,
            orderCategory,
            orderNumber: order.orderNumber,
        });
    }

    const bodyParams = buildCustomerOrderConfirmParams({
        buyerFirstName: buyerName,
        deceasedName: subjectName,
        staffMessage: slot3Message,
    });

    const send = await sendVeraTemplate(phoneE164, 'customer_order_confirm', bodyParams, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        // Reinvio staff esplicito: bypass dedup 24h.
        skipOrderDedup: Boolean(options.force),
    });

    if (!send.ok) {
        if (!options.force) await releaseWorkflowStep(order.id, 'puntoB_customer');
        return { ok: false, error: send.error };
    }

    try {
        await logVeraTemplateOutbound({
            phoneE164,
            templateId: 'customer_order_confirm',
            bodyParams,
            eventType: 'ORDER_CONFIRM_TEMPLATE',
            orderId: order.id,
            orderNumber: order.orderNumber,
            messageId: send.messageId,
            contactName: buyerName || order.buyerFullName || undefined,
            userType: 'UTENTE',
        });
    } catch (logErr) {
        console.error('[vera-workflow] Punto B inviato ma sessione dashboard non registrata:', logErr);
    }

    // Assicura flag puntoB_customer e confirmationMessageSent anche con force (che salta tryClaim).
    const freshFlags = await prisma.order.findUnique({
        where: { id: order.id },
        select: { veraWorkflowFlags: true },
    });
    await prisma.order.update({
        where: { id: order.id },
        data: {
            confirmationMessageSent: true,
            veraWorkflowFlags: markWorkflowStep(
                parseWorkflowFlags(freshFlags?.veraWorkflowFlags),
                'puntoB_customer'
            ),
        },
    });

    console.info(`[vera-workflow] Punto B OK ordine ${order.orderNumber || order.id}`);
    return { ok: true };
}

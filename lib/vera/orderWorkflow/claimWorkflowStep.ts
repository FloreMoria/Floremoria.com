import prisma from '@/lib/prisma';
import type { VeraWorkflowStep } from '@/lib/vera/orderWorkflow/types';

/**
 * Claim atomico di uno step VERA sull'ordine.
 * Perché: toggle rapidi / invocazioni parallele leggevano flags vuoti e reinviavano WhatsApp.
 * Solo il primo UPDATE vince; gli altri skipano senza inviare.
 */
export async function tryClaimWorkflowStep(
    orderId: string,
    step: VeraWorkflowStep
): Promise<boolean> {
    const iso = new Date().toISOString();
    const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "Order"
        SET "vera_workflow_flags" = COALESCE("vera_workflow_flags", '{}'::jsonb)
            || jsonb_build_object(${step}::text, to_jsonb(${iso}::text))
        WHERE id = ${orderId}
          AND "deletedAt" IS NULL
          AND (
            "vera_workflow_flags" IS NULL
            OR NOT (COALESCE("vera_workflow_flags", '{}'::jsonb) ? ${step})
          )
        RETURNING id
    `;
    return claimed.length > 0;
}

/** Rilascia il claim se l'invio WhatsApp fallisce (permette retry). */
export async function releaseWorkflowStep(
    orderId: string,
    step: VeraWorkflowStep
): Promise<void> {
    await prisma.$executeRaw`
        UPDATE "Order"
        SET "vera_workflow_flags" = COALESCE("vera_workflow_flags", '{}'::jsonb) - ${step}::text
        WHERE id = ${orderId}
    `;
}

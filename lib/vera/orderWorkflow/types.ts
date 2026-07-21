export type VeraWorkflowStep =
    | 'puntoA_florist'
    | 'puntoA_florist_deferred'
    | 'puntoB_customer'
    | 'puntoB_customer_scheduled'
    | 'puntoEF_delivery'
    | 'puntoG_customer_wait'
    | 'puntoG_florist_reminder'
    | 'puntoH_review'
    | 'exception_tomb'
    | 'exception_cemetery'
    | 'exception_modification';

export type VeraWorkflowFlags = Partial<Record<VeraWorkflowStep, string>>;

export function parseWorkflowFlags(raw: unknown): VeraWorkflowFlags {
    if (!raw || typeof raw !== 'object') return {};
    return raw as VeraWorkflowFlags;
}

export function isWorkflowStepDone(flags: VeraWorkflowFlags, step: VeraWorkflowStep): boolean {
    return Boolean(flags[step]);
}

export function markWorkflowStep(flags: VeraWorkflowFlags, step: VeraWorkflowStep): VeraWorkflowFlags {
    return { ...flags, [step]: new Date().toISOString() };
}

export const VERA_REMINDER_HOURS = 20;

export const TEMPLATE_CASCADE_DELAY_MS = 1000;

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

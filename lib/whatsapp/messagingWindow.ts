import type { ChatSession } from '@/lib/chatStore';

export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function getLastInboundAt(session: ChatSession | null | undefined): Date | null {
    if (!session?.messages?.length) return null;

    let latest: number | null = null;
    for (const message of session.messages) {
        if (message.direction !== 'INBOUND') continue;
        const createdAt = message.createdAt ? new Date(message.createdAt).getTime() : NaN;
        if (!Number.isNaN(createdAt) && (latest === null || createdAt > latest)) {
            latest = createdAt;
        }
    }
    return latest === null ? null : new Date(latest);
}

export function isWithinCustomerServiceWindow(session: ChatSession | null | undefined): boolean {
    const lastInbound = getLastInboundAt(session);
    if (!lastInbound) return false;
    return Date.now() - lastInbound.getTime() < CUSTOMER_SERVICE_WINDOW_MS;
}

/** Nuova chat o finestra 24h scaduta → serve template Meta approvato. */
export function requiresTemplateMessage(session: ChatSession | null | undefined): boolean {
    if (!session?.messages?.length) return true;
    return !isWithinCustomerServiceWindow(session);
}

import type { ChatSession } from '@/lib/chatStore';

export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Ultimo messaggio in entrata (utente o fiorista) nella sessione. */
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

/** Finestra servizio Meta attiva: ultimo inbound entro 24 ore. */
export function isWithinCustomerServiceWindow(session: ChatSession | null | undefined): boolean {
    const lastInbound = getLastInboundAt(session);
    if (!lastInbound) return false;
    return Date.now() - lastInbound.getTime() < CUSTOMER_SERVICE_WINDOW_MS;
}

/** Alias esplicito per il router VERA (inbound in chat aperta). */
export function isActiveConversationWindow(session: ChatSession | null | undefined): boolean {
    return isWithinCustomerServiceWindow(session);
}

/**
 * Nuova chat o finestra 24h scaduta → solo il primo outbound può usare template Meta approvato.
 * Dentro la finestra: testo libero / Gemini (mai template rigidi per le risposte).
 */
export function requiresTemplateMessage(session: ChatSession | null | undefined): boolean {
    if (!session?.messages?.length) return true;
    return !isWithinCustomerServiceWindow(session);
}

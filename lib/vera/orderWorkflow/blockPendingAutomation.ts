/**
 * Blocco assoluto automazioni VERA su ordini in ATTESA.
 * PENDING (UI "In Attesa") e eventuali alias DRAFT/ATTESA: zero messaggi automatici.
 * Solo intervento umano da dashboard (cambio stato → IN_PROGRESS, poi workflow).
 */
import type { OrderStatus } from '@prisma/client';

const BLOCKED_STATUSES = new Set<string>(['PENDING', 'DRAFT', 'ATTESA']);

export function isOrderStatusBlockingVeraAutomation(
    status: OrderStatus | string | null | undefined
): boolean {
    if (!status) return false;
    return BLOCKED_STATUSES.has(String(status).trim().toUpperCase());
}

export function veraAutomationBlockedSkipReason(
    status: OrderStatus | string | null | undefined
): string | null {
    if (!isOrderStatusBlockingVeraAutomation(status)) return null;
    return `order_status_${String(status).toLowerCase()}_manual_only`;
}

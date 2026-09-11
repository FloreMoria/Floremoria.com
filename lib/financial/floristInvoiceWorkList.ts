/**
 * Lista di lavoro: fatture fiorista mancanti (non è un controllo C*).
 * Aggancio per riferimento ordine; date pagamento/fattura indipendenti.
 */
import { listFloristMissingInvoices } from '@/lib/financial/floristMissingInvoices';

export type FloristInvoiceWorkListRow = {
    partnerId: string | null;
    floristName: string;
    orderNumbers: string[];
    orderIds: string[];
    amountPaidCents: number;
    /** Giorni dal pagamento più vecchio del gruppo. */
    daysSincePayment: number;
    oldestPaymentDate: string;
};

export type FloristInvoiceWorkList = {
    title: 'Da sollecitare — fatture fiorista mancanti';
    kind: 'work_list';
    rows: FloristInvoiceWorkListRow[];
    totalCount: number;
    totalAmountCents: number;
};

/**
 * Aggrega per fiorista i bonifici/compensi in attesa di fattura.
 * Ordinata dal più vecchio (giorni trascorsi desc).
 */
export async function buildFloristInvoiceWorkList(): Promise<FloristInvoiceWorkList> {
    const missing = await listFloristMissingInvoices();
    // Solo righe ancora in attesa (non archiviate / non associate via lista missing)
    const open = missing.filter((r) => r.daysSincePayment >= 0);

    const byFlorist = new Map<string, FloristInvoiceWorkListRow>();
    for (const r of open) {
        const key = r.partnerId || r.partnerName || r.id;
        const existing = byFlorist.get(key);
        const orderLabel = r.orderNumber || (r.orderId ? r.orderId.slice(0, 8) : '—');
        if (!existing) {
            byFlorist.set(key, {
                partnerId: r.partnerId,
                floristName: r.partnerName,
                orderNumbers: [orderLabel],
                orderIds: r.orderId ? [r.orderId] : [],
                amountPaidCents: r.amountCents,
                daysSincePayment: r.daysSincePayment,
                oldestPaymentDate: r.paymentDate,
            });
            continue;
        }
        existing.amountPaidCents += r.amountCents;
        if (r.orderNumber && !existing.orderNumbers.includes(r.orderNumber)) {
            existing.orderNumbers.push(r.orderNumber);
        } else if (!r.orderNumber && orderLabel !== '—') {
            existing.orderNumbers.push(orderLabel);
        }
        if (r.orderId && !existing.orderIds.includes(r.orderId)) {
            existing.orderIds.push(r.orderId);
        }
        if (r.daysSincePayment > existing.daysSincePayment) {
            existing.daysSincePayment = r.daysSincePayment;
            existing.oldestPaymentDate = r.paymentDate;
        }
    }

    const rows = [...byFlorist.values()].sort(
        (a, b) => b.daysSincePayment - a.daysSincePayment
    );

    return {
        title: 'Da sollecitare — fatture fiorista mancanti',
        kind: 'work_list',
        rows,
        totalCount: rows.length,
        totalAmountCents: rows.reduce((s, r) => s + r.amountPaidCents, 0),
    };
}

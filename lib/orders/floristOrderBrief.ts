/**
 * FloristOrderBrief — unico oggetto ammesso verso un fiorista (email / export / anteprima).
 *
 * Regola METODO: ogni destinatario esterno riceve un oggetto costruito per lui.
 * Prezzo di vendita al cliente e contatti cliente NON entrano in questo tipo:
 * se il dato non è nel tipo, non può uscire per errore di rendering.
 */

import type { Order, OrderItem, Partner, Product } from '@prisma/client';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';
import { calculateFloristCompensation } from '@/lib/pricing/calculateFloristCompensation';
import { resolveFloristDeliveryDeadline } from '@/lib/orders/formatFloristDeliveryDeadline';
import { formatFloristOrderProductsLabel } from '@/lib/orders/formatFloristProductLabel';

/** Campi vietati: se compaiono in un payload/stringa destinata al fiorista → errore. */
export const FLORIST_OUTBOUND_FORBIDDEN_KEYS = [
    'buyerEmail',
    'customerPhone',
    'buyerFullName',
    'totalPriceCents',
    'grossAmount',
    'netAmount',
    'stripeFee',
    'stripeTransactionId',
] as const;

export type FloristOrderBrief = {
    /** Riferimento ordine parlante (es. FF-PN-26-005). */
    orderNumber: string;
    deceasedName: string;
    cemeteryName: string;
    cemeteryCity: string;
    gravePosition: string | null;
    deliveryLabel: string;
    productDescription: string;
    ticketMessage: string | null;
    /** Budget che paghiamo noi al fiorista — mai il prezzo vendita cliente. */
    floristBudgetLabel: string;
    floristBudgetCents: number;
};

type OrderForBrief = Order & {
    items: (OrderItem & { product: Product })[];
    partner?: Partner | null;
};

function esc(s: string | null | undefined): string {
    if (s == null || s === '') return '—';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Costruisce il brief fiorista partendo dall'ordine.
 * Legge solo i campi necessari; non propaga buyer/email/tel/prezzo vendita.
 */
export function buildFloristOrderBriefFromOrder(order: OrderForBrief): FloristOrderBrief {
    const deadline = resolveFloristDeliveryDeadline({
        deliveryDate: order.deliveryDate,
        createdAt: order.createdAt,
    });
    const compensation = calculateFloristCompensation(
        order.items,
        order.partner?.internalNotes ?? null
    );

    const orderNumber = (order.orderNumber || order.id).trim();
    const productDescription = formatFloristOrderProductsLabel(order.items) || 'Omaggio floreale';

    return {
        orderNumber,
        deceasedName: formatDeceasedName(order.deceasedName, 'il caro defunto'),
        cemeteryName: order.cemeteryName,
        cemeteryCity: order.cemeteryCity,
        gravePosition: order.gravePosition?.trim() || null,
        deliveryLabel: deadline.label,
        productDescription,
        ticketMessage: order.ticketMessage?.trim() || null,
        floristBudgetLabel: compensation.totalLabel,
        floristBudgetCents: compensation.totalCents,
    };
}

/** HTML email costruito SOLO da FloristOrderBrief — nessun accesso all'Order grezzo. */
export function renderFloristOrderBriefEmailHtml(brief: FloristOrderBrief): string {
    assertFloristOutboundContentSafe(JSON.stringify(brief));
    assertFloristOutboundContentSafe(
        [
            brief.orderNumber,
            brief.deceasedName,
            brief.cemeteryName,
            brief.cemeteryCity,
            brief.gravePosition,
            brief.deliveryLabel,
            brief.productDescription,
            brief.ticketMessage,
            brief.floristBudgetLabel,
        ]
            .filter(Boolean)
            .join(' ')
    );

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Ordine ${esc(brief.orderNumber)} — consegna</title></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;padding:20px;max-width:600px;margin:0 auto;background:#f7f7f7;">
  <div style="background:#fff;padding:24px;border:1px solid #eee;border-radius:8px;">
    <h2 style="margin:0 0 8px;font-size:18px;">Nuovo ordine da consegnare</h2>
    <p style="margin:0 0 16px;color:#555;font-size:14px;">Riferimento <strong>${esc(brief.orderNumber)}</strong></p>
    <table cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;width:40%;">Defunto</td><td><strong>${esc(brief.deceasedName)}</strong></td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Cimitero</td><td>${esc(brief.cemeteryName)} — ${esc(brief.cemeteryCity)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Posizione tomba</td><td>${esc(brief.gravePosition)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Consegna</td><td>${esc(brief.deliveryLabel)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Prodotto</td><td>${esc(brief.productDescription)}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Messaggio biglietto</td><td>${esc(brief.ticketMessage || 'Nessuno')}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;">Compenso FloreMoria</td><td><strong>${esc(brief.floristBudgetLabel)}</strong></td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#888;">Messaggio operativo FloreMoria per il fiorista. Non contiene dati del cliente finale.</p>
  </div>
</body>
</html>`.trim();
}

/**
 * Fallisce se il contenuto (HTML/testo/JSON) contiene chiavi o pattern tipici di dati cliente / prezzo vendita.
 * Usato dal test build-breaker e in runtime prima dell'invio.
 */
export function assertFloristOutboundContentSafe(
    content: string,
    opts?: { knownCustomerEmail?: string | null; knownCustomerPhone?: string | null; knownSalePriceLabel?: string | null }
): void {
    const text = String(content ?? '');
    const lower = text.toLowerCase();

    for (const key of FLORIST_OUTBOUND_FORBIDDEN_KEYS) {
        // Chiavi JSON/object: "buyerEmail": o buyerEmail=
        const keyRe = new RegExp(`["']?${key}["']?\\s*[:=]`, 'i');
        if (keyRe.test(text)) {
            throw new Error(
                `FLORIST_PRIVACY_VIOLATION: contenuto fiorista contiene chiave vietata «${key}».`
            );
        }
    }

    // Etichette tipiche del modello staff riusato male
    if (/id\s*sessione\s*stripe/i.test(text)) {
        throw new Error('FLORIST_PRIVACY_VIOLATION: etichetta staff «ID Sessione Stripe» in contenuto fiorista.');
    }
    if (/totale\s+ordine/i.test(text) && /€\s*\d/.test(text)) {
        throw new Error('FLORIST_PRIVACY_VIOLATION: possibile prezzo vendita cliente («Totale Ordine») in contenuto fiorista.');
    }
    if (/\bemail\b/i.test(text) && /@/.test(text) && !/assistenza@floremoria\.com/i.test(text)) {
        // Heuristica: campo Email + indirizzo (cliente). Compenso non ha @.
        if (/<strong>\s*email\s*<\/strong>/i.test(text) || />\s*email\s*</i.test(lower)) {
            throw new Error('FLORIST_PRIVACY_VIOLATION: etichetta Email cliente in contenuto fiorista.');
        }
    }
    if (/<strong>\s*telefono\s*<\/strong>/i.test(text) || />\s*telefono\s*<\/td>/i.test(lower)) {
        throw new Error('FLORIST_PRIVACY_VIOLATION: etichetta Telefono cliente in contenuto fiorista.');
    }
    if (/<strong>\s*cliente\s*<\/strong>/i.test(text)) {
        throw new Error('FLORIST_PRIVACY_VIOLATION: etichetta Cliente in contenuto fiorista.');
    }

    const email = opts?.knownCustomerEmail?.trim().toLowerCase();
    if (email && email.includes('@') && lower.includes(email)) {
        throw new Error('FLORIST_PRIVACY_VIOLATION: email cliente presente nel contenuto fiorista.');
    }
    const phone = opts?.knownCustomerPhone?.replace(/\s/g, '');
    if (phone && phone.length >= 8) {
        const digits = phone.replace(/\D/g, '');
        const contentDigits = text.replace(/\D/g, '');
        if (digits.length >= 8 && contentDigits.includes(digits)) {
            throw new Error('FLORIST_PRIVACY_VIOLATION: telefono cliente presente nel contenuto fiorista.');
        }
    }
    const sale = opts?.knownSalePriceLabel?.trim();
    if (sale && sale.length >= 4 && text.includes(sale)) {
        throw new Error('FLORIST_PRIVACY_VIOLATION: prezzo vendita cliente presente nel contenuto fiorista.');
    }
}

/** Serializzazione per audit: elenco chiavi presenti (deve essere sottoinsieme whitelist). */
export function floristOrderBriefKeys(brief: FloristOrderBrief): string[] {
    return Object.keys(brief).sort();
}

export const FLORIST_ORDER_BRIEF_ALLOWED_KEYS = [
    'cemeteryCity',
    'cemeteryName',
    'deceasedName',
    'deliveryLabel',
    'floristBudgetCents',
    'floristBudgetLabel',
    'gravePosition',
    'orderNumber',
    'productDescription',
    'ticketMessage',
] as const;

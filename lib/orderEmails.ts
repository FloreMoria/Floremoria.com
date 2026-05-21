import type { Order, OrderItem, Product, Partner } from '@prisma/client';

type OrderWithItems = Order & {
    items: (OrderItem & { product: Product })[];
};

type OrderWithItemsAndPartner = OrderWithItems & {
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

function formatMoney(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`;
}

export function buildOrderStaffHtml(params: { order: OrderWithItemsAndPartner; stripeSessionId: string }): string {
    const { order, stripeSessionId } = params;
    const rows = order.items
        .map(
            (li) =>
                `<tr><td>${esc(li.product.name)}</td><td style="text-align:center">${li.quantity}</td><td style="text-align:right">${formatMoney(li.priceCents * li.quantity)}</td></tr>`
        )
        .join('');

    const partnerInfo = order.partner
        ? `${esc(order.partner.shopName)} (Proprietario: ${esc(order.partner.ownerName)} - WA: ${esc(order.partner.whatsappNumber)})`
        : 'Nessun partner assegnato (Auto-assegnazione fallita)';

    const funeralFormatted = order.funeralDate
        ? esc(order.funeralDate.toISOString().replace('T', ' ').slice(0, 16))
        : 'Non specificato';

    return `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <h2 style="margin:0 0 12px">Ordine pagato — ${esc(order.orderNumber)}</h2>
  <p style="margin:0 0 16px;color:#444">Pagamento confermato via Stripe Checkout.</p>
  <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;max-width:560px;margin-bottom:16px">
    <tr><td><strong>Cliente</strong></td><td>${esc(order.buyerFullName)}</td></tr>
    <tr><td><strong>Email</strong></td><td>${esc(order.buyerEmail)}</td></tr>
    <tr><td><strong>Telefono</strong></td><td>${esc(order.customerPhone)}</td></tr>
    <tr><td><strong>Defunto / dedicatario</strong></td><td>${esc(order.deceasedName)}</td></tr>
    <tr><td><strong>Luogo di Consegna (Cimitero)</strong></td><td>${esc(order.cemeteryName)}</td></tr>
    <tr><td><strong>Posizione / note tomba</strong></td><td>${esc(order.gravePosition)}</td></tr>
    <tr><td><strong>Provincia</strong></td><td>${esc(order.deliveryProvince)}</td></tr>
    <tr><td><strong>Data Consegna Richiesta</strong></td><td>${order.deliveryDate ? esc(order.deliveryDate.toISOString().slice(0, 10)) : '—'}</td></tr>
    <tr><td><strong>Agenzia Funebre (B2B)</strong></td><td>${esc(order.agencyName)}</td></tr>
    <tr><td><strong>Data/Ora Funerale</strong></td><td>${funeralFormatted}</td></tr>
    <tr><td><strong>Partner Fiorista Assegnato</strong></td><td>${partnerInfo}</td></tr>
    <tr><td><strong>Totale Ordine</strong></td><td><strong>${formatMoney(order.totalPriceCents)}</strong></td></tr>
    <tr><td><strong>ID Sessione Stripe</strong></td><td><code>${esc(stripeSessionId)}</code></td></tr>
  </table>
  <h3 style="margin:16px 0 8px">Righe ordine</h3>
  <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;max-width:560px">
    <thead><tr><th align="left">Prodotto</th><th>Qtà</th><th align="right">Importo</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${order.ticketMessage ? `<p style="margin-top:16px"><strong>Messaggio biglietto</strong><br>${esc(order.ticketMessage)}</p>` : ''}
  ${order.additionalInstructions ? `<p style="margin-top:12px"><strong>Istruzioni aggiuntive</strong><br>${esc(order.additionalInstructions)}</p>` : ''}
  <p style="margin-top:20px;font-size:12px;color:#666">ID interno: ${esc(order.id)}</p>
</body></html>`.trim();
}

export function buildOrderCustomerHtml(params: { order: OrderWithItems }): string {
    const { order } = params;
    const rows = order.items
        .map(
            (li) =>
                `<tr><td>${esc(li.product.name)}</td><td style="text-align:center">${li.quantity}</td><td style="text-align:right">${formatMoney(li.priceCents * li.quantity)}</td></tr>`
        )
        .join('');

    return `
<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;line-height:1.6;color:#222">
  <p style="margin:0 0 8px">Gentile ${esc(order.buyerFullName)},</p>
  <p style="margin:0 0 16px">abbiamo ricevuto il pagamento e preso in carico il tuo ordine <strong>${esc(order.orderNumber)}</strong>.</p>
  <p style="margin:0 0 16px">Ti contatteremo se serviranno chiarimenti sulla consegna. Riceverai le foto promesse sul numero che ci hai indicato in fase d’ordine.</p>
  <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;max-width:520px;margin:16px 0">
    <thead><tr><th align="left">Dettaglio</th><th>Qtà</th><th align="right">Importo</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin:0"><strong>Totale pagato:</strong> ${formatMoney(order.totalPriceCents)}</p>
  <p style="margin:24px 0 0;font-size:13px;color:#555">FloreMoria — presenza delegata e testimoniata.<br/>
  <a href="https://www.floremoria.com">www.floremoria.com</a> · <a href="mailto:assistenza@floremoria.com">assistenza@floremoria.com</a></p>
</body></html>`.trim();
}

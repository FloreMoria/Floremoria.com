import type { Order, OrderItem, Product, Partner } from '@prisma/client';
import type { FloristScoutOrderPayload } from '@/lib/ai/floristScoutTypes';

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
                `<tr>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: left;">${esc(li.product.name)}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${li.quantity}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatMoney(li.priceCents)}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatMoney(li.priceCents * li.quantity)}</td>
                </tr>`
        )
        .join('');

    const partnerInfo = order.partner
        ? `${esc(order.partner.shopName)} (Proprietario: ${esc(order.partner.ownerName)} - WA: ${esc(order.partner.whatsappNumber)})`
        : 'Nessun partner assegnato (Auto-assegnazione fallita)';

    const funeralFormatted = order.funeralDate
        ? esc(order.funeralDate.toISOString().replace('T', ' ').slice(0, 16))
        : 'Non specificato';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ordine pagato — ${esc(order.orderNumber)}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #111; padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
  <div style="background-color: #fff; padding: 24px; border-radius: 8px; border: 1px solid #eee; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
    
    <div style="border-bottom: 2px solid #eaeaea; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 4px; color: #1a1a1a; font-size: 20px;">Ordine pagato — ${esc(order.orderNumber)}</h2>
      <p style="margin: 0; color: #666; font-size: 14px;">Pagamento confermato via Stripe Checkout.</p>
    </div>

    <table cellpadding="6" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
      <tbody>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666; width: 40%;"><strong>Cliente</strong></td>
          <td style="padding: 8px 0; color: #111;">${esc(order.buyerFullName)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Email</strong></td>
          <td style="padding: 8px 0; color: #111;">${esc(order.buyerEmail)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Telefono</strong></td>
          <td style="padding: 8px 0; color: #111;">${esc(order.customerPhone)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Defunto / dedicatario</strong></td>
          <td style="padding: 8px 0; color: #111;">${esc(order.deceasedName)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Luogo di Consegna (Cimitero)</strong></td>
          <td style="padding: 8px 0; color: #111;">${esc(order.cemeteryName)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Posizione / note tomba</strong></td>
          <td style="padding: 8px 0; color: #111;">${esc(order.gravePosition)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Provincia</strong></td>
          <td style="padding: 8px 0; color: #111;">${esc(order.deliveryProvince)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Data Consegna Richiesta</strong></td>
          <td style="padding: 8px 0; color: #111;">${order.deliveryDate ? esc(order.deliveryDate.toISOString().slice(0, 10)) : '—'}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Agenzia Funebre (B2B)</strong></td>
          <td style="padding: 8px 0; color: #111;">${esc(order.agencyName)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Data/Ora Funerale</strong></td>
          <td style="padding: 8px 0; color: #111;">${funeralFormatted}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Partner Fiorista Assegnato</strong></td>
          <td style="padding: 8px 0; color: #111;">${partnerInfo}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>Totale Ordine</strong></td>
          <td style="padding: 8px 0; color: #111; font-size: 16px; font-weight: bold;">${formatMoney(order.totalPriceCents)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px 0; color: #666;"><strong>ID Sessione Stripe</strong></td>
          <td style="padding: 8px 0; color: #111;"><code>${esc(stripeSessionId)}</code></td>
        </tr>
      </tbody>
    </table>

    <h3 style="margin: 24px 0 12px; color: #1a1a1a; font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 6px;">Righe ordine</h3>
    <table cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 12px;">
      <thead>
        <tr style="background-color: #f5f5f5;">
          <th align="left" style="padding: 8px; border: 1px solid #ddd;">Prodotto / Descrizione</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Qtà</th>
          <th align="right" style="padding: 8px; border: 1px solid #ddd;">Prezzo Unitario</th>
          <th align="right" style="padding: 8px; border: 1px solid #ddd;">Totale Riga</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div style="text-align: right; margin-top: 12px; margin-bottom: 24px; padding: 10px; background-color: #fcfcfc; border: 1px solid #eee; border-radius: 4px;">
      <span style="font-size: 15px; color: #333;"><strong>Totale Ordine:</strong></span>
      <span style="font-size: 18px; color: #000; margin-left: 8px;"><strong>${formatMoney(order.totalPriceCents)}</strong></span>
    </div>

    ${order.ticketMessage ? `
    <div style="margin-top: 20px; padding: 12px; background-color: #fff9f0; border-left: 4px solid #f0a020; border-radius: 4px;">
      <strong style="font-size: 14px; color: #b07000;">Messaggio biglietto</strong>
      <p style="margin: 6px 0 0; color: #333; font-size: 14px; white-space: pre-wrap;">${esc(order.ticketMessage)}</p>
    </div>` : ''}

    ${order.additionalInstructions ? `
    <div style="margin-top: 16px; padding: 12px; background-color: #f0f4f8; border-left: 4px solid #3070b0; border-radius: 4px;">
      <strong style="font-size: 14px; color: #205080;">Istruzioni aggiuntive</strong>
      <p style="margin: 6px 0 0; color: #333; font-size: 14px; white-space: pre-wrap;">${esc(order.additionalInstructions)}</p>
    </div>` : ''}

    <p style="margin-top: 24px; font-size: 12px; color: #888; border-top: 1px solid #eaeaea; padding-top: 12px;">ID interno: ${esc(order.id)}</p>
  </div>
</body>
</html>`.trim();
}

export function buildOrderCustomerHtml(params: { order: OrderWithItems }): string {
    const { order } = params;
    
    const rows = order.items
        .map(
            (li) =>
                `<tr>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: left;">${esc(li.product.name)}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${li.quantity}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatMoney(li.priceCents)}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatMoney(li.priceCents * li.quantity)}</td>
                </tr>`
        )
        .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Conferma ordine — ${esc(order.orderNumber)}</title>
</head>
<body style="font-family: Georgia, serif; line-height: 1.6; color: #222; padding: 20px; max-width: 600px; margin: 0 auto; background-color: #fafafa;">
  <div style="background-color: #fff; padding: 24px; border-radius: 8px; border: 1px solid #eee; box-shadow: 0 4px 12px rgba(0,0,0,0.01);">
    <p style="margin: 0 0 8px;">Gentile ${esc(order.buyerFullName)},</p>
    <p style="margin: 0 0 16px;">abbiamo ricevuto il pagamento e preso in carico il tuo ordine <strong>${esc(order.orderNumber)}</strong> (conferma d'ordine / ricevuta di pagamento di cortesia).</p>
    <p style="margin: 0 0 12px;">Ti contatteremo se serviranno chiarimenti. Riceverai le foto promesse sul numero che ci hai indicato in fase d’ordine.</p>

    <div style="margin: 0 0 16px; padding: 10px 12px; background: #f3f8f1; border-left: 4px solid #5a8f4a; border-radius: 4px; font-size: 14px;">
      <strong>Consegna: Sempre gratuita</strong>
    </div>
    
    <table cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 16px;">
      <thead>
        <tr style="background-color: #f7f7f7;">
          <th align="left" style="padding: 8px; border: 1px solid #ddd;">Prodotto / Descrizione</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Qtà</th>
          <th align="right" style="padding: 8px; border: 1px solid #ddd;">Prezzo Unitario</th>
          <th align="right" style="padding: 8px; border: 1px solid #ddd;">Totale Riga</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <p style="margin: 0 0 8px; font-size: 13px; color: #555;">Scorporo di cortesia: prodotti floreali IVA 10%; eventuali accessori IVA 22%.</p>
    
    <div style="text-align: right; margin-top: 12px; margin-bottom: 24px; padding: 10px; background-color: #fdfdfd; border: 1px solid #eee; border-radius: 4px;">
      <span style="font-size: 15px; color: #333;"><strong>Totale pagato:</strong></span>
      <span style="font-size: 17px; color: #111; margin-left: 8px;"><strong>${formatMoney(order.totalPriceCents)}</strong></span>
    </div>

    <p style="margin: 24px 0 0; font-size: 13px; color: #555; border-top: 1px solid #eee; padding-top: 12px;">
      FloreMoria — presenza delegata e testimoniata.<br/>
      <a href="https://www.floremoria.com" style="color: #4a6fa5; text-decoration: none;">www.floremoria.com</a> · <a href="mailto:assistenza@floremoria.com" style="color: #4a6fa5; text-decoration: none;">assistenza@floremoria.com</a>
    </p>
  </div>
</body>
</html>`.trim();
}

export function buildFloristScoutStaffHtml(params: {
  orderNumber: string;
  orderId: string;
  deceasedName: string;
  scout: FloristScoutOrderPayload;
}): string {
  const top = params.scout.recommendations[0];
  const telHref = top?.phone ? `tel:${top.phone.replace(/\s/g, '')}` : '#';

  const rows = params.scout.recommendations
    .map((r) => {
      const tel = r.phone ? `tel:${r.phone.replace(/\s/g, '')}` : '#';
      const badge =
        r.rank === 1
          ? '<span style="background:#166534;color:#fff;font-size:11px;padding:2px 8px;border-radius:999px;margin-left:8px;">#1 — Primo da contattare</span>'
          : `<span style="color:#666;font-size:11px;margin-left:8px;">#${r.rank}</span>`;
      return `<tr>
        <td style="padding:12px;border:1px solid #e5e7eb;vertical-align:top;">
          <strong>${esc(r.name)}</strong>${badge}<br/>
          <span style="color:#555;font-size:13px;">${esc(r.address)}</span><br/>
          <span style="color:#555;font-size:13px;">${esc(r.distanceDescription)} · ~${r.distanceMeters} m</span><br/>
          ${r.rating > 0 ? `<span style="font-size:12px;color:#92400e;">★ ${r.rating.toFixed(1)} (${r.reviewsCount} rec.)</span><br/>` : ''}
          <span style="font-size:12px;color:#374151;font-style:italic;">${esc(r.aiReasoning)}</span>
        </td>
        <td style="padding:12px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap;">
          <a href="${tel}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;">Chiama</a><br/>
          <span style="font-size:13px;color:#111;margin-top:8px;display:inline-block;">${esc(r.phone)}</span>
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Fiorista richiesto — ${esc(params.orderNumber)}</title></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;padding:20px;max-width:640px;margin:0 auto;background:#f8fafc;">
  <div style="background:#fff;padding:24px;border-radius:12px;border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 8px;font-size:20px;">Nuovo fiorista richiesto — Scout AI</h2>
    <p style="margin:0 0 16px;color:#555;font-size:14px;">
      Ordine <strong>${esc(params.orderNumber)}</strong> · ${esc(params.deceasedName)}<br/>
      Cimitero: <strong>${esc(params.scout.cemetery)}</strong> (${esc(params.scout.cemeteryCity)})
    </p>
    ${
      top
        ? `<div style="background:#ecfdf5;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Più vicino all'ingresso — contattare per primo</p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;">${esc(top.name)}</p>
      <a href="${telHref}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">Chiama ora · ${esc(top.phone)}</a>
    </div>`
        : ''
    }
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr>
        <th style="text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;">Fiorista</th>
        <th style="text-align:center;padding:8px;border-bottom:2px solid #e5e7eb;">Telefono</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#666;">
      Dashboard: <a href="https://www.floremoria.com/dashboard/orders">Ordini</a> · ID ordine ${esc(params.orderId)}
    </p>
  </div>
</body></html>`;
}

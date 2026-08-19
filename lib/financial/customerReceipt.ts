/**
 * Ricevuta di cortesia cliente: HTML con scorporo IVA 10%/22% e «Consegna: Sempre gratuita».
 * Archiviazione su Vercel Blob + riga CustomerOrderReceipt.
 */

import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { isAccessoryCategory, scorporaVenditaFloreale } from '@/lib/financial/vat';
import { periodKeyFromDate } from '@/lib/financial/financePeriod';
import type { Order, OrderItem, Product, Category } from '@prisma/client';

type OrderForReceipt = Order & {
    items: Array<OrderItem & { product: Product & { category?: Category | null } }>;
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

export function splitOrderVatAmounts(order: OrderForReceipt): {
    grossCents: number;
    accessoryGrossCents: number;
    floralGrossCents: number;
    floralImponibileCents: number;
    accessoryImponibileCents: number;
    ivaDebitoCents: number;
} {
    const grossCents =
        order.grossAmount != null
            ? Math.round(order.grossAmount * 100)
            : order.totalPriceCents;

    let accessoryGrossCents =
        order.accessoryAmountCents != null
            ? order.accessoryAmountCents
            : 0;

    if (order.accessoryAmountCents == null) {
        for (const item of order.items) {
            const cat = item.product.category;
            if (isAccessoryCategory(cat?.slug) || isAccessoryCategory(cat?.name)) {
                accessoryGrossCents += item.priceCents * item.quantity;
            }
        }
    }

    accessoryGrossCents = Math.min(Math.max(0, accessoryGrossCents), Math.abs(grossCents));
    const vat = scorporaVenditaFloreale({
        grossCents,
        accessoryCents: accessoryGrossCents,
    });

    return {
        grossCents,
        accessoryGrossCents,
        floralGrossCents: grossCents - accessoryGrossCents,
        floralImponibileCents: vat.floral.imponibileCents,
        accessoryImponibileCents: vat.accessory?.imponibileCents ?? 0,
        ivaDebitoCents: vat.ivaCents,
    };
}

/** HTML ricevuta di cortesia (non fattura elettronica). */
export function buildCustomerCourtesyReceiptHtml(order: OrderForReceipt): string {
    const vat = splitOrderVatAmounts(order);
    const rows = order.items
        .map(
            (li) =>
                `<tr>
          <td style="padding:8px;border:1px solid #ddd;">${esc(li.product.name)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${li.quantity}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatMoney(li.priceCents)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatMoney(li.priceCents * li.quantity)}</td>
        </tr>`
        )
        .join('');

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Ricevuta di cortesia — ${esc(order.orderNumber)}</title>
</head>
<body style="font-family:Georgia,serif;line-height:1.55;color:#222;padding:24px;max-width:640px;margin:0 auto;background:#faf8f5;">
  <div style="background:#fff;padding:28px;border:1px solid #e8e0d4;border-radius:8px;">
    <h1 style="margin:0 0 4px;font-size:22px;color:#1a1a1a;">Conferma d'Ordine / Ricevuta di Pagamento di cortesia</h1>
    <p style="margin:0 0 16px;font-size:13px;color:#666;">Documento di cortesia — non costituisce fattura elettronica SDI.</p>

    <p style="margin:0 0 8px;">Gentile <strong>${esc(order.buyerFullName)}</strong>,</p>
    <p style="margin:0 0 16px;">confermiamo il pagamento dell'ordine <strong>${esc(order.orderNumber)}</strong>.</p>

    <div style="margin:16px 0;padding:12px 14px;background:#f3f8f1;border-left:4px solid #5a8f4a;border-radius:4px;font-size:15px;">
      <strong>Consegna: Sempre gratuita</strong>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      <thead>
        <tr style="background:#f7f3ec;">
          <th align="left" style="padding:8px;border:1px solid #ddd;">Prodotto</th>
          <th style="padding:8px;border:1px solid #ddd;">Qtà</th>
          <th align="right" style="padding:8px;border:1px solid #ddd;">Unitario</th>
          <th align="right" style="padding:8px;border:1px solid #ddd;">Totale</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0 20px;">
      <tr>
        <td style="padding:6px 0;color:#555;">Prodotti floreali — Imponibile IVA 10%</td>
        <td style="padding:6px 0;text-align:right;font-family:ui-monospace,monospace;">${formatMoney(vat.floralImponibileCents)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#555;">Accessori / servizi — Imponibile IVA 22%</td>
        <td style="padding:6px 0;text-align:right;font-family:ui-monospace,monospace;">${formatMoney(vat.accessoryImponibileCents)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#555;">IVA a debito (scorporata)</td>
        <td style="padding:6px 0;text-align:right;font-family:ui-monospace,monospace;">${formatMoney(vat.ivaDebitoCents)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 0;font-weight:bold;border-top:1px solid #eee;">Totale incassato</td>
        <td style="padding:10px 0 0;text-align:right;font-weight:bold;font-size:16px;border-top:1px solid #eee;font-family:ui-monospace,monospace;">${formatMoney(vat.grossCents)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#5a8f4a;"><strong>Consegna</strong></td>
        <td style="padding:6px 0;text-align:right;color:#5a8f4a;"><strong>Sempre gratuita</strong></td>
      </tr>
    </table>

    <p style="margin:0;font-size:12px;color:#777;">
      Defunto / dedicatario: ${esc(order.deceasedName)} · Luogo: ${esc(order.cemeteryName)} — ${esc(order.cemeteryCity)}
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;">
      FloreMoria S.r.l. · www.floremoria.com · assistenza@floremoria.com<br/>
      Emesso il ${esc(new Date().toISOString().slice(0, 10))} · Ordine ${esc(order.id)}
    </p>
  </div>
</body>
</html>`.trim();
}

/**
 * Genera HTML, salva su Blob e upsert CustomerOrderReceipt.
 * Idempotente per orderId (unique).
 */
export async function archiveCustomerOrderReceipt(orderId: string): Promise<{
    ok: boolean;
    receiptId?: string;
    blobUrl?: string | null;
    error?: string;
}> {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: { include: { category: true } },
                    },
                },
            },
        });
        if (!order || order.isTest) {
            return { ok: false, error: 'Ordine assente o test' };
        }

        const html = buildCustomerCourtesyReceiptHtml(order);
        const vat = splitOrderVatAmounts(order);
        const issuedAt = order.createdAt;
        const periodKey = periodKeyFromDate(issuedAt, 'quarter');
        const safeCode = (order.orderNumber || order.id).replace(/[^\w.-]+/g, '_');
        const blobPath = `floremoria-finance/receipts/${issuedAt.getFullYear()}/${safeCode}.html`;

        const put = await putBlobWithAccessFallback(blobPath, html, {
            contentType: 'text/html; charset=utf-8',
            addRandomSuffix: false,
            allowOverwrite: true,
        });

        const receipt = await prisma.customerOrderReceipt.upsert({
            where: { orderId: order.id },
            create: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                issuedAt,
                periodKey,
                blobPath,
                blobUrl: put.url,
                contentType: 'text/html; charset=utf-8',
                grossCents: vat.grossCents,
                floralImponibileCents: vat.floralImponibileCents,
                accessoryImponibileCents: vat.accessoryImponibileCents,
                ivaDebitoCents: vat.ivaDebitoCents,
                metadataJson: {
                    deliveryFree: true,
                    deliveryLabel: 'Consegna: Sempre gratuita',
                },
            },
            update: {
                orderNumber: order.orderNumber,
                issuedAt,
                periodKey,
                blobPath,
                blobUrl: put.url,
                grossCents: vat.grossCents,
                floralImponibileCents: vat.floralImponibileCents,
                accessoryImponibileCents: vat.accessoryImponibileCents,
                ivaDebitoCents: vat.ivaDebitoCents,
                metadataJson: {
                    deliveryFree: true,
                    deliveryLabel: 'Consegna: Sempre gratuita',
                },
            },
        });

        return { ok: true, receiptId: receipt.id, blobUrl: put.url };
    } catch (err) {
        console.error('[customer-receipt] archive failed:', err);
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

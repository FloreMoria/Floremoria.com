/**
 * Esporta le ricevute di cortesia di tutti gli ordini PAID in un ZIP di PDF.
 *
 * Contesto prodotto:
 * - al pagamento il cliente riceve un'email HTML (conferma / ricevuta di cortesia),
 *   non un allegato PDF né una fattura SDI;
 * - da agosto 2026 alcune sono anche archiviate su Vercel Blob come HTML.
 *
 * Questo script non dipende dalla scrittura su Blob: per ogni ordine PAID
 * usa l'HTML archiviato se raggiungibile, altrimenti lo rigenera dai dati ordine.
 *
 * Uso: npx tsx scripts/export-customer-receipts-pdf-zip.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { chromium } from 'playwright';
import type { Order, OrderItem, Product, Category } from '@prisma/client';
import prisma from '../lib/prisma';
import { getBlobWithAccessFallback } from '../lib/blob/storeAccess';
import { buildCustomerCourtesyReceiptHtml } from '../lib/financial/customerReceipt';

type OrderForReceipt = Order & {
    items: Array<OrderItem & { product: Product & { category?: Category | null } }>;
};

async function readReceiptHtml(blobPath: string, blobUrl: string | null): Promise<string | null> {
    try {
        const blob = await getBlobWithAccessFallback(blobPath, {});
        if (blob?.stream && blob.statusCode === 200) {
            const chunks: Uint8Array[] = [];
            const reader = blob.stream.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
            }
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const out = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) {
                out.set(c, offset);
                offset += c.length;
            }
            return new TextDecoder('utf-8').decode(out);
        }
    } catch {
        // fallback URL sotto
    }
    if (blobUrl) {
        try {
            const res = await fetch(blobUrl);
            if (res.ok) return await res.text();
        } catch {
            return null;
        }
    }
    return null;
}

async function main() {
    const outDir = path.join(process.cwd(), 'docs/verbali');
    fs.mkdirSync(outDir, { recursive: true });
    const zipPath = path.join(outDir, 'FloreMoria_Ricevute_Cortesia_ordini_PAID.zip');
    const manifestPath = path.join(
        outDir,
        'FloreMoria_Ricevute_Cortesia_ordini_PAID_manifest.json'
    );

    const orders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            partnerPaymentStatus: 'PAID',
        },
        include: {
            items: { include: { product: { include: { category: true } } } },
            customerReceipts: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    console.log(`[export-receipts] ordini PAID: ${orders.length}`);

    const zip = new JSZip();
    const manifest: Array<Record<string, unknown>> = [];
    let pdfOk = 0;
    let pdfFail = 0;
    let fromArchive = 0;
    let regenerated = 0;

    const browser = await chromium.launch({ headless: true });
    try {
        for (const order of orders) {
            const orderNumber = order.orderNumber || order.id;
            const safe = orderNumber.replace(/[^\w.-]+/g, '_');
            const day = order.createdAt.toISOString().slice(0, 10);
            const fileName = `${day}_${safe}.pdf`;

            const archived = order.customerReceipts[0] || null;
            let html: string | null = null;
            let source: 'archive' | 'regenerated' = 'regenerated';

            if (archived) {
                html = await readReceiptHtml(archived.blobPath, archived.blobUrl);
                if (html) {
                    source = 'archive';
                    fromArchive++;
                }
            }
            if (!html) {
                html = buildCustomerCourtesyReceiptHtml(order as OrderForReceipt);
                regenerated++;
                source = 'regenerated';
            }

            const flags =
                order.veraWorkflowFlags && typeof order.veraWorkflowFlags === 'object'
                    ? (order.veraWorkflowFlags as Record<string, unknown>)
                    : {};

            try {
                const page = await browser.newPage();
                await page.setContent(html, { waitUntil: 'load' });
                const pdf = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
                });
                await page.close();
                zip.file(fileName, Buffer.from(pdf));
                pdfOk++;
                manifest.push({
                    orderNumber,
                    status: 'OK',
                    fileName,
                    createdAt: order.createdAt.toISOString(),
                    buyerEmail: order.buyerEmail,
                    customerEmailSentAt: flags.customer_email_sent || null,
                    source,
                    hadArchiveRow: Boolean(archived),
                });
                console.log(`[export-receipts] OK ${fileName} (${source})`);
            } catch (err) {
                pdfFail++;
                manifest.push({
                    orderNumber,
                    status: 'FAIL',
                    reason: err instanceof Error ? err.message : String(err),
                });
                console.warn(`[export-receipts] FAIL ${orderNumber}`, err);
            }
        }
    } finally {
        await browser.close();
    }

    const summary = {
        generatedAt: new Date().toISOString(),
        note:
            'PDF generati dalla ricevuta di cortesia (HTML email/archivio). Non sono fatture elettroniche SDI. L’email storica non aveva allegato PDF.',
        paidOrders: orders.length,
        pdfOk,
        pdfFail,
        fromArchive,
        regenerated,
        zipPath,
        items: manifest,
    };

    zip.file('_MANIFEST.json', JSON.stringify(summary, null, 2));
    const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
    fs.writeFileSync(zipPath, buffer);
    fs.writeFileSync(manifestPath, JSON.stringify(summary, null, 2), 'utf8');

    // Copia anche in Downloads per accesso immediato
    const downloadsZip = path.join(
        process.env.HOME || '',
        'Downloads',
        'FloreMoria_Ricevute_Cortesia_ordini_PAID.zip'
    );
    if (process.env.HOME) {
        fs.copyFileSync(zipPath, downloadsZip);
        summary['downloadsZip'] = downloadsZip;
    }

    console.log(JSON.stringify({ ...summary, items: undefined, bytes: buffer.length }, null, 2));
    if (pdfOk === 0) process.exitCode = 1;
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });

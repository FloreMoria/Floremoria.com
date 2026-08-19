import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { resolveFinancePeriod, type FinancePeriodMode } from '@/lib/financial/financePeriod';
import { getBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { archiveCustomerOrderReceipt } from '@/lib/financial/customerReceipt';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
    } catch (err) {
        console.warn('[download-receipts-zip] blob get failed, try URL', blobPath, err);
    }

    if (blobUrl) {
        try {
            const res = await fetch(blobUrl);
            if (res.ok) return await res.text();
        } catch (err) {
            console.warn('[download-receipts-zip] fetch url failed', blobUrl, err);
        }
    }
    return null;
}

/**
 * GET /api/dashboard/finance/download-receipts-zip?year=2026&mode=quadrimester&quadrimester=2
 * oppure mode=quarter&quarter=3
 */
export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const year = Number(searchParams.get('year') || new Date().getFullYear());
        const mode = (searchParams.get('mode') || 'quadrimester') as FinancePeriodMode;
        const quarter = searchParams.get('quarter')
            ? Number(searchParams.get('quarter'))
            : null;
        const quadrimester = searchParams.get('quadrimester')
            ? Number(searchParams.get('quadrimester'))
            : null;
        const backfill = searchParams.get('backfill') === '1';

        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }

        const bounds = resolveFinancePeriod({ year, mode, quarter, quadrimester });

        if (backfill) {
            const ordersMissing = await prisma.order.findMany({
                where: {
                    deletedAt: null,
                    isTest: false,
                    createdAt: { gte: bounds.start, lte: bounds.end },
                    partnerPaymentStatus: 'PAID',
                    customerReceipts: { none: {} },
                },
                select: { id: true },
                take: 200,
            });
            for (const o of ordersMissing) {
                await archiveCustomerOrderReceipt(o.id).catch(() => undefined);
            }
        }

        const receipts = await prisma.customerOrderReceipt.findMany({
            where: {
                issuedAt: { gte: bounds.start, lte: bounds.end },
            },
            orderBy: { issuedAt: 'asc' },
        });

        const zip = new JSZip();
        let added = 0;
        for (const r of receipts) {
            const html = await readReceiptHtml(r.blobPath, r.blobUrl);
            if (!html) continue;
            const safe =
                (r.orderNumber || r.orderId).replace(/[^\w.-]+/g, '_') +
                '_' +
                r.issuedAt.toISOString().slice(0, 10) +
                '.html';
            zip.file(safe, html);
            added += 1;
        }

        if (added === 0) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `Nessuna ricevuta archiviata in ${bounds.label}. Usa backfill=1 per generarle dagli ordini pagati.`,
                },
                { status: 404 }
            );
        }

        const buffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
        });

        const filename = `FloreMoria_Ricevute_${bounds.periodKey}.zip`;
        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
                'X-Receipts-Count': String(added),
            },
        });
    } catch (error) {
        console.error('[download-receipts-zip]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Errore ZIP ricevute',
            },
            { status: 500 }
        );
    }
}

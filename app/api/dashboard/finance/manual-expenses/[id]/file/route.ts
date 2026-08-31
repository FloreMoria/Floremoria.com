import * as fs from 'fs';
import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';
import { getBlobWithAccessFallback } from '@/lib/blob/storeAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serve allegato spesa manuale (Blob o filesystem locale) — solo admin Contabilità.
 */
export async function GET(_request: Request, ctx: Ctx) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    try {
        const expense = await prisma.manualFinanceExpense.findUnique({
            where: { id },
            select: {
                id: true,
                blobUrl: true,
                blobPath: true,
                storageKind: true,
                contentType: true,
                fileName: true,
            },
        });
        if (!expense) {
            return NextResponse.json({ ok: false, error: 'Allegato non trovato' }, { status: 404 });
        }

        if (expense.storageKind === 'blob' || expense.blobUrl?.startsWith('http')) {
            // Redirect a URL Blob pubblico se disponibile
            if (expense.blobUrl?.startsWith('http')) {
                return NextResponse.redirect(expense.blobUrl);
            }
            const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
            if (!token || !expense.blobPath) {
                return NextResponse.json(
                    { ok: false, error: 'Allegato Blob non accessibile' },
                    { status: 404 }
                );
            }
            const result = await getBlobWithAccessFallback(expense.blobPath, { token });
            if (!result?.stream || result.statusCode !== 200) {
                return NextResponse.json(
                    { ok: false, error: 'Download Blob fallito' },
                    { status: 502 }
                );
            }
            return new NextResponse(result.stream, {
                headers: {
                    'Content-Type': expense.contentType || 'application/octet-stream',
                    'Content-Disposition': `inline; filename="${(expense.fileName || 'allegato').replace(/"/g, '')}"`,
                    'Cache-Control': 'private, max-age=300',
                },
            });
        }

        if (expense.blobPath && fs.existsSync(expense.blobPath)) {
            const buf = fs.readFileSync(expense.blobPath);
            return new NextResponse(buf, {
                headers: {
                    'Content-Type': expense.contentType || 'application/octet-stream',
                    'Content-Disposition': `inline; filename="${(expense.fileName || 'allegato').replace(/"/g, '')}"`,
                    'Cache-Control': 'private, max-age=60',
                },
            });
        }

        return NextResponse.json({ ok: false, error: 'File allegato non trovato' }, { status: 404 });
    } catch (error) {
        console.error('[manual-expenses file GET]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Download fallito' },
            { status: 500 }
        );
    }
}

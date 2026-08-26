/**
 * API v1 Contabilità — alert fatture fioristi mancanti.
 * Auth: sessione dashboard admin oppure x-admin-key.
 */
import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { hasValidAdminApiKeyHeader } from '@/lib/auth/verbaleSyncAuth';
import {
    listFloristMissingInvoices,
    sendFloristInvoiceReminder,
} from '@/lib/financial/floristMissingInvoices';
import {
    dismissFloristMissingRow,
    linkFloristMissingExpense,
    linkFloristMissingOrder,
    updateFloristMissingRow,
    uploadFloristMissingReceipt,
} from '@/lib/financial/floristMissingInvoicesMutations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_RECEIPT = /\.(pdf|png|jpe?g|webp)$/i;
const MAX_BYTES = 12 * 1024 * 1024;

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

async function requireAccess(request: Request) {
    if (hasValidAdminApiKeyHeader(request.headers.get('x-admin-key'))) {
        return { ok: true as const };
    }
    return requireDashboardAdmin();
}

export async function GET(request: Request) {
    try {
        const access = await requireAccess(request);
        if (!access.ok) return access.response;
        const rows = await listFloristMissingInvoices();
        const critical = rows.filter((r) => r.severity === 'critical').length;
        return NextResponse.json({
            ok: true,
            rows,
            summary: { total: rows.length, critical, warning: rows.length - critical },
        });
    } catch (error) {
        console.error('[v1/florist-missing-invoices GET]', error);
        return jsonError(error instanceof Error ? error.message : 'Caricamento fallito', 500);
    }
}

export async function POST(request: Request) {
    try {
        const access = await requireAccess(request);
        if (!access.ok) return access.response;

        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('multipart/form-data')) {
            const form = await request.formData();
            const rowId = String(form.get('rowId') || '').trim();
            if (!rowId) return jsonError('rowId obbligatorio.', 400);
            const file = form.get('file');
            if (!(file instanceof Blob)) return jsonError('File scontrino obbligatorio.', 400);
            const blob = file as Blob & { name?: string };
            const fileName = blob.name || String(form.get('fileName') || 'scontrino.jpg');
            if (!ALLOWED_RECEIPT.test(fileName)) {
                return jsonError('Formato non supportato (JPEG, PNG, PDF, WebP).', 400);
            }
            if (blob.size > MAX_BYTES) return jsonError('Allegato troppo grande (max 12 MB).', 400);
            const result = await uploadFloristMissingReceipt({
                rowId,
                buffer: Buffer.from(await blob.arrayBuffer()),
                fileName,
                contentType: blob.type || 'application/octet-stream',
            });
            return NextResponse.json({ ok: true, message: 'Scontrino allegato e salvato.', ...result });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const action = String(body?.action || '');
        if (!action) return jsonError('Azione mancante.', 400);

        if (action === 'link_order') {
            const linked = await linkFloristMissingOrder({
                bankLineId: body?.bankLineId as string | undefined,
                documentId: body?.documentId as string | undefined,
                orderId: String(body?.orderId || ''),
                rowId: body?.rowId as string | undefined,
            });
            return NextResponse.json({
                ok: true,
                message: `Ordine ${linked.orderNumber || linked.orderId} associato e salvato.`,
                ...linked,
            });
        }
        if (action === 'link_expense') {
            const linked = await linkFloristMissingExpense({
                rowId: String(body?.rowId || ''),
                expenseId: String(body?.expenseId || ''),
            });
            return NextResponse.json({
                ok: true,
                message: 'Fattura passiva associata e salvata.',
                ...linked,
            });
        }
        if (action === 'update') {
            await updateFloristMissingRow({
                rowId: String(body?.rowId || ''),
                paymentDate: body?.paymentDate as string | undefined,
                amountCents: body?.amountCents as number | undefined,
                partnerId: body?.partnerId as string | null | undefined,
                notes: body?.notes as string | null | undefined,
                orderId: body?.orderId as string | null | undefined,
            });
            return NextResponse.json({ ok: true, message: 'Riga aggiornata.' });
        }
        if (action === 'dismiss' || action === 'delete') {
            await dismissFloristMissingRow(String(body?.rowId || ''));
            return NextResponse.json({ ok: true, message: 'Riga archiviata.' });
        }
        if (action === 'remind') {
            const result = await sendFloristInvoiceReminder({
                rowId: String(body?.rowId || 'unknown'),
                channel: (body?.channel as 'email' | 'whatsapp' | 'both') || 'both',
                partnerId: body?.partnerId as string | null | undefined,
                partnerEmail: body?.partnerEmail as string | null | undefined,
                partnerWhatsapp: body?.partnerWhatsapp as string | null | undefined,
                partnerName: String(body?.partnerName || ''),
                amountCents: Number(body?.amountCents || 0),
                paymentDate: String(body?.paymentDate || ''),
                daysSincePayment: Number(body?.daysSincePayment ?? 0),
                orderNumber: body?.orderNumber as string | null | undefined,
            });
            if (!result.ok) {
                return NextResponse.json(
                    { ok: false, error: result.error || 'Sollecito non inviato', sent: result.sent },
                    { status: 502 }
                );
            }
            return NextResponse.json({
                ok: true,
                sent: result.sent,
                message: `Sollecito inviato via ${result.sent.join(' + ')}`,
            });
        }
        return jsonError('Azione non supportata.', 400);
    } catch (error) {
        console.error('[v1/florist-missing-invoices POST]', error);
        return jsonError(error instanceof Error ? error.message : 'Operazione fallita', 500);
    }
}

export async function PATCH(request: Request) {
    try {
        const access = await requireAccess(request);
        if (!access.ok) return access.response;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const rowId = String(body?.rowId || '').trim();
        if (!rowId) return jsonError('rowId obbligatorio.', 400);
        await updateFloristMissingRow({
            rowId,
            paymentDate: body?.paymentDate as string | undefined,
            amountCents: body?.amountCents as number | undefined,
            partnerId: body?.partnerId as string | null | undefined,
            notes: body?.notes as string | null | undefined,
            orderId: body?.orderId as string | null | undefined,
        });
        return NextResponse.json({ ok: true, message: 'Riga aggiornata.' });
    } catch (error) {
        console.error('[v1/florist-missing-invoices PATCH]', error);
        return jsonError(error instanceof Error ? error.message : 'Aggiornamento fallito', 500);
    }
}

export async function DELETE(request: Request) {
    try {
        const access = await requireAccess(request);
        if (!access.ok) return access.response;
        const url = new URL(request.url);
        let rowId = url.searchParams.get('rowId')?.trim() || '';
        if (!rowId) {
            const body = (await request.json().catch(() => null)) as { rowId?: string } | null;
            rowId = String(body?.rowId || '').trim();
        }
        if (!rowId) return jsonError('rowId obbligatorio.', 400);
        await dismissFloristMissingRow(rowId);
        return NextResponse.json({ ok: true, message: 'Riga archiviata.' });
    } catch (error) {
        console.error('[v1/florist-missing-invoices DELETE]', error);
        return jsonError(error instanceof Error ? error.message : 'Eliminazione fallita', 500);
    }
}

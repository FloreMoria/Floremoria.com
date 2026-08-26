import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { sendFloristInvoiceReminder } from '@/lib/financial/floristMissingInvoices';
import {
    listFloristCompensationRegister,
    isFloristDocStatus,
} from '@/lib/financial/floristCompensationRegister';
import {
    dismissFloristMissingRow,
    linkFloristMissingExpense,
    linkFloristMissingOrder,
    setFloristDocStatus,
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

export async function GET() {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const rows = await listFloristCompensationRegister();
        const byStatus = {
            WAITING_INVOICE: 0,
            INVOICE_ASSOCIATED: 0,
            RECEIPT_ASSOCIATED: 0,
            NOT_DUE: 0,
            CANCELLED: 0,
        };
        for (const r of rows) {
            byStatus[r.docStatus] += 1;
        }
        return NextResponse.json({
            ok: true,
            rows,
            summary: {
                total: rows.length,
                waiting: byStatus.WAITING_INVOICE,
                invoiceAssociated: byStatus.INVOICE_ASSOCIATED,
                receiptAssociated: byStatus.RECEIPT_ASSOCIATED,
                notDue: byStatus.NOT_DUE,
                cancelled: byStatus.CANCELLED,
                critical: rows.filter(
                    (r) => r.docStatus === 'WAITING_INVOICE' && r.daysSinceOrder >= 15
                ).length,
                byStatus,
            },
        });
    } catch (error) {
        console.error('[florist-missing-invoices GET]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Caricamento registro fallito',
            500
        );
    }
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('multipart/form-data')) {
            const form = await request.formData();
            const action = String(form.get('action') || 'upload_receipt');
            const rowId = String(form.get('rowId') || '').trim();
            if (!rowId) return jsonError('rowId obbligatorio.', 400);

            if (action === 'upload_receipt') {
                const file = form.get('file');
                if (!(file instanceof Blob)) {
                    return jsonError('File scontrino obbligatorio.', 400);
                }
                const blob = file as Blob & { name?: string };
                const fileName = blob.name || String(form.get('fileName') || 'scontrino.jpg');
                if (!ALLOWED_RECEIPT.test(fileName)) {
                    return jsonError('Formato non supportato (JPEG, PNG, PDF, WebP).', 400);
                }
                if (blob.size > MAX_BYTES) {
                    return jsonError('Allegato troppo grande (max 12 MB).', 400);
                }
                const result = await uploadFloristMissingReceipt({
                    rowId,
                    buffer: Buffer.from(await blob.arrayBuffer()),
                    fileName,
                    contentType: blob.type || 'application/octet-stream',
                });
                return NextResponse.json({
                    ok: true,
                    message: 'Scontrino fiscale salvato in Contabilità (stato: Scontrino Associato).',
                    ...result,
                });
            }
            return jsonError('Azione multipart non supportata.', 400);
        }

        const body = (await request.json().catch(() => null)) as {
            action?: string;
            channel?: 'email' | 'whatsapp' | 'both';
            rowId?: string;
            partnerId?: string | null;
            partnerEmail?: string | null;
            partnerWhatsapp?: string | null;
            partnerName?: string;
            amountCents?: number;
            paymentDate?: string;
            daysSincePayment?: number;
            orderNumber?: string | null;
            bankLineId?: string;
            documentId?: string;
            orderId?: string;
            expenseId?: string;
            notes?: string | null;
            docStatus?: string;
        } | null;

        if (!body?.action) {
            return jsonError('Azione mancante.', 400);
        }

        if (body.action === 'set_doc_status') {
            const rowId = String(body.rowId || '').trim();
            const docStatus = body.docStatus;
            if (!rowId || !isFloristDocStatus(docStatus)) {
                return jsonError('rowId e docStatus validi obbligatori.', 400);
            }
            const updated = await setFloristDocStatus({ rowId, docStatus });
            return NextResponse.json({
                ok: true,
                message: 'Stato documento aggiornato.',
                ...updated,
            });
        }

        if (body.action === 'link_order') {
            const orderId = String(body.orderId || '').trim();
            if (!orderId) return jsonError('orderId obbligatorio.', 400);
            const linked = await linkFloristMissingOrder({
                bankLineId: body.bankLineId,
                documentId: body.documentId,
                orderId,
                rowId: body.rowId,
            });
            return NextResponse.json({
                ok: true,
                message: `Ordine ${linked.orderNumber || linked.orderId} associato e salvato.`,
                ...linked,
            });
        }

        if (body.action === 'link_expense') {
            const rowId = String(body.rowId || '').trim();
            const expenseId = String(body.expenseId || '').trim();
            if (!rowId || !expenseId) {
                return jsonError('rowId e expenseId obbligatori.', 400);
            }
            const linked = await linkFloristMissingExpense({ rowId, expenseId });
            return NextResponse.json({
                ok: true,
                message: 'Fattura passiva associata e salvata.',
                ...linked,
            });
        }

        if (body.action === 'update') {
            const rowId = String(body.rowId || '').trim();
            if (!rowId) return jsonError('rowId obbligatorio.', 400);
            await updateFloristMissingRow({
                rowId,
                paymentDate: body.paymentDate,
                amountCents: body.amountCents,
                partnerId: body.partnerId,
                notes: body.notes,
                orderId: body.orderId,
            });
            return NextResponse.json({ ok: true, message: 'Riga aggiornata.' });
        }

        if (body.action === 'dismiss' || body.action === 'delete') {
            const rowId = String(body.rowId || '').trim();
            if (!rowId) return jsonError('rowId obbligatorio.', 400);
            await dismissFloristMissingRow(rowId);
            return NextResponse.json({ ok: true, message: 'Riga archiviata.' });
        }

        if (body.action !== 'remind') {
            return jsonError(
                'Azione non supportata (remind | link_order | link_expense | update | set_doc_status | dismiss).',
                400
            );
        }
        if (!body.partnerName || !body.paymentDate || body.amountCents == null) {
            return jsonError('Dati sollecito incompleti.', 400);
        }
        const channel = body.channel || 'both';
        if (!['email', 'whatsapp', 'both'].includes(channel)) {
            return jsonError('Canale non valido.', 400);
        }

        const result = await sendFloristInvoiceReminder({
            rowId: body.rowId || 'unknown',
            channel,
            partnerId: body.partnerId,
            partnerEmail: body.partnerEmail,
            partnerWhatsapp: body.partnerWhatsapp,
            partnerName: body.partnerName,
            amountCents: body.amountCents,
            paymentDate: body.paymentDate,
            daysSincePayment: body.daysSincePayment ?? 0,
            orderNumber: body.orderNumber,
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
            warning: result.error,
            message: `Sollecito inviato via ${result.sent.join(' + ')}`,
        });
    } catch (error) {
        console.error('[florist-missing-invoices POST]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Operazione fallita',
            500
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const body = (await request.json().catch(() => null)) as {
            rowId?: string;
            paymentDate?: string;
            amountCents?: number;
            partnerId?: string | null;
            notes?: string | null;
            orderId?: string | null;
        } | null;

        const rowId = String(body?.rowId || '').trim();
        if (!rowId) return jsonError('rowId obbligatorio.', 400);

        await updateFloristMissingRow({
            rowId,
            paymentDate: body?.paymentDate,
            amountCents: body?.amountCents,
            partnerId: body?.partnerId,
            notes: body?.notes,
            orderId: body?.orderId,
        });

        return NextResponse.json({ ok: true, message: 'Riga aggiornata.' });
    } catch (error) {
        console.error('[florist-missing-invoices PATCH]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Aggiornamento fallito',
            500
        );
    }
}

export async function DELETE(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

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
        console.error('[florist-missing-invoices DELETE]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Eliminazione fallita',
            500
        );
    }
}

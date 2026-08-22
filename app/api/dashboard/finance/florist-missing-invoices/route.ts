import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';
import {
    listFloristMissingInvoices,
    sendFloristInvoiceReminder,
} from '@/lib/financial/floristMissingInvoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

export async function GET() {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const rows = await listFloristMissingInvoices();
        const critical = rows.filter((r) => r.severity === 'critical').length;
        return NextResponse.json({
            ok: true,
            rows,
            summary: {
                total: rows.length,
                critical,
                warning: rows.length - critical,
            },
        });
    } catch (error) {
        console.error('[florist-missing-invoices GET]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Caricamento alert fallito',
            500
        );
    }
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

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
        } | null;

        if (!body?.action) {
            return jsonError('Azione mancante.', 400);
        }

        if (body.action === 'link_order') {
            const bankLineId = String(body.bankLineId || '').trim();
            const documentId = String(body.documentId || '').trim();
            const orderId = String(body.orderId || '').trim();
            if (!bankLineId || !documentId || !orderId) {
                return jsonError('bankLineId, documentId e orderId sono obbligatori.', 400);
            }

            const order = await prisma.order.findUnique({
                where: { id: orderId },
                select: { id: true, orderNumber: true },
            });
            if (!order) return jsonError('Ordine non trovato.', 404);

            const line = await prisma.bankStatementLine.findFirst({
                where: { id: bankLineId, documentId },
            });
            if (!line) return jsonError('Movimento bancario non trovato.', 404);

            await prisma.bankStatementLine.update({
                where: { id: bankLineId },
                data: {
                    matchedOrderId: order.id,
                    matchStatus: 'MATCHED',
                    matchType: line.matchType || 'FLORIST_TRANSFER',
                    matchScore: 100,
                    matchNotes: `Ordine associato da Contabilità: ${order.orderNumber || order.id}`,
                },
            });

            return NextResponse.json({
                ok: true,
                message: `Ordine ${order.orderNumber || order.id} associato al pagamento.`,
                orderId: order.id,
                orderNumber: order.orderNumber,
            });
        }

        if (body.action !== 'remind') {
            return jsonError('Azione non supportata (usa "remind" o "link_order").', 400);
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

import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
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
        } | null;

        if (!body || body.action !== 'remind') {
            return jsonError('Azione non supportata (usa action: "remind").', 400);
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
            error instanceof Error ? error.message : 'Sollecito fallito',
            500
        );
    }
}

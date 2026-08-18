import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Redirect / stream PDF fattura commissioni Stripe.
 * GET /api/dashboard/finance/stripe-invoices/[id]/pdf
 */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { id } = await context.params;
        const inv = await prisma.stripeServiceInvoice.findUnique({ where: { id } });
        if (!inv) {
            return NextResponse.json({ ok: false, error: 'Fattura non trovata' }, { status: 404 });
        }

        const url = inv.localPdfPath || inv.invoicePdfUrl || inv.hostedInvoiceUrl;
        if (!url) {
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        'PDF non disponibile via API. Scaricalo da Stripe Dashboard → Settings → Documents.',
                },
                { status: 404 }
            );
        }

        return NextResponse.redirect(url);
    } catch (error) {
        console.error('[stripe-invoice-pdf]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore PDF' },
            { status: 500 }
        );
    }
}

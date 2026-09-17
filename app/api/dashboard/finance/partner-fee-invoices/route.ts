import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { recomputePartnerFeeMonthClose } from '@/lib/partners/partnerFeeMonthClose';

export const dynamic = 'force-dynamic';

/** GET: chiusure mensili fee master (C14) + masters. */
export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const url = new URL(request.url);
        const yearMonth = url.searchParams.get('yearMonth')?.trim();
        const closes = await prisma.partnerFeeMonthClose.findMany({
            where: yearMonth ? { yearMonth } : undefined,
            include: {
                masterPartner: { select: { id: true, shopName: true, uniqueCode: true } },
            },
            orderBy: [{ yearMonth: 'desc' }, { masterPartnerId: 'asc' }],
            take: 100,
        });
        const masters = await prisma.partner.findMany({
            where: { deletedAt: null, partnerType: 'AGGREGATOR' },
            select: { id: true, shopName: true, uniqueCode: true },
            orderBy: { shopName: 'asc' },
        });
        return NextResponse.json({
            masters,
            closes: closes.map((c) => ({
                id: c.id,
                masterPartnerId: c.masterPartnerId,
                masterPartnerName: c.masterPartner.shopName,
                yearMonth: c.yearMonth,
                maturedCents: c.maturedCents,
                maturedTaxableCents: c.maturedTaxableCents,
                maturedVatCents: c.maturedVatCents,
                invoiceCents: c.invoiceCents,
                connectCents: c.connectCents,
                status: c.status,
                exceptionNote: c.exceptionNote,
            })),
        });
    } catch (e) {
        console.error('[partner-fee-invoices]', e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 'Lettura fatture fee partner fallita.' }, { status: 500 });
    }
}

type PostBody = {
    masterPartnerId?: string;
    yearMonth?: string;
    invoiceCents?: number | null;
    connectCents?: number | null;
};

/** POST: registra / aggiorna fattura mensile master → ricalcolo C14. */
export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = (await request.json()) as PostBody;
        const masterPartnerId = body.masterPartnerId?.trim();
        const yearMonth = body.yearMonth?.trim();
        if (!masterPartnerId || !yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
            return NextResponse.json(
                { error: 'masterPartnerId e yearMonth (YYYY-MM) obbligatori.' },
                { status: 400 }
            );
        }
        const snap = await recomputePartnerFeeMonthClose({
            masterPartnerId,
            yearMonth,
            invoiceCents: body.invoiceCents === undefined ? undefined : body.invoiceCents,
            connectCents: body.connectCents === undefined ? undefined : body.connectCents,
        });
        return NextResponse.json({ ok: true, snapshot: snap });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[partner-fee-invoices] POST', msg);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}

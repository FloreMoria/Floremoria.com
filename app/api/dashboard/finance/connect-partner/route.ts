import { NextResponse } from 'next/server';
import {
    listConnectPartnerCharges,
    recordConnectPartnerCharge,
    summarizeConnectPartnerChannel,
} from '@/lib/financial/connectPartnerChannel';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET: elenco + summary canale Connect partner. */
export async function GET(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const url = new URL(request.url);
        const masterPartnerId = url.searchParams.get('masterPartnerId')?.trim() || undefined;
        const [summary, charges, masters] = await Promise.all([
            summarizeConnectPartnerChannel(),
            listConnectPartnerCharges({ masterPartnerId }),
            prisma.partner.findMany({
                where: { deletedAt: null, partnerType: 'AGGREGATOR' },
                select: { id: true, shopName: true, uniqueCode: true },
                orderBy: { shopName: 'asc' },
            }),
        ]);
        return NextResponse.json({
            summary,
            masters,
            charges: charges.map((c) => ({
                id: c.id,
                orderNumber: c.orderNumber,
                orderId: c.orderId,
                masterPartnerId: c.masterPartnerId,
                masterPartnerName: c.masterPartner.shopName,
                accountingDate: c.accountingDate.toISOString().slice(0, 10),
                grossCents: c.grossCents,
                partnerFeeCents: c.partnerFeeCents,
                partnerFeeTaxableCents: c.partnerFeeTaxableCents,
                partnerFeeVatCents: c.partnerFeeVatCents,
                stripeFeeCents: c.stripeFeeCents,
                netCents: c.netCents,
                payoutStatus: c.payoutStatus,
                source: c.source,
                externalChargeId: c.externalChargeId,
                externalPayoutId: c.externalPayoutId,
                notes: c.notes,
            })),
        });
    } catch (e) {
        console.error('[connect-partner]', e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 'Lettura canale Connect fallita.' }, { status: 500 });
    }
}

type PostBody = {
    orderNumber?: string;
    orderId?: string;
    masterPartnerId?: string;
    accountingDate?: string;
    grossCents?: number;
    partnerFeeCents?: number;
    partnerFeeTaxableCents?: number;
    partnerFeeVatCents?: number;
    stripeFeeCents?: number;
    externalChargeId?: string;
    externalPayoutId?: string;
    notes?: string;
};

/**
 * POST: inserimento manuale (stessi campi della futura sync API).
 * Corrispettivo = lordo; fee partner IVA 22%; fee Stripe distinta; netto = trasferimento atteso.
 */
export async function POST(request: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = (await request.json()) as PostBody;
        const orderNumber = body.orderNumber?.trim();
        const masterPartnerId = body.masterPartnerId?.trim();
        if (!orderNumber || !masterPartnerId) {
            return NextResponse.json(
                { error: 'orderNumber e masterPartnerId obbligatori.' },
                { status: 400 }
            );
        }
        const grossCents = Number(body.grossCents);
        const partnerFeeCents = Number(body.partnerFeeCents);
        const stripeFeeCents = Number(body.stripeFeeCents);
        let taxable = body.partnerFeeTaxableCents;
        let vat = body.partnerFeeVatCents;
        if (taxable == null || vat == null) {
            // Scomposizione IVA 22% half-up sul lordo fee
            taxable = Math.round(partnerFeeCents / 1.22);
            vat = partnerFeeCents - taxable;
        }

        const accountingDate = body.accountingDate
            ? new Date(`${body.accountingDate}T12:00:00.000Z`)
            : new Date();

        const result = await recordConnectPartnerCharge({
            orderNumber,
            orderId: body.orderId?.trim() || null,
            masterPartnerId,
            accountingDate,
            grossCents,
            partnerFeeCents,
            partnerFeeTaxableCents: Number(taxable),
            partnerFeeVatCents: Number(vat),
            stripeFeeCents,
            externalChargeId: body.externalChargeId,
            externalPayoutId: body.externalPayoutId,
            notes: body.notes,
            source: 'MANUAL',
        });

        return NextResponse.json({
            ok: true,
            ...result,
            message:
                'Registrato: corrispettivo lordo + fee partner (IVA 22%) + fee Stripe + payout Fineco atteso.',
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[connect-partner] POST', msg);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}

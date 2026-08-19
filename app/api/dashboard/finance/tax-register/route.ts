import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import {
    buildTaxRegisterReport,
    patchTaxRegisterRow,
} from '@/lib/financial/taxRegister';
import type { FinancePeriodMode } from '@/lib/financial/financePeriod';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/dashboard/finance/tax-register?year=2026&mode=quarter|quadrimester&quarter=3&quadrimester=2
 */
export async function GET(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const year = Number(searchParams.get('year') || new Date().getFullYear());
        const mode = (searchParams.get('mode') || 'quarter') as FinancePeriodMode;
        const quarter = searchParams.get('quarter')
            ? Number(searchParams.get('quarter'))
            : null;
        const quadrimester = searchParams.get('quadrimester')
            ? Number(searchParams.get('quadrimester'))
            : null;

        if (!Number.isFinite(year) || year < 2020 || year > 2100) {
            return NextResponse.json({ ok: false, error: 'Anno non valido' }, { status: 400 });
        }

        const report = await buildTaxRegisterReport({
            year,
            mode,
            quarter,
            quadrimester,
        });

        return NextResponse.json({ ok: true, report });
    } catch (error) {
        console.error('[tax-register GET]', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Errore registro' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/dashboard/finance/tax-register
 * Body: { orderId, floristCompensationCents?, floristVatRate?, floristSettlementStatus?,
 *         accessoryAmountCents?, financeNotes?, paymentMethodLabel? }
 */
export async function PATCH(request: NextRequest) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const body = (await request.json()) as Record<string, unknown>;
        const orderId = String(body.orderId || '').trim();
        if (!orderId) {
            return NextResponse.json({ ok: false, error: 'orderId obbligatorio' }, { status: 400 });
        }

        const row = await patchTaxRegisterRow({
            orderId,
            floristCompensationCents:
                body.floristCompensationCents === undefined
                    ? undefined
                    : body.floristCompensationCents === null
                      ? null
                      : Number(body.floristCompensationCents),
            floristVatRate:
                body.floristVatRate === undefined
                    ? undefined
                    : body.floristVatRate === null
                      ? null
                      : Number(body.floristVatRate),
            floristSettlementStatus:
                body.floristSettlementStatus === undefined
                    ? undefined
                    : body.floristSettlementStatus == null
                      ? null
                      : String(body.floristSettlementStatus),
            accessoryAmountCents:
                body.accessoryAmountCents === undefined
                    ? undefined
                    : body.accessoryAmountCents === null
                      ? null
                      : Number(body.accessoryAmountCents),
            financeNotes:
                body.financeNotes === undefined
                    ? undefined
                    : body.financeNotes == null
                      ? null
                      : String(body.financeNotes),
            paymentMethodLabel:
                body.paymentMethodLabel === undefined
                    ? undefined
                    : body.paymentMethodLabel == null
                      ? null
                      : String(body.paymentMethodLabel),
        });

        return NextResponse.json({ ok: true, row });
    } catch (error) {
        console.error('[tax-register PATCH]', error);
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : 'Errore salvataggio',
            },
            { status: 400 }
        );
    }
}

/**
 * Quadratura wallet Stripe / PayPal — entrate vs tutte le uscite (fee, payout, SaaS, rimborsi).
 */
import type { GatewaySyncRow } from '@/lib/financial/gatewaySyncRows';

const TOLERANCE_CENTS = 100; // €1 di tolleranza arrotondamenti

export type GatewayWalletQuadratura = {
    gateway: 'stripe' | 'paypal';
    /** Lordo incassi ordini (entrate commerciali). */
    entrateLordoCents: number;
    commissioniCents: number;
    payoutCents: number;
    rimborsiCents: number;
    /** Spese SaaS, carta PayPal, altre uscite non payout. */
    speseCents: number;
    totaleUsciteCents: number;
    /** Σ netCents di tutti i movimenti deduplicati (variazione wallet nel periodo). */
    saldoNettoMovimentiCents: number;
    /** entrateLordo − totaleUscite — deve coincidere con saldoNettoMovimenti. */
    saldoTeoricoCents: number;
    /** Scarto formula interna (0 = conti tornano). */
    quadraturaScartoCents: number;
    /** Saldo wallet da API (disponibile + in sospeso), se noto. */
    walletApiCents: number | null;
    /** walletApi − saldoNettoMovimenti (gap saldo iniziale pre-periodo o dati mancanti). */
    walletScartoCents: number | null;
    isQuadrato: boolean;
    rowCount: number;
};

export type GatewayQuadraturaResult = {
    from: string;
    stripe: GatewayWalletQuadratura;
    paypal: GatewayWalletQuadratura;
    isQuadrato: boolean;
};

function withinTolerance(cents: number): boolean {
    return Math.abs(cents) <= TOLERANCE_CENTS;
}

function computeGatewayWalletQuadratura(
    gateway: 'stripe' | 'paypal',
    rows: GatewaySyncRow[],
    walletApiCents: number | null
): GatewayWalletQuadratura {
    const gRows = rows.filter((r) => r.gateway === gateway);

    let entrateLordoCents = 0;
    let commissioniCents = 0;
    let payoutCents = 0;
    let rimborsiCents = 0;
    let speseCents = 0;
    let saldoNettoMovimentiCents = 0;

    for (const r of gRows) {
        saldoNettoMovimentiCents += Number(r.netCents || 0);

        switch (r.movementKind) {
            case 'incasso':
                if (r.grossCents > 0) {
                    entrateLordoCents += r.grossCents;
                    commissioniCents += Math.abs(r.feeCents || 0);
                } else {
                    speseCents += Math.abs(r.netCents || r.grossCents || 0);
                }
                break;
            case 'commissione':
                commissioniCents += Math.abs(r.grossCents || r.feeCents || 0);
                break;
            case 'payout':
                payoutCents += Math.abs(r.netCents || r.grossCents || 0);
                break;
            case 'rimborso':
                rimborsiCents += Math.abs(r.netCents || r.grossCents || 0);
                break;
            case 'altro':
            case 'riserva':
                if (r.netCents < 0 || r.grossCents < 0) {
                    speseCents += Math.abs(r.netCents || r.grossCents || 0);
                } else if (r.netCents > 0) {
                    entrateLordoCents += r.grossCents > 0 ? r.grossCents : r.netCents;
                }
                break;
            default:
                break;
        }
    }

    const totaleUsciteCents =
        commissioniCents + payoutCents + rimborsiCents + speseCents;
    const saldoTeoricoCents = entrateLordoCents - totaleUsciteCents;
    const quadraturaScartoCents = saldoNettoMovimentiCents - saldoTeoricoCents;
    const walletScartoCents =
        walletApiCents != null ? walletApiCents - saldoNettoMovimentiCents : null;

    const formulaOk = withinTolerance(quadraturaScartoCents);
    const walletOk =
        walletScartoCents == null ||
        walletApiCents === 0 ||
        withinTolerance(walletScartoCents);

    return {
        gateway,
        entrateLordoCents,
        commissioniCents,
        payoutCents,
        rimborsiCents,
        speseCents,
        totaleUsciteCents,
        saldoNettoMovimentiCents,
        saldoTeoricoCents,
        quadraturaScartoCents,
        walletApiCents,
        walletScartoCents,
        isQuadrato: formulaOk && walletOk,
        rowCount: gRows.length,
    };
}

export function computeGatewayQuadratura(input: {
    rows: GatewaySyncRow[];
    fromIso: string;
    stripeWalletCents?: number | null;
    paypalWalletCents?: number | null;
}): GatewayQuadraturaResult {
    const stripe = computeGatewayWalletQuadratura(
        'stripe',
        input.rows,
        input.stripeWalletCents ?? null
    );
    const paypal = computeGatewayWalletQuadratura(
        'paypal',
        input.rows,
        input.paypalWalletCents ?? null
    );

    return {
        from: input.fromIso,
        stripe,
        paypal,
        isQuadrato: stripe.isQuadrato && paypal.isQuadrato,
    };
}

export function formatQuadraturaEuro(cents: number): string {
    return `€${(cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

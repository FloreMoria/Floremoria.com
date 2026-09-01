/**
 * Quadratura wallet Stripe / PayPal — entrate vs uscite (fee, payout, SaaS, rimborsi)
 * con incrocio payout ↔ accrediti Fineco filtrati (solo gateway).
 */
import type { GatewaySyncRow } from '@/lib/financial/gatewaySyncRows';
import {
    isGatewayRelatedFinecoMovement,
    matchGatewayPayoutsToFineco,
    type GatewayBankLine,
    type GatewayBankMatchSummary,
} from '@/lib/financial/gatewayBankMatch';

const TOLERANCE_CENTS = 100; // €1 di tolleranza arrotondamenti

export type GatewayWalletQuadratura = {
    gateway: 'stripe' | 'paypal';
    /** Lordo incassi ordini (entrate commerciali). */
    entrateLordoCents: number;
    commissioniCents: number;
    payoutCents: number;
    /** Payout abbinati ad accrediti Fineco (se disponibili). */
    payoutFinecoCents: number;
    rimborsiCents: number;
    /** Spese SaaS, carta PayPal, altre uscite non payout (escluse provviste T0300). */
    speseCents: number;
    totaleUsciteCents: number;
    /** Σ netCents di tutti i movimenti deduplicati (variazione wallet nel periodo). */
    saldoNettoMovimentiCents: number;
    /** entrateLordo − totaleUscite — deve coincidere con saldoNettoMovimenti. */
    saldoTeoricoCents: number;
    /**
     * Chiusura Stripe: lordo − fee − rimborsi − payout Fineco.
     * Obiettivo ≈ 0 (salvo transazioni in elaborazione 24–48h).
     */
    residuoStripeCents: number | null;
    /** Scarto formula interna (0 = conti tornano). */
    quadraturaScartoCents: number;
    /** Saldo wallet da API (disponibile + in sospeso), se noto. */
    walletApiCents: number | null;
    /** walletApi − saldoNettoMovimenti (gap saldo iniziale pre-periodo o dati mancanti). */
    walletScartoCents: number | null;
    isQuadrato: boolean;
    rowCount: number;
    bankMatch: GatewayBankMatchSummary | null;
};

export type GatewayQuadraturaResult = {
    from: string;
    stripe: GatewayWalletQuadratura;
    paypal: GatewayWalletQuadratura;
    isQuadrato: boolean;
    /** Righe Fineco considerate nel matching (solo STRIPE/PAYPAL). */
    finecoGatewayLineCount: number;
};

function withinTolerance(cents: number): boolean {
    return Math.abs(cents) <= TOLERANCE_CENTS;
}

function computeGatewayWalletQuadratura(
    gateway: 'stripe' | 'paypal',
    rows: GatewaySyncRow[],
    walletApiCents: number | null,
    bankLines: GatewayBankLine[]
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
                // Fee Stripe già sommate sull'incasso padre; climate/regolazioni restano.
                if (gateway === 'stripe' && r.isTechnical) {
                    if (/climate|contributo stripe|network_cost/i.test(
                        `${r.movementLabel || ''} ${r.description || ''}`
                    )) {
                        commissioniCents += Math.abs(r.grossCents || r.feeCents || 0);
                    }
                    break;
                }
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

    const bankMatch =
        bankLines.length > 0
            ? matchGatewayPayoutsToFineco({
                  gateway,
                  payoutRows: gRows,
                  bankLines,
              })
            : null;

    const payoutFinecoCents =
        bankMatch?.finecoMatchedPayoutCents ??
        bankMatch?.finecoGatewayCreditCents ??
        payoutCents;

    const totaleUsciteCents =
        commissioniCents + payoutCents + rimborsiCents + speseCents;
    const saldoTeoricoCents = entrateLordoCents - totaleUsciteCents;
    const quadraturaScartoCents = saldoNettoMovimentiCents - saldoTeoricoCents;

    const residuoStripeCents =
        gateway === 'stripe'
            ? entrateLordoCents -
              commissioniCents -
              rimborsiCents -
              payoutFinecoCents
            : null;

    const walletScartoCents =
        walletApiCents != null ? walletApiCents - saldoNettoMovimentiCents : null;

    const formulaOk = withinTolerance(quadraturaScartoCents);
    const stripeBankOk =
        gateway !== 'stripe' ||
        residuoStripeCents == null ||
        withinTolerance(residuoStripeCents);
    const walletOk =
        walletScartoCents == null ||
        walletApiCents === 0 ||
        withinTolerance(walletScartoCents);

    return {
        gateway,
        entrateLordoCents,
        commissioniCents,
        payoutCents,
        payoutFinecoCents,
        rimborsiCents,
        speseCents,
        totaleUsciteCents,
        saldoNettoMovimentiCents,
        saldoTeoricoCents,
        residuoStripeCents,
        quadraturaScartoCents,
        walletApiCents,
        walletScartoCents,
        isQuadrato: formulaOk && stripeBankOk && walletOk,
        rowCount: gRows.length,
        bankMatch,
    };
}

export function computeGatewayQuadratura(input: {
    rows: GatewaySyncRow[];
    fromIso: string;
    stripeWalletCents?: number | null;
    paypalWalletCents?: number | null;
    bankLines?: GatewayBankLine[];
}): GatewayQuadraturaResult {
    const gatewayBankLines = (input.bankLines || []).filter((l) =>
        isGatewayRelatedFinecoMovement(l.description, l.amountCents)
    );

    const stripe = computeGatewayWalletQuadratura(
        'stripe',
        input.rows,
        input.stripeWalletCents ?? null,
        gatewayBankLines
    );
    const paypal = computeGatewayWalletQuadratura(
        'paypal',
        input.rows,
        input.paypalWalletCents ?? null,
        gatewayBankLines
    );

    return {
        from: input.fromIso,
        stripe,
        paypal,
        isQuadrato: stripe.isQuadrato && paypal.isQuadrato,
        finecoGatewayLineCount: gatewayBankLines.length,
    };
}

export function formatQuadraturaEuro(cents: number): string {
    return `€${(cents / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

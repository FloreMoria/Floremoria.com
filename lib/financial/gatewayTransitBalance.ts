/**
 * Confronto saldo conti di transito (Banca c/o Stripe / PayPal) vs saldo gateway reale.
 * Debug / baseline Fase 4 — non modifica dati.
 */

import Stripe from 'stripe';
import prisma from '@/lib/prisma';
import {
    ACCOUNT_BANCA_CO_PAYPAL,
    ACCOUNT_BANCA_CO_STRIPE,
    ACCOUNT_STRIPE_LEGACY,
    ACCOUNT_PAYPAL_LEGACY,
} from '@/lib/financial/chartOfAccounts';

export type GatewayTransitComparison = {
    stripe: {
        transitLedgerCents: number;
        gatewayAvailableCents: number | null;
        gatewayPendingCents: number | null;
        deltaCents: number | null;
        note: string;
    };
    paypal: {
        transitLedgerCents: number;
        gatewayAvailableCents: number | null;
        gatewayPendingCents: number | null;
        deltaCents: number | null;
        note: string;
    };
};

function accountMentionsTransit(meta: unknown, accountCodes: string[]): boolean {
    const m = (meta || {}) as Record<string, unknown>;
    const dare = String(m.dareAccount || '');
    const avere = String(m.avereAccount || '');
    return accountCodes.some((c) => dare.includes(c) || avere.includes(c));
}

/** Saldo “contabile” del wallet da metadata dare/avere. */
export async function sumTransitLedgerCents(accountCodes: string[]): Promise<number> {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null },
        select: { totalCents: true, metadataJson: true, sourceKey: true },
        take: 50000,
    });
    let balance = 0;
    for (const r of rows) {
        if (!accountMentionsTransit(r.metadataJson, accountCodes)) continue;
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        // Fuori gateway / legacy JSON non appartengono al transito vendite Stripe
        if (meta.fuoriGateway || meta.fuoriGatewayLegacyJson) continue;
        const dare = String(meta.dareAccount || '');
        const avere = String(meta.avereAccount || '');
        const dareIs = accountCodes.some((c) => dare.includes(c));
        const avereIs = accountCodes.some((c) => avere.includes(c));
        if (dareIs && !avereIs) balance += Math.abs(r.totalCents);
        else if (avereIs && !dareIs) balance -= Math.abs(r.totalCents);
    }
    return balance;
}

/**
 * Saldo del **solo** transito vendite Stripe, ancorato alle chiavi canoniche
 * `STRIPE_TX` / `FEE` / `REFUND` / `PAYOUT` (non MANUAL_INBOUND, non JSON, non PayPal).
 * Se `fiscalYear` è valorizzato, conta solo movimenti di quell’anno (flusso periodo).
 */
export async function sumStripeSalesTransitCents(fiscalYear?: number): Promise<number> {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            ...(fiscalYear != null ? { fiscalYear } : {}),
            OR: [
                { sourceKey: { startsWith: 'STRIPE_TX:' } },
                { sourceKey: { startsWith: 'STRIPE_FEE:' } },
                { sourceKey: { startsWith: 'STRIPE_REFUND:' } },
                { sourceKey: { startsWith: 'STRIPE_PAYOUT:' } },
            ],
        },
        select: { sourceKey: true, totalCents: true },
        take: 50000,
    });
    let balance = 0;
    for (const r of rows) {
        const abs = Math.abs(r.totalCents);
        if (r.sourceKey.startsWith('STRIPE_TX:')) balance += abs;
        else balance -= abs; // fee, refund, payout escono dal wallet
    }
    return balance;
}

/** Saldo conto di pagamento PayPal (spese / residuali / giroconti) — non transito vendite. */
export async function sumPaypalPaymentAccountCents(): Promise<number> {
    return sumTransitLedgerCents(['10200', 'Banca c/o PayPal', 'Conto PayPal']);
}

export async function compareGatewayTransitBalances(): Promise<GatewayTransitComparison> {
    const stripeTransit = await sumTransitLedgerCents(['10300', 'Banca c/o Stripe', 'Conto Stripe']);
    const paypalTransit = await sumTransitLedgerCents(['10200', 'Banca c/o PayPal', 'Conto PayPal']);
    let stripeAvail: number | null = null;
    let stripePending: number | null = null;
    let stripeNote = 'Saldo Stripe non disponibile';
    try {
        const key = process.env.STRIPE_SECRET_KEY?.trim();
        if (key) {
            const stripe = new Stripe(key, { apiVersion: '2023-10-16' as any });
            const bal = await stripe.balance.retrieve();
            stripeAvail = bal.available.find((b) => b.currency === 'eur')?.amount ?? 0;
            stripePending = bal.pending.find((b) => b.currency === 'eur')?.amount ?? 0;
            stripeNote = `Ledger transit (${ACCOUNT_BANCA_CO_STRIPE}) vs Stripe available — baseline Fase 4`;
        } else {
            stripeNote = 'STRIPE_SECRET_KEY assente';
        }
    } catch (e) {
        stripeNote = e instanceof Error ? e.message : 'Errore saldo Stripe';
    }

    return {
        stripe: {
            transitLedgerCents: stripeTransit,
            gatewayAvailableCents: stripeAvail,
            gatewayPendingCents: stripePending,
            deltaCents: stripeAvail == null ? null : stripeTransit - stripeAvail,
            note: stripeNote,
        },
        paypal: {
            transitLedgerCents: paypalTransit,
            gatewayAvailableCents: null,
            gatewayPendingCents: null,
            deltaCents: null,
            note: `Ledger transit (${ACCOUNT_BANCA_CO_PAYPAL} / ${ACCOUNT_PAYPAL_LEGACY}) — saldo API PayPal non wireato; baseline solo ledger`,
        },
    };
}

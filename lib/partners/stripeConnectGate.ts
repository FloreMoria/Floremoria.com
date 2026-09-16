/**
 * Verifica Stripe Connect per master partner prima di emettere chiavi live.
 * Se lo split fallisce a runtime: ordine resta creato, debito fee PENDING,
 * alert staff — mai secondo costo silenzioso.
 */
import Stripe from 'stripe';
import prisma from '@/lib/prisma';

export type StripeConnectVerification = {
    ok: boolean;
    accountId: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detail: string;
};

function stripeClient(): Stripe | null {
    const key =
        process.env.STRIPE_EU_SECRET_KEY?.trim() ||
        process.env.STRIPE_SECRET_KEY?.trim() ||
        '';
    if (!key || key.includes('SENSITIVE') || key.startsWith('sk_test_') && key.includes('***')) {
        return null;
    }
    try {
        return new Stripe(key);
    } catch {
        return null;
    }
}

export async function verifyPartnerStripeConnect(
    partnerId: string
): Promise<StripeConnectVerification> {
    const partner = await prisma.partner.findFirst({
        where: { id: partnerId, deletedAt: null },
        select: {
            id: true,
            shopName: true,
            partnerType: true,
            stripeConnectAccountId: true,
        },
    });
    if (!partner) {
        return {
            ok: false,
            accountId: null,
            chargesEnabled: false,
            payoutsEnabled: false,
            detail: 'Partner non trovato.',
        };
    }
    if (partner.partnerType !== 'AGGREGATOR') {
        return {
            ok: true,
            accountId: null,
            chargesEnabled: false,
            payoutsEnabled: false,
            detail: 'Connect richiesto solo per AGGREGATOR (agenzia può emettere chiavi senza Connect proprio).',
        };
    }
    if (!partner.stripeConnectAccountId?.trim()) {
        return {
            ok: false,
            accountId: null,
            chargesEnabled: false,
            payoutsEnabled: false,
            detail:
                'Account Stripe Connect non collegato sul master. Imposta stripeConnectAccountId prima delle chiavi live.',
        };
    }

    const stripe = stripeClient();
    if (!stripe) {
        return {
            ok: false,
            accountId: partner.stripeConnectAccountId,
            chargesEnabled: false,
            payoutsEnabled: false,
            detail: 'Chiave Stripe server non disponibile per verificare Connect.',
        };
    }

    try {
        const acct = await stripe.accounts.retrieve(partner.stripeConnectAccountId);
        const chargesEnabled = Boolean(acct.charges_enabled);
        const payoutsEnabled = Boolean(acct.payouts_enabled);
        const ok = chargesEnabled && payoutsEnabled;

        await prisma.partner.update({
            where: { id: partner.id },
            data: {
                stripeConnectChargesEnabled: chargesEnabled,
                stripeConnectPayoutsEnabled: payoutsEnabled,
                stripeConnectVerifiedAt: ok ? new Date() : null,
            },
        });

        return {
            ok,
            accountId: acct.id,
            chargesEnabled,
            payoutsEnabled,
            detail: ok
                ? `Connect OK: charges_enabled e payouts_enabled su ${acct.id}.`
                : `Connect non pronto su ${acct.id}: charges_enabled=${chargesEnabled}, payouts_enabled=${payoutsEnabled}.`,
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            ok: false,
            accountId: partner.stripeConnectAccountId,
            chargesEnabled: false,
            payoutsEnabled: false,
            detail: `Verifica Connect fallita: ${msg}`,
        };
    }
}

/**
 * Policy runtime se lo split Connect fallisce dopo create ordine:
 * - non annullare l'ordine
 * - non azzerare la fee maturata (debito resta PENDING)
 * - non registrare un secondo costo
 * - log + alert operativo
 */
export function connectSplitFailurePolicy(): {
    keepOrder: true;
    keepFeeDebtPending: true;
    doubleCostForbidden: true;
    staffAlertCode: 'PARTNER_CONNECT_SPLIT_FAILED';
    userMessage: string;
} {
    return {
        keepOrder: true,
        keepFeeDebtPending: true,
        doubleCostForbidden: true,
        staffAlertCode: 'PARTNER_CONNECT_SPLIT_FAILED',
        userMessage:
            'Pagamento partner registrato; trasferimento Connect non riuscito. Fee in debito PENDING — nessuna doppia contabilizzazione. Intervento staff richiesto.',
    };
}

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
        if (!stripeKey) {
            return NextResponse.json({ error: 'STRIPE_SECRET_KEY non configurata' }, { status: 500 });
        }

        const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });

        // 1. Recupero Saldo Stripe
        let stripeBalance = { availableCents: 0, pendingCents: 0 };
        try {
            const bal = await stripe.balance.retrieve();
            const eurAvailable = bal.available.find(b => b.currency === 'eur');
            const eurPending = bal.pending.find(b => b.currency === 'eur');
            stripeBalance = {
                availableCents: eurAvailable ? eurAvailable.amount : 0,
                pendingCents: eurPending ? eurPending.amount : 0
            };
        } catch (e) {
            console.error('[gateways-api] Errore recupero saldo Stripe:', e);
        }

        // 2. Recupero Ultime Sessioni di Checkout Stripe (per verificare tentativi e successi)
        let stripeTransactions: any[] = [];
        try {
            const sessions = await stripe.checkout.sessions.list({
                limit: 10,
                expand: ['data.payment_intent']
            });

            stripeTransactions = sessions.data.map(session => {
                const intent = session.payment_intent as Stripe.PaymentIntent | null;
                const lastError = intent?.last_payment_error?.message || null;
                
                return {
                    id: session.id,
                    orderNumber: session.metadata?.orderNumber || 'Carrello',
                    customerName: session.customer_details?.name || session.customer_email || 'Cliente ospite',
                    customerEmail: session.customer_details?.email || session.customer_email || '',
                    amountCents: session.amount_total || 0,
                    currency: session.currency?.toUpperCase() || 'EUR',
                    paymentStatus: session.payment_status, // 'paid', 'unpaid', 'no_payment_required'
                    status: session.status, // 'open', 'complete', 'expired'
                    errorMessage: lastError,
                    createdAt: new Date(session.created * 1000).toISOString()
                };
            });
        } catch (e) {
            console.error('[gateways-api] Errore recupero sessioni Stripe:', e);
        }

        // 3. Predisposizione PayPal
        const paypalClientId = process.env.PAYPAL_CLIENT_ID?.trim();
        const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
        const paypalMode = process.env.PAYPAL_MODE?.trim() || 'live';
        const isPaypalConfigured = !!(paypalClientId && paypalClientSecret);

        let paypalBalance = { availableCents: 0, pendingCents: 0 };
        let paypalTransactions: any[] = [];

        if (isPaypalConfigured) {
            try {
                // In futuro, qui andrà la chiamata OAuth2 e il fetching del saldo PayPal:
                // POST https://api-m.paypal.com/v1/oauth2/token
                // GET https://api-m.paypal.com/v1/reporting/balances
                // GET https://api-m.paypal.com/v1/reporting/transactions
                // Per ora, restituiamo valori pronti per l'integrazione
                paypalBalance = { availableCents: 0, pendingCents: 0 };
            } catch (e) {
                console.error('[gateways-api] Errore recupero dati PayPal:', e);
            }
        }

        // 2b. Recupero Movimenti Reali Stripe dal DB Locale (Contabilità al Centesimo)
        let dbTransactions: any[] = [];
        try {
            dbTransactions = await prisma.order.findMany({
                where: {
                    stripeTransactionId: { not: null },
                    deletedAt: null
                },
                select: {
                    id: true,
                    orderNumber: true,
                    createdAt: true,
                    grossAmount: true,
                    stripeFee: true,
                    netAmount: true,
                    stripeTransactionId: true,
                    buyerFullName: true,
                    buyerEmail: true
                },
                orderBy: { createdAt: 'desc' },
                take: 20
            });
        } catch (dbErr) {
            console.error('[gateways-api] Errore recupero movimenti Stripe da DB:', dbErr);
        }

        return NextResponse.json({
            ok: true,
            stripe: {
                configured: true,
                balance: stripeBalance,
                transactions: stripeTransactions,
                realTransactions: dbTransactions
            },
            paypal: {
                configured: isPaypalConfigured,
                mode: paypalMode,
                balance: paypalBalance,
                transactions: paypalTransactions
            }
        });
    } catch (error) {
        console.error('[gateways-api] Errore generale API:', error);
        return NextResponse.json({ error: 'Errore interno' }, { status: 500 });
    }
}

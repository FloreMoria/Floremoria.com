/**
 * Filtro «solo vendite» per il registro corrispettivi (METODO §8.4).
 * - PayPal: solo TX confermate dal report vendite HAYUM o agganciate a un ordine
 * - Gemelle PayPal/Stripe stesso giorno/importo: vince il canale confermato dal report
 * - Rimborsi Stripe (re_): esclusi come ricavo; charge interamente rimborsata esclusa
 */
import type { DossierExceptionRow } from '@/lib/financial/dossierAcquistiBuild';
import {
    italyDateKey,
    selectPaypalSalesConfirmed,
    loadPaypalSalesReportIndex,
} from '@/lib/financial/paypalSalesReport';

export type GatewayIncassoLike = {
    gateway: 'Stripe' | 'PayPal' | 'PayPal (via Stripe)';
    transactionId: string;
    grossCents: number;
    paymentDate: Date;
    orderId: string | null;
    channelBlob: string;
    isEu: boolean;
    linkIds: string[];
    payerName: string | null;
    email: string | null;
};

function normTx(id: string): string {
    return id.trim().toLowerCase();
}

function isStripeChannel(g: GatewayIncassoLike): boolean {
    return g.gateway === 'Stripe' || g.gateway === 'PayPal (via Stripe)';
}

function isStripeRefundTx(g: GatewayIncassoLike): boolean {
    if (!isStripeChannel(g)) return false;
    if (g.grossCents < 0) return true;
    const blob = `${g.transactionId} ${g.channelBlob}`.toLowerCase();
    return /\bre_/.test(blob) || /refund/.test(blob);
}

function stripeChargeKey(g: GatewayIncassoLike): string | null {
    // ch_xxx / py_xxx — chiave per abbinare refund
    const m = `${g.transactionId} ${g.channelBlob}`.match(/\b((?:ch|py)_[A-Za-z0-9]+)/);
    return m ? m[1].toLowerCase() : normTx(g.transactionId);
}

/**
 * Applica le regole §8.4 sul pool grezzo Stripe+PayPal prima della costruzione righe.
 */
export function filterGatewayIncassiForCorrispettivi(
    incassi: GatewayIncassoLike[]
): {
    kept: GatewayIncassoLike[];
    exceptions: DossierExceptionRow[];
    stats: {
        paypalExcludedNonSale: number;
        stripeExcludedTwin: number;
        stripeExcludedRefund: number;
        stripeExcludedFullyRefundedCharge: number;
    };
} {
    const exceptions: DossierExceptionRow[] = [];
    const stats = {
        paypalExcludedNonSale: 0,
        stripeExcludedTwin: 0,
        stripeExcludedRefund: 0,
        stripeExcludedFullyRefundedCharge: 0,
    };

    const paypal = incassi.filter((g) => g.gateway === 'PayPal');
    const stripe = incassi.filter((g) => isStripeChannel(g));

    // 1) PayPal: solo vendite report / ordine
    let paypalConfirmed = new Set<string>();
    try {
        loadPaypalSalesReportIndex();
        const sel = selectPaypalSalesConfirmed({
            movements: paypal.map((p) => ({
                transactionId: p.transactionId,
                grossCents: p.grossCents,
                paymentDate: p.paymentDate,
                orderId: p.orderId,
            })),
        });
        paypalConfirmed = sel.confirmedTxIds;
        for (const ex of sel.excluded) {
            stats.paypalExcludedNonSale += 1;
            exceptions.push({
                cosa: `PayPal ${ex.transactionId} · €${(Math.abs(ex.grossCents) / 100).toFixed(2)}`,
                dove: 'Corrispettivi · escluso (non vendita)',
                importoCents: Math.abs(ex.grossCents),
                perche: ex.reason,
            });
        }
    } catch (err) {
        console.warn(
            '[corrispettiviSalesFilter] Report PayPal non caricabile — fallback: solo PayPal con orderId',
            err instanceof Error ? err.message : err
        );
        for (const p of paypal) {
            if (p.orderId) paypalConfirmed.add(p.transactionId);
            else {
                stats.paypalExcludedNonSale += 1;
                exceptions.push({
                    cosa: `PayPal ${p.transactionId}`,
                    dove: 'Corrispettivi · escluso (non vendita)',
                    importoCents: Math.abs(p.grossCents),
                    perche: 'Report vendite PayPal assente: escluso movimento non agganciato a ordine',
                });
            }
        }
    }

    const paypalKept = paypal.filter(
        (p) => p.grossCents > 0 && paypalConfirmed.has(p.transactionId)
    );

    // 2) Stripe refunds: mai un secondo ricavo positivo
    const stripeRefunds = stripe.filter((s) => isStripeRefundTx(s));
    const stripeCharges = stripe.filter((s) => !isStripeRefundTx(s) && s.grossCents > 0);

    for (const r of stripeRefunds) {
        stats.stripeExcludedRefund += 1;
        exceptions.push({
            cosa: `Stripe rimborso ${r.transactionId} · €${(Math.abs(r.grossCents) / 100).toFixed(2)}`,
            dove: 'Corrispettivi · escluso (rimborso)',
            importoCents: Math.abs(r.grossCents),
            perche:
                'I rimborsi (re_) non sono corrispettivi: restano sulla gamba storno/rimborso, non come ricavo',
        });
    }

    // Charge interamente rimborsata stesso giorno (o stesso importo assoluto con refund collegato)
    const refundAbsByDate = new Map<string, number[]>();
    for (const r of stripeRefunds) {
        const date = italyDateKey(r.paymentDate);
        const list = refundAbsByDate.get(date) || [];
        list.push(Math.abs(r.grossCents));
        refundAbsByDate.set(date, list);
    }

    const stripeChargesNet: GatewayIncassoLike[] = [];
    for (const c of stripeCharges) {
        const date = italyDateKey(c.paymentDate);
        const list = refundAbsByDate.get(date);
        if (list) {
            const idx = list.findIndex((x) => x === c.grossCents);
            if (idx >= 0) {
                list.splice(idx, 1);
                stats.stripeExcludedFullyRefundedCharge += 1;
                exceptions.push({
                    cosa: `Stripe ${c.transactionId} · €${(c.grossCents / 100).toFixed(2)}`,
                    dove: 'Corrispettivi · escluso (addebito+rimborso)',
                    importoCents: c.grossCents,
                    perche:
                        'Addebito annullato da rimborso pari importo: non è una vendita (es. ordine cancellato)',
                });
                continue;
            }
        }
        stripeChargesNet.push(c);
    }

    // 3) Gemelle PayPal/Stripe: stesso giorno + stesso importo → vince PayPal se in report
    const paypalSlots = new Map<string, number>(); // date|cents → count
    for (const p of paypalKept) {
        const key = `${italyDateKey(p.paymentDate)}|${p.grossCents}`;
        paypalSlots.set(key, (paypalSlots.get(key) || 0) + 1);
    }

    const stripeKept: GatewayIncassoLike[] = [];
    for (const s of stripeChargesNet) {
        const key = `${italyDateKey(s.paymentDate)}|${s.grossCents}`;
        const n = paypalSlots.get(key) || 0;
        if (n > 0) {
            paypalSlots.set(key, n - 1);
            stats.stripeExcludedTwin += 1;
            exceptions.push({
                cosa: `Stripe ${s.transactionId} · €${(s.grossCents / 100).toFixed(2)}`,
                dove: 'Corrispettivi · escluso (gemella PayPal)',
                importoCents: s.grossCents,
                perche:
                    'Stesso giorno/importo già coperto da vendita PayPal nel report: la py_/ch_ è copia, non secondo ricavo',
            });
            continue;
        }
        stripeKept.push(s);
    }

    void stripeChargeKey; // reserved for future tighter refund linking

    return {
        kept: [...paypalKept, ...stripeKept],
        exceptions,
        stats,
    };
}

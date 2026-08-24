/**
 * Sanificazione Prima Nota: rimuove speculari lordo/netto PayPal, ricavi fittizi
 * su spese SaaS, e doppioni Stripe↔PayPal / GATEWAY↔MANUALE.
 * Solo reversedAt — mai DELETE su FinancialLedgerEntry.
 */

import prisma from '@/lib/prisma';
import {
    LEDGER_PAYPAL_ACCOUNT,
    LEDGER_STRIPE_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { isSaasPaypalDescription } from '@/lib/financial/paypalClassify';
import { sanitizePaypalLedgerDuplicates } from '@/lib/financial/paypalLedgerSanitize';

export type DoubleEntrySanitizeResult = {
    paypalDedup: Awaited<ReturnType<typeof sanitizePaypalLedgerDuplicates>>;
    saasCategoryFixed: number;
    accountsPatched: number;
    reversedSpecular: number;
    reversedNetMirrors: number;
    reversedGatewayDupes: number;
    reversedManualFees: number;
    reversedOrders: number;
};

function asMeta(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function isGenericPaypalDesc(description: string): boolean {
    const d = (description || '').trim();
    return /^paypal\s+[A-Z0-9]+$/i.test(d) || /^paypal$/i.test(d);
}

const SAAS_ACCOUNT = '70900 - Spese operative/SaaS';
const FEE_ACCOUNT = '70200 - Oneri bancari / Fee gateway';
const REVENUE_ACCOUNT = '60100 - Ricavi da Vendite';

/**
 * Sanifica anomalie partita doppia (PayPal netti, Google One, dedup gateway).
 */
export async function sanitizeLedgerDoubleEntryAnomalies(): Promise<DoubleEntrySanitizeResult> {
    const paypalDedup = await sanitizePaypalLedgerDuplicates();
    const now = new Date();

    const result: DoubleEntrySanitizeResult = {
        paypalDedup,
        saasCategoryFixed: 0,
        accountsPatched: 0,
        reversedSpecular: 0,
        reversedNetMirrors: 0,
        reversedGatewayDupes: 0,
        reversedManualFees: 0,
        reversedOrders: 0,
    };

    const paypalRows = await prisma.financialLedgerEntry.findMany({
        where: { sourceType: 'PAYPAL_MOVEMENT', reversedAt: null },
        select: {
            id: true,
            sourceKey: true,
            category: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            metadataJson: true,
            orderId: true,
        },
        take: 8000,
    });

    const reverseIds = new Set<string>();
    const softReverse = async (ids: string[], reason: string) => {
        const unique = [...new Set(ids)].filter((id) => id && !reverseIds.has(id));
        if (!unique.length) return 0;
        // Annotazione motivo su metadati (best-effort) poi soft-reverse
        for (const id of unique) {
            try {
                const row = await prisma.financialLedgerEntry.findUnique({
                    where: { id },
                    select: { metadataJson: true, reversedAt: true },
                });
                if (!row || row.reversedAt) continue;
                await prisma.financialLedgerEntry.update({
                    where: { id },
                    data: {
                        reversedAt: now,
                        metadataJson: {
                            ...asMeta(row.metadataJson),
                            sanitizeReason: reason,
                            sanitizedAt: now.toISOString(),
                        },
                    },
                });
                reverseIds.add(id);
            } catch {
                /* unique race — skip */
            }
        }
        return unique.filter((id) => reverseIds.has(id)).length;
    };

    // 1) Google One / SaaS: categoria SPESE_SAAS + conti 70900/10200
    for (const r of paypalRows) {
        if (r.totalCents >= 0) continue;
        if (!isSaasPaypalDescription(r.description) && r.category !== 'SPESE_SAAS') {
            continue;
        }
        if (!isSaasPaypalDescription(r.description) && r.category === 'SPESE_SAAS') {
            // già classificato
        }
        const needsCat =
            isSaasPaypalDescription(r.description) && r.category !== 'SPESE_SAAS';
        const meta = asMeta(r.metadataJson);
        await prisma.financialLedgerEntry.update({
            where: { id: r.id },
            data: {
                category: 'SPESE_SAAS',
                direction: 'USCITA',
                metadataJson: {
                    ...meta,
                    dareAccount: SAAS_ACCOUNT,
                    avereAccount: LEDGER_PAYPAL_ACCOUNT,
                    ledgerAccountFixed: true,
                },
            },
        });
        if (needsCat) result.saasCategoryFixed += 1;
        result.accountsPatched += 1;
    }

    // Ricarica PayPal attivi dopo patch categorie
    const paypalActive = await prisma.financialLedgerEntry.findMany({
        where: { sourceType: 'PAYPAL_MOVEMENT', reversedAt: null },
        select: {
            id: true,
            sourceKey: true,
            category: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            metadataJson: true,
            orderId: true,
        },
        take: 8000,
    });

    // 2) Speculare positivo vs uscita SaaS stesso giorno/importo
    const saasDebits = paypalActive.filter(
        (r) =>
            r.totalCents < 0 &&
            (r.category === 'SPESE_SAAS' || isSaasPaypalDescription(r.description))
    );
    const specularIds: string[] = [];
    for (const debit of saasDebits) {
        const abs = Math.abs(debit.totalCents);
        const day = dayKey(debit.accountingDate);
        for (const credit of paypalActive) {
            if (credit.id === debit.id) continue;
            if (credit.totalCents !== abs) continue;
            if (dayKey(credit.accountingDate) !== day) continue;
            if (credit.category === 'RICAVI_VENDITE' || isGenericPaypalDesc(credit.description)) {
                specularIds.push(credit.id);
            }
        }
    }
    result.reversedSpecular += await softReverse(specularIds, 'saas_specular_credit');

    // 3) Net mirrors: per ogni TX con fee in metadata, storno ±net generici
    const netMirrorIds: string[] = [];
    for (const tx of paypalActive) {
        if (!tx.sourceKey.startsWith('PAYPAL_TX:')) continue;
        if (tx.totalCents <= 0) continue;
        const meta = asMeta(tx.metadataJson);
        const feeCents = Math.abs(Number(meta.feeCents || 0));
        if (feeCents <= 0) continue;
        const netAbs = Math.abs(tx.totalCents) - feeCents;
        if (netAbs <= 0) continue;
        const day = dayKey(tx.accountingDate);
        for (const other of paypalActive) {
            if (other.id === tx.id) continue;
            if (!other.sourceKey.startsWith('PAYPAL_TX:')) continue;
            if (Math.abs(other.totalCents) !== netAbs) continue;
            if (dayKey(other.accountingDate) !== day) continue;
            if (!isGenericPaypalDesc(other.description)) continue;
            // Solo generici senza fee propria
            const om = asMeta(other.metadataJson);
            if (Math.abs(Number(om.feeCents || 0)) > 0) continue;
            netMirrorIds.push(other.id);
        }
    }
    // Generici senza fee (conversione/hold residui)
    for (const r of paypalActive) {
        if (!r.sourceKey.startsWith('PAYPAL_TX:')) continue;
        if (!isGenericPaypalDesc(r.description)) continue;
        const meta = asMeta(r.metadataJson);
        if (Math.abs(Number(meta.feeCents || 0)) > 0) continue;
        // Non stornare uscite SaaS già classificate
        if (r.category === 'SPESE_SAAS' || isSaasPaypalDescription(r.description)) continue;
        // Non stornare ricavi lordo con fee (già filtrati sopra)
        netMirrorIds.push(r.id);
    }
    result.reversedNetMirrors += await softReverse(netMirrorIds, 'paypal_net_or_generic_noise');

    // 4) Dedup Stripe vs PayPal stesso giorno+lordo: tieni Stripe, storno PayPal TX+FEE
    const stripeFees = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'STRIPE_FEE:' } },
                {
                    sourceType: 'STRIPE_MOVEMENT',
                    category: 'ONERI_BANCARI',
                },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            orderId: true,
            accountingDate: true,
            totalCents: true,
            metadataJson: true,
            documentRef: true,
        },
        take: 5000,
    });

    const stripeGrossHints = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'JSON_ENTRY:entry_stripe_gross' } },
                {
                    sourceType: 'STRIPE_MOVEMENT',
                    category: 'RICAVI_VENDITE',
                },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            orderId: true,
            accountingDate: true,
            totalCents: true,
            documentRef: true,
            metadataJson: true,
        },
        take: 5000,
    });

    const gatewayDupeIds: string[] = [];
    const paypalStill = await prisma.financialLedgerEntry.findMany({
        where: { sourceType: 'PAYPAL_MOVEMENT', reversedAt: null },
        select: {
            id: true,
            sourceKey: true,
            accountingDate: true,
            totalCents: true,
            orderId: true,
            documentRef: true,
            metadataJson: true,
        },
        take: 8000,
    });

    for (const gross of stripeGrossHints) {
        const day = dayKey(gross.accountingDate);
        const abs = Math.abs(gross.totalCents);
        for (const pp of paypalStill) {
            if (Math.abs(pp.totalCents) !== abs) continue;
            if (dayKey(pp.accountingDate) !== day) continue;
            if (!pp.sourceKey.startsWith('PAYPAL_TX:')) continue;
            gatewayDupeIds.push(pp.id);
            const txId = pp.sourceKey.replace(/^PAYPAL_TX:/i, '');
            const fee = paypalStill.find(
                (f) =>
                    f.sourceKey === `PAYPAL_FEE:${txId}` ||
                    (f.documentRef === txId && f.sourceKey.startsWith('PAYPAL_FEE:'))
            );
            if (fee) gatewayDupeIds.push(fee.id);
            // Fee stessa data collegata
            for (const f of paypalStill) {
                if (!f.sourceKey.startsWith('PAYPAL_FEE:')) continue;
                if (dayKey(f.accountingDate) !== day) continue;
                const meta = asMeta(pp.metadataJson);
                const feeCents = Math.abs(Number(meta.feeCents || 0));
                if (feeCents > 0 && Math.abs(f.totalCents) === feeCents) {
                    gatewayDupeIds.push(f.id);
                }
            }
        }
    }

    // Anche: stesso orderId su Stripe fee + PayPal
    for (const sf of stripeFees) {
        if (!sf.orderId) continue;
        for (const pp of paypalStill) {
            if (pp.orderId === sf.orderId) gatewayDupeIds.push(pp.id);
        }
    }

    result.reversedGatewayDupes += await softReverse(
        gatewayDupeIds,
        'stripe_paypal_same_order_dedup'
    );

    // 5) JSON_ENTRY fee manuale se esiste STRIPE_FEE con stesso importo assoluto
    const jsonFees = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'JSON_ENTRY:entry_stripe_fees' },
        },
        select: { id: true, sourceKey: true, orderId: true, totalCents: true },
        take: 2000,
    });
    const manualFeeIds: string[] = [];
    for (const jf of jsonFees) {
        const orderFromKey =
            jf.sourceKey.match(/entry_stripe_fees(?:_webhook)?_(.+)$/i)?.[1] || null;
        const twin = stripeFees.find((sf) => {
            if (Math.abs(sf.totalCents) !== Math.abs(jf.totalCents)) return false;
            if (orderFromKey && sf.orderId && sf.orderId === orderFromKey) return true;
            if (jf.orderId && sf.orderId && jf.orderId === sf.orderId) return true;
            // Stesso abs fee senza orderId collegato (es. FT-LC stesso giorno)
            return !orderFromKey || !sf.orderId;
        });
        if (twin) manualFeeIds.push(jf.id);
    }
    if (manualFeeIds.length) {
        result.reversedManualFees += await softReverse(
            manualFeeIds,
            'manual_fee_dup_of_stripe_fee'
        );
    }

    // 6) ORDER coperto da autorità gateway stesso orderId o giorno+importo
    const orders = await prisma.financialLedgerEntry.findMany({
        where: {
            sourceType: 'ORDER',
            reversedAt: null,
            category: 'RICAVI_VENDITE',
        },
        select: {
            id: true,
            sourceId: true,
            orderId: true,
            accountingDate: true,
            totalCents: true,
        },
        take: 5000,
    });
    const authorities = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: { in: ['STRIPE_MOVEMENT', 'PAYPAL_MOVEMENT', 'JSON_ENTRY'] },
            category: 'RICAVI_VENDITE',
            totalCents: { gt: 0 },
        },
        select: {
            orderId: true,
            sourceKey: true,
            accountingDate: true,
            totalCents: true,
            documentRef: true,
        },
        take: 8000,
    });
    const authOrderIds = new Set<string>();
    const authDayAmt = new Set<string>();
    for (const a of authorities) {
        if (a.orderId) authOrderIds.add(a.orderId);
        const m = a.sourceKey.match(/entry_stripe_gross(?:_webhook)?_(.+)$/i);
        if (m?.[1]) authOrderIds.add(m[1]);
        authDayAmt.add(`${dayKey(a.accountingDate)}|${Math.abs(a.totalCents)}`);
    }
    const orderIdsToReverse: string[] = [];
    for (const o of orders) {
        const oid = o.orderId || o.sourceId;
        if (oid && authOrderIds.has(oid)) {
            orderIdsToReverse.push(o.id);
            continue;
        }
        if (authDayAmt.has(`${dayKey(o.accountingDate)}|${Math.abs(o.totalCents)}`)) {
            orderIdsToReverse.push(o.id);
        }
    }
    if (orderIdsToReverse.length) {
        result.reversedOrders += await softReverse(
            orderIdsToReverse,
            'order_covered_by_gateway_authority'
        );
    }

    // 7) Patch conti gateway residui
    const patchPaypal = await prisma.financialLedgerEntry.findMany({
        where: { sourceType: 'PAYPAL_MOVEMENT', reversedAt: null },
        select: { id: true, direction: true, category: true, totalCents: true, metadataJson: true },
        take: 8000,
    });
    for (const r of patchPaypal) {
        const meta = asMeta(r.metadataJson);
        const isIn = r.totalCents > 0 || r.direction === 'ENTRATA';
        let dare = String(meta.dareAccount || '');
        let avere = String(meta.avereAccount || '');
        if (r.category === 'SPESE_SAAS') {
            dare = SAAS_ACCOUNT;
            avere = LEDGER_PAYPAL_ACCOUNT;
        } else if (r.category === 'ONERI_BANCARI') {
            dare = FEE_ACCOUNT;
            avere = LEDGER_PAYPAL_ACCOUNT;
        } else if (isIn) {
            dare = LEDGER_PAYPAL_ACCOUNT;
            avere = REVENUE_ACCOUNT;
        } else {
            dare = SAAS_ACCOUNT;
            avere = LEDGER_PAYPAL_ACCOUNT;
        }
        if (meta.dareAccount === dare && meta.avereAccount === avere) continue;
        await prisma.financialLedgerEntry.update({
            where: { id: r.id },
            data: {
                metadataJson: {
                    ...meta,
                    dareAccount: dare,
                    avereAccount: avere,
                },
            },
        });
        result.accountsPatched += 1;
    }

    const patchStripe = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { sourceType: 'STRIPE_MOVEMENT' },
                { sourceKey: { startsWith: 'JSON_ENTRY:entry_stripe_' } },
            ],
        },
        select: { id: true, category: true, direction: true, totalCents: true, metadataJson: true },
        take: 5000,
    });
    for (const r of patchStripe) {
        const meta = asMeta(r.metadataJson);
        const isIn = r.totalCents > 0 || r.direction === 'ENTRATA';
        let dare: string;
        let avere: string;
        if (r.category === 'ONERI_BANCARI' || !isIn) {
            dare = FEE_ACCOUNT;
            avere = LEDGER_STRIPE_ACCOUNT;
        } else {
            dare = LEDGER_STRIPE_ACCOUNT;
            avere = REVENUE_ACCOUNT;
        }
        if (meta.dareAccount === dare && meta.avereAccount === avere) continue;
        await prisma.financialLedgerEntry.update({
            where: { id: r.id },
            data: {
                metadataJson: {
                    ...meta,
                    dareAccount: dare,
                    avereAccount: avere,
                },
            },
        });
        result.accountsPatched += 1;
    }

    return result;
}

/**
 * Sanificazione Prima Nota 2026+: falsi ricavi SaaS, lordo/netto PayPal,
 * doppie fee gateway/manuale, normalizzazione conti 10100/10200/10300.
 * Solo reversedAt — mai DELETE su FinancialLedgerEntry. Idempotente.
 */

import prisma from '@/lib/prisma';
import {
    LEDGER_FINECO_ACCOUNT,
    LEDGER_PAYPAL_ACCOUNT,
    LEDGER_STRIPE_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import {
    isPaypalAuthDuplicateCandidate,
    isPaypalInternalNetNoise,
    isSaasPaypalDescription,
} from '@/lib/financial/paypalClassify';
import { sanitizePaypalLedgerDuplicates } from '@/lib/financial/paypalLedgerSanitize';

export type DoubleEntrySanitizeResult = {
    fromDate: string;
    scanned: number;
    paypalDedup: Awaited<ReturnType<typeof sanitizePaypalLedgerDuplicates>>;
    saasCategoryFixed: number;
    saasCreditsReclassified: number;
    accountsPatched: number;
    reversedSpecular: number;
    reversedNetMirrors: number;
    reversedInternalNet: number;
    reversedAuthDupes: number;
    reversedGatewayDupes: number;
    reversedManualFees: number;
    reversedBankFeeDupes: number;
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
const DEFAULT_FROM = new Date('2026-01-01T00:00:00.000Z');

type Row = {
    id: string;
    sourceKey: string;
    sourceType: string;
    category: string;
    direction: string;
    accountingDate: Date;
    totalCents: number;
    description: string;
    counterpartyName: string | null;
    metadataJson: unknown;
    orderId: string | null;
    documentRef: string | null;
};

/**
 * Scansione + bonifica retroattiva FinancialLedgerEntry (default: da 01/01/2026).
 */
export async function sanitizeLedgerDoubleEntryAnomalies(opts?: {
    fromDate?: Date;
}): Promise<DoubleEntrySanitizeResult> {
    const fromDate = opts?.fromDate || DEFAULT_FROM;
    const paypalDedup = await sanitizePaypalLedgerDuplicates();
    const now = new Date();

    const result: DoubleEntrySanitizeResult = {
        fromDate: fromDate.toISOString().slice(0, 10),
        scanned: 0,
        paypalDedup,
        saasCategoryFixed: 0,
        saasCreditsReclassified: 0,
        accountsPatched: 0,
        reversedSpecular: 0,
        reversedNetMirrors: 0,
        reversedInternalNet: 0,
        reversedAuthDupes: 0,
        reversedGatewayDupes: 0,
        reversedManualFees: 0,
        reversedBankFeeDupes: 0,
        reversedOrders: 0,
    };

    const reverseIds = new Set<string>();
    const softReverse = async (ids: string[], reason: string) => {
        const unique = [...new Set(ids)].filter((id) => id && !reverseIds.has(id));
        if (!unique.length) return 0;
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
                /* race */
            }
        }
        return unique.filter((id) => reverseIds.has(id)).length;
    };

    const loadActive = async (): Promise<Row[]> => {
        return prisma.financialLedgerEntry.findMany({
            where: {
                accountingDate: { gte: fromDate },
                reversedAt: null,
            },
            select: {
                id: true,
                sourceKey: true,
                sourceType: true,
                category: true,
                direction: true,
                accountingDate: true,
                totalCents: true,
                description: true,
                counterpartyName: true,
                metadataJson: true,
                orderId: true,
                documentRef: true,
            },
            take: 12000,
            orderBy: { accountingDate: 'asc' },
        });
    };

    let rows = await loadActive();
    result.scanned = rows.length;

    // ——— A1) SaaS uscite: categoria SPESE_SAAS + conti 70900/10200 ———
    for (const r of rows) {
        if (r.sourceType !== 'PAYPAL_MOVEMENT') continue;
        if (r.totalCents >= 0) continue;
        const saas = isSaasPaypalDescription(r.description, r.counterpartyName);
        if (!saas && r.category !== 'SPESE_SAAS') continue;
        const needsCat = saas && r.category !== 'SPESE_SAAS';
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

    // ——— A2) Crediti SaaS su 60100 → RIMBORSI (mai ricavi vendite) ———
    rows = await loadActive();
    for (const r of rows) {
        if (r.sourceType !== 'PAYPAL_MOVEMENT') continue;
        if (r.totalCents <= 0) continue;
        if (r.category !== 'RICAVI_VENDITE') continue;
        if (!isSaasPaypalDescription(r.description, r.counterpartyName)) continue;
        const meta = asMeta(r.metadataJson);
        await prisma.financialLedgerEntry.update({
            where: { id: r.id },
            data: {
                category: 'RIMBORSI',
                direction: 'ENTRATA',
                metadataJson: {
                    ...meta,
                    dareAccount: LEDGER_PAYPAL_ACCOUNT,
                    avereAccount: SAAS_ACCOUNT,
                    sanitizeReason: 'saas_credit_not_revenue',
                    sanitizedAt: now.toISOString(),
                },
            },
        });
        result.saasCreditsReclassified += 1;
    }

    rows = await loadActive();
    const paypalActive = () => rows.filter((r) => r.sourceType === 'PAYPAL_MOVEMENT');

    // ——— A3) Speculare positivo vs uscita SaaS stesso giorno/importo ———
    {
        const pp = paypalActive();
        const saasDebits = pp.filter(
            (r) =>
                r.totalCents < 0 &&
                (r.category === 'SPESE_SAAS' ||
                    isSaasPaypalDescription(r.description, r.counterpartyName))
        );
        const specularIds: string[] = [];
        for (const debit of saasDebits) {
            const abs = Math.abs(debit.totalCents);
            const day = dayKey(debit.accountingDate);
            for (const credit of pp) {
                if (credit.id === debit.id) continue;
                if (credit.totalCents !== abs) continue;
                if (dayKey(credit.accountingDate) !== day) continue;
                if (
                    credit.category === 'RICAVI_VENDITE' ||
                    isGenericPaypalDesc(credit.description)
                ) {
                    specularIds.push(credit.id);
                }
            }
        }
        result.reversedSpecular += await softReverse(specularIds, 'saas_specular_credit');
    }

    // ——— B1) Importo pagato / Denaro raccolto (netto interno) ———
    {
        const internalIds = paypalActive()
            .filter((r) => isPaypalInternalNetNoise(r.description))
            .map((r) => r.id);
        result.reversedInternalNet += await softReverse(
            internalIds,
            'paypal_internal_net_bookkeeping'
        );
    }

    rows = await loadActive();

    // ——— B2) Net mirrors generici ±net rispetto a lordo+fee ———
    {
        const pp = paypalActive();
        const netMirrorIds: string[] = [];
        for (const tx of pp) {
            if (!tx.sourceKey.startsWith('PAYPAL_TX:')) continue;
            if (tx.totalCents <= 0) continue;
            const meta = asMeta(tx.metadataJson);
            const feeCents = Math.abs(Number(meta.feeCents || 0));
            if (feeCents <= 0) continue;
            const netAbs = Math.abs(tx.totalCents) - feeCents;
            if (netAbs <= 0) continue;
            const day = dayKey(tx.accountingDate);
            for (const other of pp) {
                if (other.id === tx.id) continue;
                if (!other.sourceKey.startsWith('PAYPAL_TX:')) continue;
                if (Math.abs(other.totalCents) !== netAbs) continue;
                if (dayKey(other.accountingDate) !== day) continue;
                if (
                    !isGenericPaypalDesc(other.description) &&
                    !isPaypalInternalNetNoise(other.description)
                ) {
                    continue;
                }
                const om = asMeta(other.metadataJson);
                if (Math.abs(Number(om.feeCents || 0)) > 0) continue;
                netMirrorIds.push(other.id);
            }
        }
        for (const r of pp) {
            if (!r.sourceKey.startsWith('PAYPAL_TX:')) continue;
            if (!isGenericPaypalDesc(r.description)) continue;
            const meta = asMeta(r.metadataJson);
            if (Math.abs(Number(meta.feeCents || 0)) > 0) continue;
            if (
                r.category === 'SPESE_SAAS' ||
                isSaasPaypalDescription(r.description, r.counterpartyName)
            ) {
                continue;
            }
            netMirrorIds.push(r.id);
        }
        result.reversedNetMirrors += await softReverse(
            netMirrorIds,
            'paypal_net_or_generic_noise'
        );
    }

    rows = await loadActive();

    // ——— B3) Doppie autorizzazioni SaaS (auth + carta stesso giorno/importo) ———
    {
        const pp = paypalActive().filter((r) => r.totalCents < 0);
        const authDupIds: string[] = [];
        const byDayAmt = new Map<string, Row[]>();
        for (const r of pp) {
            const key = `${dayKey(r.accountingDate)}|${Math.abs(r.totalCents)}`;
            const list = byDayAmt.get(key) || [];
            list.push(r);
            byDayAmt.set(key, list);
        }
        for (const group of byDayAmt.values()) {
            if (group.length < 2) continue;
            const auths = group.filter((r) => isPaypalAuthDuplicateCandidate(r.description));
            const charges = group.filter(
                (r) =>
                    !isPaypalAuthDuplicateCandidate(r.description) &&
                    /carta\s+di\s+debito|debit\s+card|transazione\s+generica/i.test(
                        r.description || ''
                    )
            );
            if (auths.length && charges.length) {
                for (const a of auths) authDupIds.push(a.id);
            } else if (auths.length >= 2) {
                // tieni la più recente descrizione lunga
                const ranked = [...auths].sort(
                    (a, b) => (b.description?.length || 0) - (a.description?.length || 0)
                );
                for (const loser of ranked.slice(1)) authDupIds.push(loser.id);
            } else if (
                group.length >= 2 &&
                group.every(
                    (r) =>
                        isSaasPaypalDescription(r.description, r.counterpartyName) ||
                        r.category === 'SPESE_SAAS'
                )
            ) {
                // due carichi SaaS identici stesso giorno: tieni uno
                const ranked = [...group].sort((a, b) => {
                    const score = (r: Row) =>
                        (/carta\s+di\s+debito/i.test(r.description) ? 10 : 0) +
                        (r.description?.length || 0) / 50;
                    return score(b) - score(a);
                });
                for (const loser of ranked.slice(1)) authDupIds.push(loser.id);
            }
        }
        result.reversedAuthDupes += await softReverse(authDupIds, 'saas_auth_or_duplicate_charge');
    }

    rows = await loadActive();

    // ——— C) Dedup Stripe vs PayPal / GATEWAY vs MANUALE ———
    {
        const stripeFees = rows.filter(
            (r) =>
                r.sourceKey.startsWith('STRIPE_FEE:') ||
                (r.sourceType === 'STRIPE_MOVEMENT' && r.category === 'ONERI_BANCARI')
        );
        const stripeGrossHints = rows.filter(
            (r) =>
                r.sourceKey.startsWith('JSON_ENTRY:entry_stripe_gross') ||
                (r.sourceType === 'STRIPE_MOVEMENT' && r.category === 'RICAVI_VENDITE')
        );
        const paypalStill = paypalActive();
        const gatewayDupeIds: string[] = [];

        for (const gross of stripeGrossHints) {
            const day = dayKey(gross.accountingDate);
            const abs = Math.abs(gross.totalCents);
            for (const pp of paypalStill) {
                if (Math.abs(pp.totalCents) !== abs) continue;
                if (dayKey(pp.accountingDate) !== day) continue;
                if (!pp.sourceKey.startsWith('PAYPAL_TX:')) continue;
                gatewayDupeIds.push(pp.id);
                const txId = pp.sourceKey.replace(/^PAYPAL_TX:/i, '');
                for (const f of paypalStill) {
                    if (
                        f.sourceKey === `PAYPAL_FEE:${txId}` ||
                        (f.documentRef === txId && f.sourceKey.startsWith('PAYPAL_FEE:'))
                    ) {
                        gatewayDupeIds.push(f.id);
                    }
                }
            }
        }
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

        const jsonFees = rows.filter((r) =>
            r.sourceKey.startsWith('JSON_ENTRY:entry_stripe_fees')
        );
        const manualFeeIds: string[] = [];
        for (const jf of jsonFees) {
            const orderFromKey =
                jf.sourceKey.match(/entry_stripe_fees(?:_webhook)?_(.+)$/i)?.[1] || null;
            const twin = stripeFees.find((sf) => {
                if (Math.abs(sf.totalCents) !== Math.abs(jf.totalCents)) return false;
                if (orderFromKey && sf.orderId && sf.orderId === orderFromKey) return true;
                if (jf.orderId && sf.orderId && jf.orderId === sf.orderId) return true;
                return dayKey(sf.accountingDate) === dayKey(jf.accountingDate);
            });
            if (twin) manualFeeIds.push(jf.id);
        }
        result.reversedManualFees += await softReverse(
            manualFeeIds,
            'manual_fee_dup_of_stripe_fee'
        );
    }

    rows = await loadActive();

    // ——— C2) JSON bankfee vs BANK_LINE (stesso giorno+importo) ———
    {
        const bankLines = rows.filter(
            (r) => r.sourceType === 'BANK_LINE' && r.totalCents < 0
        );
        const jsonBankFees = rows.filter((r) =>
            r.sourceKey.startsWith('JSON_ENTRY:entry_bankfee_')
        );
        const ids: string[] = [];
        for (const jf of jsonBankFees) {
            const twin = bankLines.find(
                (b) =>
                    dayKey(b.accountingDate) === dayKey(jf.accountingDate) &&
                    Math.abs(b.totalCents) === Math.abs(jf.totalCents)
            );
            if (twin) ids.push(jf.id);
        }
        result.reversedBankFeeDupes += await softReverse(ids, 'json_bankfee_dup_of_bank_line');
    }

    rows = await loadActive();

    // ——— C3) ORDER coperto da autorità gateway ———
    {
        const orders = rows.filter(
            (r) => r.sourceType === 'ORDER' && r.category === 'RICAVI_VENDITE'
        );
        const authorities = rows.filter(
            (r) =>
                ['STRIPE_MOVEMENT', 'PAYPAL_MOVEMENT', 'JSON_ENTRY'].includes(r.sourceType) &&
                r.category === 'RICAVI_VENDITE' &&
                r.totalCents > 0
        );
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
            const oid = o.orderId || o.sourceKey.replace(/^ORDER:/i, '');
            if (oid && authOrderIds.has(oid)) {
                orderIdsToReverse.push(o.id);
                continue;
            }
            if (authDayAmt.has(`${dayKey(o.accountingDate)}|${Math.abs(o.totalCents)}`)) {
                orderIdsToReverse.push(o.id);
            }
        }
        result.reversedOrders += await softReverse(
            orderIdsToReverse,
            'order_covered_by_gateway_authority'
        );
    }

    rows = await loadActive();

    // ——— D) Normalizzazione conti patrimoniali ———
    for (const r of rows) {
        const meta = asMeta(r.metadataJson);
        let dare = String(meta.dareAccount || '');
        let avere = String(meta.avereAccount || '');
        let nextDare = dare;
        let nextAvere = avere;
        const isIn = r.totalCents > 0 || r.direction === 'ENTRATA';

        if (r.sourceType === 'PAYPAL_MOVEMENT') {
            if (r.category === 'SPESE_SAAS') {
                nextDare = SAAS_ACCOUNT;
                nextAvere = LEDGER_PAYPAL_ACCOUNT;
            } else if (r.category === 'ONERI_BANCARI') {
                nextDare = FEE_ACCOUNT;
                nextAvere = LEDGER_PAYPAL_ACCOUNT;
            } else if (r.category === 'PAYPAL_PAYOUT' || r.category === 'TRASFERIMENTO_INTERNO') {
                // Wallet → transitorio; Fineco arriva da BANK_LINE
                nextDare = isIn ? LEDGER_PAYPAL_ACCOUNT : '17100 - Conto transitorio Gateway (giroconto)';
                nextAvere = isIn
                    ? '17100 - Conto transitorio Gateway (giroconto)'
                    : LEDGER_PAYPAL_ACCOUNT;
            } else if (r.category === 'RIMBORSI' && isIn) {
                nextDare = LEDGER_PAYPAL_ACCOUNT;
                nextAvere = SAAS_ACCOUNT;
            } else if (isIn) {
                nextDare = LEDGER_PAYPAL_ACCOUNT;
                nextAvere = REVENUE_ACCOUNT;
            } else {
                nextDare = r.category === 'SPESE_SAAS' ? SAAS_ACCOUNT : '70900 - Spese operative';
                nextAvere = LEDGER_PAYPAL_ACCOUNT;
            }
        } else if (
            r.sourceType === 'STRIPE_MOVEMENT' ||
            r.sourceKey.startsWith('JSON_ENTRY:entry_stripe_')
        ) {
            if (r.category === 'ONERI_BANCARI' || !isIn) {
                nextDare = FEE_ACCOUNT;
                nextAvere = LEDGER_STRIPE_ACCOUNT;
            } else {
                nextDare = LEDGER_STRIPE_ACCOUNT;
                nextAvere = REVENUE_ACCOUNT;
            }
        } else if (r.sourceType === 'BANK_LINE') {
            if (r.category === 'TRASFERIMENTO_INTERNO' || r.category === 'PAYPAL_PAYOUT') {
                nextDare = isIn ? LEDGER_FINECO_ACCOUNT : '17100 - Conto transitorio Gateway (giroconto)';
                nextAvere = isIn
                    ? '17100 - Conto transitorio Gateway (giroconto)'
                    : LEDGER_FINECO_ACCOUNT;
            } else if (isIn) {
                nextDare = LEDGER_FINECO_ACCOUNT;
                nextAvere = REVENUE_ACCOUNT;
            } else {
                nextDare =
                    r.category === 'ONERI_BANCARI'
                        ? FEE_ACCOUNT
                        : '70900 - Spese operative';
                nextAvere = LEDGER_FINECO_ACCOUNT;
            }
        } else {
            continue;
        }

        if (nextDare === dare && nextAvere === avere && dare && avere) continue;
        await prisma.financialLedgerEntry.update({
            where: { id: r.id },
            data: {
                metadataJson: {
                    ...meta,
                    dareAccount: nextDare,
                    avereAccount: nextAvere,
                    ledgerAccountFixed: true,
                },
            },
        });
        result.accountsPatched += 1;
    }

    return result;
}

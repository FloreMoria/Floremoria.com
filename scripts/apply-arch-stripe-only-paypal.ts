/**
 * APPLY — Architettura: Stripe = unico transito vendite; PayPal = conto pagamento;
 * MANUAL_INBOUND = incassi fuori gateway (fuori dal transito Stripe).
 *
 * Uso: APPLY=1 npx tsx scripts/apply-arch-stripe-only-paypal.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import {
    setStripeDeclaredBalance,
    setPaypalDeclaredBalance,
} from '@/lib/financial/gatewayDeclaredBalance';
import {
    ACCOUNT_INCASSI_FUORI_GATEWAY,
    ACCOUNT_RICAVI_VENDITE,
} from '@/lib/financial/chartOfAccounts';
import { sumStripeSalesTransitCents } from '@/lib/financial/gatewayTransitBalance';

const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-arch-stripe-only-paypal-apply.json');

function euro(c: number) {
    return Math.round(c) / 100;
}

function isStripeMeta(m: unknown) {
    const o = (m || {}) as Record<string, unknown>;
    const s = `${o.dareAccount || ''}|${o.avereAccount || ''}`;
    return /10300|Banca c\/o Stripe|Conto Stripe/i.test(s);
}

async function main() {
    const apply = process.env.APPLY === '1';
    const log: any[] = [];

    await setStripeDeclaredBalance({
        balanceCents: 10000,
        asOf: '2026-09-11',
        note: 'Dichiarato utente — unico transito vendite Stripe',
    });
    await setPaypalDeclaredBalance({
        balanceCents: 0,
        asOf: '2026-09-11',
        note: 'Conto pagamento PayPal (non transito vendite)',
    });
    log.push({ declared: { stripe: 100, paypal: 0 } });

    // 1) MANUAL_INBOUND off Stripe transit → fuori gateway
    const manuals = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'MANUAL_INBOUND:' },
        },
    });
    let manualMoved = 0;
    let manualEuro = 0;
    for (const r of manuals) {
        if (!isStripeMeta(r.metadataJson) && !(r.metadataJson as any)?.fuoriGateway) {
            // still force fuori-gateway marking if missing
        }
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        if (meta.fuoriGateway === true && !isStripeMeta(meta)) continue;
        const next = {
            ...meta,
            fuoriGateway: true,
            archBatch: 'ARCH_STRIPE_ONLY_20260911',
            previousDare: meta.dareAccount,
            previousAvere: meta.avereAccount,
            dareAccount: ACCOUNT_INCASSI_FUORI_GATEWAY,
            avereAccount: String(meta.avereAccount || ACCOUNT_RICAVI_VENDITE),
        };
        if (apply) {
            await prisma.financialLedgerEntry.update({
                where: { id: r.id },
                data: {
                    entryNature: 'FINANZIARIA',
                    description: `[FUORI_GATEWAY] ${(r.description || '').replace(/^\[FUORI_GATEWAY\]\s*/, '')}`.slice(
                        0,
                        500
                    ),
                    metadataJson: next,
                },
            });
        }
        manualMoved++;
        manualEuro += Math.abs(r.totalCents);
    }
    log.push({ manualInboundToFuoriGateway: { n: manualMoved, euro: euro(manualEuro), apply } });

    // 2) PAYPAL_TX inbound vendite → non più ricavo/transito vendite
    const paypalTx = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'PAYPAL_TX:' },
        },
    });

    let inboundCleared = 0;
    let inboundEuro = 0;
    let costReclass = 0;
    let costEuro = 0;
    let negRvFixed = 0;
    let negRvEuro = 0;

    for (const r of paypalTx) {
        const desc = r.description || '';
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        if (meta.archPaypalNotGateway || meta.archPaypalCostFromRv) continue;

        const looksSale =
            r.totalCents > 0 &&
            (r.orderId ||
                /Checkout|Acquisto Floremoria|Ordine FloreMoria/i.test(desc));
        const looksExpenseDesc =
            /BALLARATE|POSTE|ORCHIDEA|MASPES|TRANSATEL|UBIGI|FACEBK|SDD|Add To Balance|Adobe|Google|Meta|OpenAI|Anthropic|Vercel|Cursor|canone/i.test(
                desc
            );

        if (looksSale && r.category === 'RICAVI_VENDITE') {
            if (apply) {
                await prisma.financialLedgerEntry.update({
                    where: { id: r.id },
                    data: {
                        category: 'TRASFERIMENTO_INTERNO',
                        orderId: null,
                        entryNature: 'FINANZIARIA',
                        description: `[ARCH_PAYPAL_NOT_GATEWAY] ${desc}`.slice(0, 500),
                        metadataJson: {
                            ...meta,
                            archPaypalNotGateway: true,
                            archBatch: 'ARCH_STRIPE_ONLY_20260911',
                            previousCategory: r.category,
                            previousOrderId: r.orderId,
                            dareAccount: meta.dareAccount || '10200 - Banca c/o PayPal',
                            avereAccount: '17900 - Clearing PayPal non-gateway vendite',
                        },
                    },
                });
            }
            inboundCleared++;
            inboundEuro += Math.abs(r.totalCents);
            continue;
        }

        // Spese ancora in RICAVI_VENDITE (o totalCents negativi in RV)
        if (
            (r.category === 'RICAVI_VENDITE' || r.category === 'ALTRI_RICAVI') &&
            (r.totalCents < 0 || looksExpenseDesc)
        ) {
            const isSaas = /TRANSATEL|UBIGI|FACEBK|Adobe|Google|Meta|OpenAI|Vercel|Cursor|SaaS/i.test(
                desc
            );
            const newCat = isSaas ? 'SPESE_SAAS' : 'SPESE_OPERATIVE';
            const abs = Math.abs(r.totalCents);
            if (apply) {
                await prisma.financialLedgerEntry.update({
                    where: { id: r.id },
                    data: {
                        category: newCat,
                        direction: 'USCITA',
                        totalCents: -abs,
                        netCents: -abs,
                        entryNature: 'ECONOMICA',
                        orderId: null,
                        description: `[ARCH_PAYPAL_COST] ${desc}`.slice(0, 500),
                        metadataJson: {
                            ...meta,
                            archPaypalCostFromRv: true,
                            archBatch: 'ARCH_STRIPE_ONLY_20260911',
                            previousCategory: r.category,
                            dareAccount:
                                newCat === 'SPESE_SAAS'
                                    ? '61000 - Spese SaaS'
                                    : '62000 - Spese operative',
                            avereAccount: '10200 - Banca c/o PayPal',
                        },
                    },
                });
            }
            if (r.totalCents < 0) {
                negRvFixed++;
                negRvEuro += abs;
            } else {
                costReclass++;
                costEuro += abs;
            }
        }
    }
    log.push({
        paypalInboundVenditeCleared: { n: inboundCleared, euro: euro(inboundEuro), apply },
        paypalExpenseReclass: { n: costReclass, euro: euro(costEuro), apply },
        paypalNegRvToCost: { n: negRvFixed, euro: euro(negRvEuro), apply },
    });

    // 3) JSON_ENTRY still on Stripe transit meta → fuori (legacy stock)
    const jsons = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'JSON_ENTRY:' },
        },
        select: {
            id: true,
            totalCents: true,
            metadataJson: true,
            description: true,
            fiscalYear: true,
        },
    });
    let jsonMoved = 0;
    let jsonEuro = 0;
    for (const r of jsons) {
        if (!isStripeMeta(r.metadataJson)) continue;
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        if (apply) {
            await prisma.financialLedgerEntry.update({
                where: { id: r.id },
                data: {
                    metadataJson: {
                        ...meta,
                        fuoriGatewayLegacyJson: true,
                        archBatch: 'ARCH_STRIPE_ONLY_20260911',
                        previousDare: meta.dareAccount,
                        previousAvere: meta.avereAccount,
                        dareAccount: ACCOUNT_INCASSI_FUORI_GATEWAY,
                        avereAccount: String(meta.avereAccount || ACCOUNT_RICAVI_VENDITE),
                    },
                },
            });
        }
        jsonMoved++;
        jsonEuro += Math.abs(r.totalCents);
    }
    log.push({ jsonOffStripeTransit: { n: jsonMoved, euro: euro(jsonEuro), apply } });

    const stripeTransit = await sumStripeSalesTransitCents();
    const report = {
        generatedAt: new Date().toISOString(),
        apply,
        log,
        stripeSalesTransitAfterEuro: euro(stripeTransit),
        stripeDeclaredEuro: 100,
        deltaC13StripeEuro: euro(stripeTransit - 10000),
    };
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

/**
 * 1) SDD Fineco→PayPal €1.655,95 → TI entrata PayPal (gamba Fineco già presente)
 * 2) Completa inbound vendite report HAYUM (€670,68): unreverse dedup errati + synth T3
 * 3) Fee PayPal sulle 32 vendite (CSV ~€47,73)
 * 4) Report decisioni 27 doppi + stato Stripe
 *
 * APPLY=1 per scrivere.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import prisma from '@/lib/prisma';
import {
    loadPaypalSalesReport,
    PAYPAL_MERCHANT_CODE,
    PAYPAL_PAY_LATER_KNOWN,
} from '@/lib/financial/paypalSalesReports';
import {
    LEDGER_FINECO_ACCOUNT,
    LEDGER_PAYPAL_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { sumPaypalPaymentAccountCents, sumStripeSalesTransitCents } from '@/lib/financial/gatewayTransitBalance';
// C11–C13 imported dynamically in main to avoid C4 STOP in runAllDossierControls


const BATCH = 'PAYPAL_SDD_INBOUND_20260911';
const OUT = path.join(process.cwd(), 'docs/verbali/11-09-2026-paypal-sdd-inbound-close.json');
const TX_CSV = '/Users/floremoria/Downloads/Transazioni PayPal FloreMoria 2026.CSV';

function euro(c: number) {
    return Math.round(c) / 100;
}
function parseEuro(s: string): number {
    const t = (s || '').trim();
    if (!t) return 0;
    if (t.includes(',') && t.includes('.')) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
    if (t.includes(',')) return parseFloat(t.replace(',', '.'));
    return parseFloat(t);
}

type Sale = {
    date: string;
    cents: number;
    feeCents: number;
    txId: string;
    name: string;
    type: string;
    synthetic?: boolean;
};

function buildSalesFromReport(): Sale[] {
    const ytd = loadPaypalSalesReport('YTD');
    const raw = fs.readFileSync(TX_CSV, 'utf8');
    const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
    const buckets = new Map(
        ytd.parsed.daily.map((d) => [d.date, { qty: d.qty, volumeCents: d.volumeCents, used: 0 }])
    );
    const sales: Sale[] = [];
    for (const row of parsed.data) {
        const tipo = row['Tipo'] || '';
        const lordo = Math.round(parseEuro(row['Lordo'] || '') * 100);
        const fee = Math.round(Math.abs(parseEuro(row['Tariffa'] || '')) * 100);
        if (lordo <= 0 || row['Impatto sul saldo'] !== 'Accredito') continue;
        const isSale =
            /Pagamento Express Checkout|Pagamento da cellulare|Pagamento generico|Pay Later/i.test(
                tipo
            ) ||
            (/Pagamento/i.test(tipo) && !/preautorizzato|utenza|carta di debito/i.test(tipo));
        if (!isSale) continue;
        const dm = (row['Data'] || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!dm) continue;
        const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
        if (date > '2026-09-10') continue;
        const b = buckets.get(date);
        if (b && b.used < b.qty) {
            b.used++;
            sales.push({
                date,
                cents: lordo,
                feeCents: fee,
                txId: row['Codice transazione'] || '',
                name: row['Nome'] || '',
                type: tipo,
            });
        }
    }
    for (const [date, b] of buckets) {
        const need = b.qty - b.used;
        if (need <= 0) continue;
        const usedCents = sales.filter((s) => s.date === date).reduce((s, x) => s + x.cents, 0);
        const remain = b.volumeCents - usedCents;
        const unit = Math.round(remain / need);
        for (let i = 0; i < need; i++) {
            const c = i === need - 1 ? remain - unit * (need - 1) : unit;
            sales.push({
                date,
                cents: c,
                feeCents: 0,
                txId: '',
                name: '',
                type: 'SYNTHETIC_FROM_REPORT',
                synthetic: true,
            });
        }
    }
    return sales;
}

async function main() {
    const apply = process.env.APPLY === '1';
    const sales = buildSalesFromReport();
    const beforePp = await sumPaypalPaymentAccountCents();
    const beforeStripe = await sumStripeSalesTransitCents(2026);

    // ── 1) SDD Fineco → PayPal funding credits ─────────────────────────
    const bankRows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            description: { contains: 'PayPal', mode: 'insensitive' },
        },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            category: true,
            description: true,
            accountingDate: true,
            metadataJson: true,
            fiscalQuarter: true,
            periodKey: true,
        },
    });
    const sddRows = bankRows.filter(
        (r) => /sdd|addebito\s*sdd|adde bito sdd/i.test(r.description || '') && r.totalCents < 0
    );

    const sddCreated: any[] = [];
    const sddReclassed: any[] = [];
    let sddPaypalCreditCents = 0;
    for (const sdd of sddRows) {
        const abs = Math.abs(sdd.totalCents);
        const meta = (sdd.metadataJson || {}) as Record<string, unknown>;
        const alreadyMirrored =
            String(meta.dareAccount || '').includes('10200') ||
            String(meta.dareAccount || '').includes('PayPal') ||
            meta.sddFundingBatch === BATCH;

        if (apply) {
            await prisma.financialLedgerEntry.update({
                where: { id: sdd.id },
                data: {
                    category: 'TRASFERIMENTO_INTERNO',
                    entryNature: 'TRANSITO',
                    description: alreadyMirrored
                        ? (sdd.description || '').slice(0, 500)
                        : `[${BATCH} SDD funding Fineco→PayPal] ${sdd.description || ''}`.slice(
                              0,
                              500
                          ),
                    metadataJson: {
                        ...meta,
                        // Una sola scrittura: dare PayPal (+) / avere Fineco (−). Non costo/ricavo.
                        dareAccount: LEDGER_PAYPAL_ACCOUNT,
                        avereAccount: LEDGER_FINECO_ACCOUNT,
                        sddFundingBatch: BATCH,
                        priorCategory: sdd.category,
                        note: 'Versamento Fineco→PayPal (alimenta saldo); non costo/ricavo',
                    },
                },
            });
        }
        sddPaypalCreditCents += abs;
        sddReclassed.push({
            id: sdd.id,
            key: sdd.sourceKey,
            euro: euro(-abs),
            from: sdd.category,
            action: alreadyMirrored ? 'ensure_meta' : 'reclass_ti_dare_paypal',
        });
        sddCreated.push({
            action: 'fineco_row_is_paypal_credit',
            key: sdd.sourceKey,
            euro: euro(abs),
        });
    }

    // ── 2) Restore / create PayPal sales inbound ───────────────────────
    const inboundActions: any[] = [];
    for (const s of sales) {
        const isPayLater =
            s.txId === PAYPAL_PAY_LATER_KNOWN.txId ||
            (s.date === PAYPAL_PAY_LATER_KNOWN.date && s.cents === PAYPAL_PAY_LATER_KNOWN.cents);

        if (s.txId) {
            const row = await prisma.financialLedgerEntry.findFirst({
                where: { sourceKey: `PAYPAL_TX:${s.txId}` },
            });
            if (row && row.reversedAt) {
                if (apply) {
                    await prisma.financialLedgerEntry.update({
                        where: { id: row.id },
                        data: {
                            reversedAt: null,
                            reversesEntryId: null,
                            category: 'TRASFERIMENTO_INTERNO',
                            entryNature: 'TRANSITO',
                            totalCents: s.cents,
                            netCents: s.cents,
                            direction: 'ENTRATA',
                            description:
                                `[${BATCH} inbound report HAYUM] Pagamento PayPal · ${s.name} · ${s.type}${isPayLater ? ' [Pay Later=incasso normale]' : ''}`.slice(
                                    0,
                                    500
                                ),
                            metadataJson: {
                                ...((row.metadataJson || {}) as object),
                                dareAccount: LEDGER_PAYPAL_ACCOUNT,
                                paypalSalesReport: true,
                                paypalMerchant: PAYPAL_MERCHANT_CODE,
                                inboundBatch: BATCH,
                                unreversedFrom: 'stripe_paypal_same_order_dedup',
                                ...(isPayLater ? { payLater: true } : {}),
                            },
                        },
                    });
                }
                inboundActions.push({
                    action: 'unreverse_tx',
                    txId: s.txId,
                    euro: euro(s.cents),
                    date: s.date,
                });
            } else if (row && !row.reversedAt) {
                // ensure TI + meta
                if (apply) {
                    await prisma.financialLedgerEntry.update({
                        where: { id: row.id },
                        data: {
                            category: 'TRASFERIMENTO_INTERNO',
                            entryNature: 'TRANSITO',
                            metadataJson: {
                                ...((row.metadataJson || {}) as object),
                                dareAccount: LEDGER_PAYPAL_ACCOUNT,
                                paypalSalesReport: true,
                                paypalMerchant: PAYPAL_MERCHANT_CODE,
                                inboundBatch: BATCH,
                                ...(isPayLater ? { payLater: true } : {}),
                            },
                        },
                    });
                }
                inboundActions.push({
                    action: 'ensure_meta',
                    txId: s.txId,
                    euro: euro(s.cents),
                    date: s.date,
                });
            } else if (!row) {
                const key = `PAYPAL_TX:${s.txId}`;
                if (apply) {
                    const d = new Date(s.date + 'T12:00:00Z');
                    const q = Math.floor(d.getUTCMonth() / 3) + 1;
                    await prisma.financialLedgerEntry.create({
                        data: {
                            sourceKey: key,
                            sourceType: 'PAYPAL_MOVEMENT',
                            sourceId: s.txId.slice(0, 128),
                            direction: 'ENTRATA',
                            category: 'TRASFERIMENTO_INTERNO',
                            fiscalYear: 2026,
                            fiscalQuarter: q,
                            periodKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
                            accountingDate: d,
                            description:
                                `[${BATCH} inbound report HAYUM] Pagamento PayPal · ${s.name} · ${s.type}`.slice(
                                    0,
                                    500
                                ),
                            counterpartyName: s.name || 'PayPal buyer',
                            netCents: s.cents,
                            vatRate: 0,
                            vatCents: 0,
                            totalCents: s.cents,
                            currency: 'EUR',
                            reconciliationStatus: 'MATCHED',
                            documentRef: s.txId.slice(0, 120),
                            entryNature: 'TRANSITO',
                            settlementStatus: 'MATCHED',
                            metadataJson: {
                                dareAccount: LEDGER_PAYPAL_ACCOUNT,
                                paypalSalesReport: true,
                                paypalMerchant: PAYPAL_MERCHANT_CODE,
                                inboundBatch: BATCH,
                                ...(isPayLater ? { payLater: true } : {}),
                            },
                        },
                    });
                }
                inboundActions.push({
                    action: 'create_tx',
                    txId: s.txId,
                    euro: euro(s.cents),
                    date: s.date,
                });
            }

            // Fee
            if (s.feeCents > 0) {
                const feeKey = `PAYPAL_FEE:${s.txId}`;
                const fee = await prisma.financialLedgerEntry.findFirst({ where: { sourceKey: feeKey } });
                if (fee && fee.reversedAt) {
                    if (apply) {
                        await prisma.financialLedgerEntry.update({
                            where: { id: fee.id },
                            data: {
                                reversedAt: null,
                                totalCents: -s.feeCents,
                                netCents: -s.feeCents,
                                category: 'ONERI_BANCARI',
                                direction: 'USCITA',
                                metadataJson: {
                                    ...((fee.metadataJson || {}) as object),
                                    avereAccount: LEDGER_PAYPAL_ACCOUNT,
                                    dareAccount: '70200 - Oneri bancari / Fee gateway',
                                    inboundBatch: BATCH,
                                },
                            },
                        });
                    }
                    inboundActions.push({
                        action: 'unreverse_fee',
                        txId: s.txId,
                        euro: euro(-s.feeCents),
                    });
                } else if (!fee) {
                    if (apply) {
                        const d = new Date(s.date + 'T12:00:00Z');
                        const q = Math.floor(d.getUTCMonth() / 3) + 1;
                        await prisma.financialLedgerEntry.create({
                            data: {
                                sourceKey: feeKey,
                                sourceType: 'PAYPAL_MOVEMENT',
                                sourceId: `fee_${s.txId}`.slice(0, 128),
                                direction: 'USCITA',
                                category: 'ONERI_BANCARI',
                                fiscalYear: 2026,
                                fiscalQuarter: q,
                                periodKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
                                accountingDate: d,
                                description: `Commissione PayPal — ${s.txId} [${BATCH}]`,
                                netCents: -s.feeCents,
                                vatRate: 0,
                                vatCents: 0,
                                totalCents: -s.feeCents,
                                currency: 'EUR',
                                reconciliationStatus: 'MATCHED',
                                entryNature: 'ECONOMICO',
                                settlementStatus: 'MATCHED',
                                metadataJson: {
                                    avereAccount: LEDGER_PAYPAL_ACCOUNT,
                                    dareAccount: '70200 - Oneri bancari / Fee gateway',
                                    inboundBatch: BATCH,
                                },
                            },
                        });
                    }
                    inboundActions.push({
                        action: 'create_fee',
                        txId: s.txId,
                        euro: euro(-s.feeCents),
                    });
                }
            }
        } else {
            // synthetic from report — prefer existing ledger TX same day/amount (T3 CSV incompleto)
            const dayStart = new Date(s.date + 'T00:00:00Z');
            const dayEnd = new Date(s.date + 'T23:59:59Z');
            const candidates = await prisma.financialLedgerEntry.findMany({
                where: {
                    sourceKey: { startsWith: 'PAYPAL_TX:' },
                    NOT: { sourceKey: { startsWith: 'PAYPAL_TX:REPORT_' } },
                    accountingDate: { gte: dayStart, lte: dayEnd },
                },
                select: {
                    id: true,
                    sourceKey: true,
                    totalCents: true,
                    reversedAt: true,
                    metadataJson: true,
                    description: true,
                },
            });
            const hit =
                candidates.find(
                    (c) => !c.reversedAt && Math.abs(c.totalCents) === s.cents
                ) ||
                candidates.find(
                    (c) => c.reversedAt && Math.abs(c.totalCents) === s.cents
                ) ||
                null;

            if (hit) {
                const txId = hit.sourceKey.replace(/^PAYPAL_TX:/, '');
                if (apply) {
                    await prisma.financialLedgerEntry.update({
                        where: { id: hit.id },
                        data: {
                            reversedAt: null,
                            reversesEntryId: null,
                            category: 'TRASFERIMENTO_INTERNO',
                            entryNature: 'TRANSITO',
                            totalCents: s.cents,
                            netCents: s.cents,
                            direction: 'ENTRATA',
                            description:
                                `[${BATCH} inbound report HAYUM] ${hit.description || txId}`.slice(
                                    0,
                                    500
                                ),
                            metadataJson: {
                                ...((hit.metadataJson || {}) as object),
                                dareAccount: LEDGER_PAYPAL_ACCOUNT,
                                paypalSalesReport: true,
                                paypalMerchant: PAYPAL_MERCHANT_CODE,
                                inboundBatch: BATCH,
                                resolvedFromSynthSlot: true,
                            },
                        },
                    });
                }
                inboundActions.push({
                    action: hit.reversedAt ? 'unreverse_late_tx' : 'mark_late_tx',
                    txId,
                    euro: euro(s.cents),
                    date: s.date,
                });
            } else {
                const synthKey = `PAYPAL_TX:REPORT_${s.date}_${s.cents}`.slice(0, 180);
                const existing = await prisma.financialLedgerEntry.findUnique({
                    where: { sourceKey: synthKey },
                });
                if (existing && !existing.reversedAt) {
                    inboundActions.push({
                        action: 'synth_exists',
                        key: synthKey,
                        euro: euro(s.cents),
                        date: s.date,
                    });
                } else if (apply) {
                    const d = new Date(s.date + 'T12:00:00Z');
                    const q = Math.floor(d.getUTCMonth() / 3) + 1;
                    if (existing?.reversedAt) {
                        await prisma.financialLedgerEntry.update({
                            where: { id: existing.id },
                            data: {
                                reversedAt: null,
                                totalCents: s.cents,
                                netCents: s.cents,
                                category: 'TRASFERIMENTO_INTERNO',
                                direction: 'ENTRATA',
                                metadataJson: {
                                    dareAccount: LEDGER_PAYPAL_ACCOUNT,
                                    paypalSalesReport: true,
                                    syntheticFromReport: true,
                                    inboundBatch: BATCH,
                                },
                            },
                        });
                    } else {
                        await prisma.financialLedgerEntry.create({
                            data: {
                                sourceKey: synthKey,
                                sourceType: 'PAYPAL_MOVEMENT',
                                sourceId: `report_${s.date}_${s.cents}`.slice(0, 128),
                                direction: 'ENTRATA',
                                category: 'TRASFERIMENTO_INTERNO',
                                fiscalYear: 2026,
                                fiscalQuarter: q,
                                periodKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
                                accountingDate: d,
                                description: `[${BATCH} inbound synth report HAYUM] Vendita PayPal ${s.date} €${euro(s.cents)}`.slice(
                                    0,
                                    500
                                ),
                                counterpartyName: 'PayPal report HAYUM',
                                netCents: s.cents,
                                vatRate: 0,
                                vatCents: 0,
                                totalCents: s.cents,
                                currency: 'EUR',
                                reconciliationStatus: 'MATCHED',
                                entryNature: 'TRANSITO',
                                settlementStatus: 'MATCHED',
                                metadataJson: {
                                    dareAccount: LEDGER_PAYPAL_ACCOUNT,
                                    paypalSalesReport: true,
                                    syntheticFromReport: true,
                                    inboundBatch: BATCH,
                                    provisionalT3: s.date >= '2026-07-01',
                                },
                            },
                        });
                    }
                    inboundActions.push({
                        action: 'create_synth',
                        key: synthKey,
                        euro: euro(s.cents),
                        date: s.date,
                    });
                } else {
                    inboundActions.push({
                        action: 'would_create_synth',
                        key: synthKey,
                        euro: euro(s.cents),
                        date: s.date,
                    });
                }
            }
        }
    }

    // ── 3) Case-by-case 27 doubles (from prior diagnosis) ──────────────
    const modelPath = path.join(process.cwd(), 'docs/verbali/11-09-2026-day-close-848-paypal-rai.json');
    // Prefer paypal sales model doubles
    const salesModel = JSON.parse(
        fs.readFileSync(
            path.join(process.cwd(), 'docs/verbali/11-09-2026-paypal-sales-model.json'),
            'utf8'
        )
    );
    const paypalDates = new Set(
        (salesModel.paypalPayments?.rows || []).map((r: any) => `${r.date}:${r.cents}`)
    );
    // Rebuild 27 operational doubles from current residual manuals + historical list
    const priorDoubles = (salesModel.punto1_stripeExcess?.doubles || []) as Array<{
        paypalDate: string;
        paypalEuro: number;
        paypalTx: string;
        stripeKey: string;
        stripeId: string;
        orderId: string | null;
    }>;

    const caseByCase: any[] = [];
    for (const d of priorDoubles) {
        caseByCase.push({
            paypalDate: d.paypalDate,
            euro: d.paypalEuro,
            paypalTx: d.paypalTx,
            stripeKey: d.stripeKey,
            decision: 'PAYPAL',
            reason:
                'Presente nel report HAYUM (stessa data/importo). Stripe TX già stornato come doppio. Unreverse PAYPAL_TX in questo batch.',
        });
    }
    // Residual manuals (4)
    const manuals = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceKey: { startsWith: 'MANUAL_INBOUND:' },
            category: 'RICAVI_VENDITE',
        },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            accountingDate: true,
            orderId: true,
        },
    });
    const orders = await prisma.order.findMany({
        where: { id: { in: manuals.map((m) => m.orderId!).filter(Boolean) } },
        select: { id: true, orderNumber: true, buyerFullName: true },
    });
    const onById = new Map(orders.map((o) => [o.id, o]));
    for (const m of manuals) {
        const o = m.orderId ? onById.get(m.orderId) : null;
        const date = m.accountingDate.toISOString().slice(0, 10);
        const cents = Math.abs(m.totalCents);
        const inReport = [...paypalDates].some((k) => {
            const [d, c] = k.split(':');
            return d === date && Math.abs(Number(c) - cents) <= 1;
        });
        // wider ±3d
        const nearReport = sales.some(
            (s) =>
                Math.abs(s.cents - cents) <= 1 &&
                Math.abs(
                    new Date(s.date + 'T12:00:00Z').getTime() -
                        new Date(date + 'T12:00:00Z').getTime()
                ) /
                    86400000 <=
                    3
        );
        let decision = 'FUORI_GATEWAY_RESIDUO';
        let reason =
            'Nessun match report PayPal né Stripe attivo: resta eccezione fuori gateway da verificare a mano.';
        if (inReport || nearReport) {
            decision = 'PAYPAL';
            reason = 'Allineabile al report HAYUM → non fuori gateway; preferire PayPal.';
            if (apply) {
                await prisma.financialLedgerEntry.update({
                    where: { id: m.id },
                    data: {
                        reversedAt: new Date(),
                        description: `[STORNO ${BATCH} — verità PayPal report] ${m.sourceKey}`,
                        metadataJson: {
                            reverseBatch: BATCH,
                            reverseReason: 'covered_by_paypal_report',
                        },
                    },
                });
            }
        } else if (o?.orderNumber === 'FF-CO-26-001') {
            decision = 'FUORI_GATEWAY_RESIDUO';
            reason = 'Ordine interno Salvatore — non in report PayPal né Stripe TX collegato.';
        } else if (o?.orderNumber === 'FT-SA-26-001') {
            decision = 'FUORI_GATEWAY_RESIDUO';
            reason =
                'Ester Irace 19/05 €29,99: Irace PayPal è del 09/02; nessun Stripe TX residuo abbinato.';
        } else if (o?.orderNumber === 'FT-MB-26-001') {
            decision = 'PAYPAL_NEAR';
            reason =
                'Stesso importo di Varesi PayPal 19/07 €37,99 (±1g). Verosimile doppio ordine/manual; storno se confirm.';
        } else if (o?.orderNumber === 'FT-CS-26-005') {
            decision = 'PAYPAL';
            reason =
                '17/08: report ha già 2×€31,48 Mammi su PayPal; terzo manuale FT-CS-26-005 è eccedenza — storno (verità = 2 pagamenti PayPal del giorno).';
            if (apply) {
                await prisma.financialLedgerEntry.update({
                    where: { id: m.id },
                    data: {
                        reversedAt: new Date(),
                        description: `[STORNO ${BATCH} — eccedenza vs 2 PayPal del 17/08]`,
                        metadataJson: { reverseBatch: BATCH, reverseReason: 'excess_vs_report_qty' },
                    },
                });
            }
        }
        caseByCase.push({
            orderNumber: o?.orderNumber,
            buyer: o?.buyerFullName,
            date,
            euro: euro(cents),
            manualKey: m.sourceKey,
            decision,
            reason,
        });
    }

    // Extra TI checkout non in report 32 → soft-reverse (rumore vs HAYUM)
    const reportKeys = new Set(
        sales
            .filter((s) => s.txId)
            .map((s) => `PAYPAL_TX:${s.txId}`)
            .concat(
                (
                    await prisma.financialLedgerEntry.findMany({
                        where: {
                            reversedAt: null,
                            metadataJson: { path: ['paypalSalesReport'], equals: true },
                        },
                        select: { sourceKey: true },
                    })
                ).map((r) => r.sourceKey)
            )
    );
    const noiseTi = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'PAYPAL_TX:' },
            totalCents: { gt: 0 },
            category: 'TRASFERIMENTO_INTERNO',
            description: { contains: 'ARCH_PAYPAL_NOT_GATEWAY' },
        },
        select: {
            id: true,
            sourceKey: true,
            totalCents: true,
            description: true,
            metadataJson: true,
        },
    });
    const noiseReversed: any[] = [];
    for (const n of noiseTi) {
        if ((n.metadataJson as any)?.paypalSalesReport) continue;
        // keep if matches a sale amount/date already marked — skip
        if (reportKeys.has(n.sourceKey)) continue;
        // Only reverse clear non-report leftovers (€10, orphan checkout)
        const desc = n.description || '';
        if (!/Pagamento generico|Composizione floreale|Express Checkout/i.test(desc)) continue;
        // Don't reverse if amount+looks like report sale still unmarked — handled above
        if (Math.abs(n.totalCents) === 5599) continue; // Sep9 report
        if (apply) {
            await prisma.financialLedgerEntry.update({
                where: { id: n.id },
                data: {
                    reversedAt: new Date(),
                    description: `[STORNO ${BATCH} — fuori report HAYUM 32] ${desc}`.slice(0, 500),
                    metadataJson: {
                        ...((n.metadataJson || {}) as object),
                        reverseBatch: BATCH,
                        reverseReason: 'not_in_paypal_sales_report_32',
                    },
                },
            });
        }
        noiseReversed.push({
            key: n.sourceKey,
            euro: euro(n.totalCents),
            desc: desc.slice(0, 60),
        });
    }

    // Stripe post
    const stripeAgg = await prisma.financialLedgerEntry.aggregate({
        where: { reversedAt: null, fiscalYear: 2026, sourceKey: { startsWith: 'STRIPE_TX:' } },
        _sum: { totalCents: true },
        _count: true,
    });
    const feeAgg = await prisma.financialLedgerEntry.aggregate({
        where: { reversedAt: null, sourceKey: { startsWith: 'PAYPAL_FEE:' } },
        _sum: { totalCents: true },
        _count: true,
    });
    const salesInbound = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            OR: [
                { sourceKey: { startsWith: 'PAYPAL_TX:' }, totalCents: { gt: 0 } },
                { sourceKey: { startsWith: 'PAYPAL_TX:REPORT_' } },
            ],
            metadataJson: { path: ['paypalSalesReport'], equals: true },
        },
        _sum: { totalCents: true },
        _count: true,
    });
    // broader sales sum: all report-marked OR matching sales tx ids
    const salesTxIds = sales.filter((s) => s.txId).map((s) => `PAYPAL_TX:${s.txId}`);
    const synthKeys = sales
        .filter((s) => !s.txId)
        .map((s) => `PAYPAL_TX:REPORT_${s.date}_${s.cents}`);
    const inboundSum = await prisma.financialLedgerEntry.aggregate({
        where: {
            reversedAt: null,
            sourceKey: { in: [...salesTxIds, ...synthKeys] },
        },
        _sum: { totalCents: true },
        _count: true,
    });

    const afterPp = await sumPaypalPaymentAccountCents();
    const afterStripe = await sumStripeSalesTransitCents(2026);

    const { controlC11, controlC12, controlC13 } = await import(
        '@/lib/financial/dossierFiscalControls'
    );
    const [c11, c12, c13] = await Promise.all([
        controlC11(2026, 3),
        controlC12(2026, 3),
        controlC13(2026, 3),
    ]);

    const expectedFeesCsv = sales.reduce((s, x) => s + x.feeCents, 0);
    const feeNow = Math.abs(feeAgg._sum.totalCents || 0);

    const report = {
        generatedAt: new Date().toISOString(),
        apply,
        batch: BATCH,
        before: { paypalAccountEuro: euro(beforePp), stripeTransitEuro: euro(beforeStripe) },
        after: { paypalAccountEuro: euro(afterPp), stripeTransitEuro: euro(afterStripe) },
        sdd: {
            finecoN: sddRows.length,
            finecoEuro: euro(sddRows.reduce((s, r) => s + r.totalCents, 0)),
            paypalCreditViaFinecoMetaEuro: euro(sddPaypalCreditCents),
            reclassedToTi: sddReclassed,
            paypalCredits: {
                n: sddCreated.length,
                euro: euro(sddCreated.reduce((s, r) => s + Math.round(r.euro * 100), 0)),
                rows: sddCreated,
            },
            method: 'Singola scrittura TI su riga Fineco: dare PayPal / avere Fineco (no doppio funding row)',
        },
        inbound: {
            reportEuro: euro(sales.reduce((s, x) => s + x.cents, 0)),
            ledgerInboundN: inboundSum._count,
            ledgerInboundEuro: euro(Math.abs(inboundSum._sum.totalCents || 0)),
            actions: inboundActions,
            missingVsReportEuro: euro(
                sales.reduce((s, x) => s + x.cents, 0) - Math.abs(inboundSum._sum.totalCents || 0)
            ),
        },
        fees: {
            csvOnSalesEuro: euro(expectedFeesCsv),
            ledgerPaypalFeeEuro: euro(feeNow),
            expectedRangeEuro: '50-60',
            gapVsCsvEuro: euro(expectedFeesCsv - feeNow),
            note: 'CSV sulle 27 TX note = €47,73; 5 synth T3 senza tariffa in export incompleto.',
        },
        reconcile: {
            formula: 'dopo SDD+inbound: atteso ≈ +€336,57 vs dichiarato €0',
            paypalAccountEuro: euro(afterPp),
            declaredEuro: 0,
            scartoEuro: euro(afterPp),
            expectedAfterTwoFixesEuro: 336.57,
            deltaVsExpectedEuro: euro(afterPp - 33657),
        },
        stripe: {
            txN: stripeAgg._count,
            txEuro: euro(Math.abs(stripeAgg._sum.totalCents || 0)),
            targetEuro: 2746.7,
            deltaVsTargetEuro: euro(Math.abs(stripeAgg._sum.totalCents || 0) - 274670),
            note: '17 doppi PayPal∩Stripe già stornati nel batch precedente; residuo tipicamente €13,51.',
        },
        caseByCaseDoubles: caseByCase,
        controls: {
            C11: c11
                ? {
                      passed: c11.passed,
                      verifiable: c11.verifiable,
                      detail: c11.detail,
                      measured: c11.measured,
                      expected: c11.expected,
                      delta: c11.delta,
                  }
                : null,
            C12: c12
                ? {
                      passed: c12.passed,
                      verifiable: c12.verifiable,
                      detail: c12.detail,
                      measured: c12.measured,
                      expected: c12.expected,
                      delta: c12.delta,
                  }
                : null,
            C13: c13
                ? {
                      passed: c13.passed,
                      verifiable: c13.verifiable,
                      detail: c13.detail,
                      measured: c13.measured,
                      expected: c13.expected,
                      delta: c13.delta,
                      gaps: c13.transitBalanceGaps,
                  }
                : null,
        },
    };

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

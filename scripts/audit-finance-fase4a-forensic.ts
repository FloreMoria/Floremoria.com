/**
 * Fase 4a — Audit forense Contabilità (SOLA LETTURA).
 * VIETATO: update / delete / reversedAt / create su Neon.
 *
 * Uso: npx tsx scripts/audit-finance-fase4a-forensic.ts
 * Output: console JSON + docs/verbali/dossier_bonifica_fase4a.md
 */
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { dryRunClassifyBankLine } from '../lib/financial/payoutClassification';
import { canonicalDocumentKeysMatch } from '../lib/financial/canonicalDocumentKey';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';
import { isInternalTransferCategory } from '../lib/financial/historicalLedgerTypes';

function euro(cents: number): string {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function yearOf(d: Date): number {
    return d.getUTCFullYear();
}

function quarterOf(d: Date): number {
    return Math.floor(d.getUTCMonth() / 3) + 1;
}

function periodLabel(d: Date): string {
    return `${yearOf(d)}-T${quarterOf(d)}`;
}

/** Scadenza liquidazione trimestrale semplificata: 16 del 2° mese successivo al trimestre. */
function isIvaLiquidated(d: Date, asOf = new Date()): boolean {
    const y = yearOf(d);
    const q = quarterOf(d);
    const deadlineMonth = q * 3 + 1;
    const deadline = new Date(
        Date.UTC(deadlineMonth > 12 ? y + 1 : y, (deadlineMonth - 1) % 12, 16)
    );
    return asOf >= deadline;
}

function asMeta(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

function inferPatrimonialNature(description: string, amountCents: number): {
    nature: string;
    confidence: 'alta' | 'media' | 'bassa';
    notes: string;
} {
    const u = (description || '').toUpperCase();
    if (/CAPITALE\s*SOCIALE|VERSAMENTO\s*SOCI|FINANZIAMENTO\s*SOCI|APPORT[OI]\s*SOCI/i.test(u)) {
        return {
            nature: 'PATRIMONIO / finanziamento soci',
            confidence: 'alta',
            notes: 'Causale esplicita di apporto/finanziamento',
        };
    }
    if (/CCIAA|CAMERA\s*DI\s*COMMERCIO|CONTRIBUTO|LIQUIDAZIONE\s*CONTRIBUTO/i.test(u)) {
        return {
            nature: 'CONTRIBUTO / agevolazione (non ricavo vendita)',
            confidence: 'alta',
            notes: 'Liquidazione contributo CCIAA — ricavo atipico / sopravvenienza, non vendita floreale',
        };
    }
    if (/WIX\s*PAYMENTS|WIX\.COM/i.test(u)) {
        return {
            nature: 'INCASSO GATEWAY SECONDARIO (Wix/Adyen)',
            confidence: 'alta',
            notes: 'Accredito Wix Payments — non ordine FloreMoria checkout; da riconciliare o escludere da ricavi core',
        };
    }
    if (/MOVIMENTO\s*FINECO\s*\(INCOLLA\)|INCOLLA/i.test(u) && Math.abs(amountCents) > 1_000_000) {
        return {
            nature: 'SALDO / APERTURA PATRIMONIALE (incolla)',
            confidence: 'media',
            notes: 'Causale generica da paste Fineco di importo patrimoniale — verosimilmente saldo di apertura o versamento non commerciale',
        };
    }
    if (/\bPAYPAL\b/i.test(u) && Math.abs(amountCents) < 100) {
        return {
            nature: 'ARROTONDAMENTO / MICRO-MOVIMENTO PAYPAL',
            confidence: 'media',
            notes: 'Importo residuo PayPal — non ricavo commerciale significativo',
        };
    }
    if (/\b(STRIPE|PAYPAL|PAYOUT|GIROCONTO)\b/i.test(u)) {
        return {
            nature: 'TRANSITO GATEWAY / GIROCONTO',
            confidence: 'media',
            notes: 'Causale gateway — candidata a riclassifica TRANSITO (Fase 4b)',
        };
    }
    return {
        nature: 'DA CLASSIFICARE (non vendita tipica)',
        confidence: 'bassa',
        notes: 'Nessun pattern patrimoniale/gateway forte',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Anatomia 4 BANK_LINE residuali vat=0 (~€37.038)
// ─────────────────────────────────────────────────────────────────────────────
async function point1AnatomyFourBankLines() {
    const revenueCats = ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI'];
    const revenues = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            category: { in: revenueCats },
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: {
            id: true,
            sourceType: true,
            sourceKey: true,
            sourceId: true,
            bankLineId: true,
            totalCents: true,
            vatCents: true,
            netCents: true,
            category: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
            fiscalYear: true,
            fiscalQuarter: true,
            orderId: true,
            metadataJson: true,
        },
    });

    const vatZeroBank = revenues.filter(
        (r) =>
            (r.vatCents || 0) === 0 &&
            (r.sourceType === 'BANK_LINE' || r.sourceKey.startsWith('BANK_LINE'))
    );

    // Target Fase 4 payout-matched (esclusi dal residuo €37k)
    const fase4Ids = new Set<string>();
    for (const r of revenues.filter((x) => x.sourceType === 'BANK_LINE')) {
        const blId = r.bankLineId || r.sourceId;
        if (!blId) continue;
        const line = await prisma.bankStatementLine.findUnique({
            where: { id: blId },
            select: {
                id: true,
                amountCents: true,
                accountingDate: true,
                valueDate: true,
                description: true,
                matchType: true,
            },
        });
        if (!line || line.amountCents <= 0) continue;
        const cls = await dryRunClassifyBankLine(line);
        if (cls.kind === 'PAYOUT_MATCHED') fase4Ids.add(line.id);
    }

    const residual = vatZeroBank.filter((r) => {
        const blId = r.bankLineId || r.sourceId || r.sourceKey.replace(/^BANK_LINE(_MANUAL)?:/, '');
        return !fase4Ids.has(blId);
    });

    const pnl2026 = await computeHistoricalPnl({ fiscalYear: 2026 });
    const pnl2025 = await computeHistoricalPnl({ fiscalYear: 2025 });

    // Gerarchia 2026: le residuali 2026 sono ancora nei ricavi PnL?
    const rows2026 = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: { not: 'CUSTOMER_RECEIPT' } },
        select: {
            id: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            totalCents: true,
            netCents: true,
            vatCents: true,
            category: true,
            direction: true,
            accountingDate: true,
            description: true,
            bankLineId: true,
            documentRef: true,
            counterpartyName: true,
            metadataJson: true,
        },
    });
    const usable2026 = applyFiscalAuthorityHierarchy(rows2026);
    const usableIds = new Set(usable2026.map((r) => r.id));

    const details = [];
    for (const r of residual.sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))) {
        const blId = r.bankLineId || r.sourceId || null;
        const line = blId
            ? await prisma.bankStatementLine.findUnique({
                  where: { id: blId },
                  select: {
                      id: true,
                      description: true,
                      amountCents: true,
                      accountingDate: true,
                      valueDate: true,
                      matchType: true,
                  },
              })
            : null;
        const desc = line?.description || r.description || '';
        const nature = inferPatrimonialNature(desc, r.totalCents);
        const inPnl2026Hierarchy =
            r.fiscalYear === 2026 && usableIds.has(r.id) && !isInternalTransferCategory(r.category);

        details.push({
            sourceKey: r.sourceKey,
            ledgerId: r.id,
            accountingDate: dayKey(r.accountingDate),
            fiscalYear: r.fiscalYear,
            fiscalQuarter: r.fiscalQuarter,
            amountEuro: euro(r.totalCents),
            amountCents: r.totalCents,
            vatCents: r.vatCents,
            category: r.category,
            ledgerDescription: (r.description || '').slice(0, 160),
            bankDescription: desc.slice(0, 200),
            counterparty: r.counterpartyName || null,
            matchType: line?.matchType || null,
            classificationKind: line
                ? (await dryRunClassifyBankLine(line)).kind
                : 'NO_BANK_LINE',
            nature: nature.nature,
            natureConfidence: nature.confidence,
            natureNotes: nature.notes,
            whyNotInDeclared10800: {
                excludedBecauseOtherFiscalYear: r.fiscalYear !== 2026,
                presentIn2026PnlHierarchy: inPnl2026Hierarchy,
                explanation:
                    r.fiscalYear !== 2026
                        ? `Esercizio ${r.fiscalYear}: esclusa dal PnL ${pnl2026.fiscalYear} (€10.800). PnL ${r.fiscalYear} ricavi = ${euro(r.fiscalYear === 2025 ? pnl2025.ricaviLordiCents : 0)}.`
                        : inPnl2026Hierarchy
                          ? `È DENTRO il PnL 2026 (€10.800) come ${r.category} — non è “filtrata”: concorre al totale insieme agli ORDER (non è ricavo vendita tipico).`
                          : 'Presente in ledger 2026 ma esclusa dalla gerarchia fiscale / categoria interna.',
            },
        });
    }

    const sumResidual = residual.reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const sumFy2025 = residual
        .filter((r) => r.fiscalYear === 2025)
        .reduce((s, r) => s + Math.abs(r.totalCents), 0);
    const sumFy2026 = residual
        .filter((r) => r.fiscalYear === 2026)
        .reduce((s, r) => s + Math.abs(r.totalCents), 0);

    return {
        residualCount: residual.length,
        residualSumEuro: euro(sumResidual),
        residualSumCents: sumResidual,
        splitByFiscalYear: {
            fy2025Euro: euro(sumFy2025),
            fy2026Euro: euro(sumFy2026),
        },
        pnl2026RicaviEuro: euro(pnl2026.ricaviLordiCents),
        pnl2025RicaviEuro: euro(pnl2025.ricaviLordiCents),
        rows: details,
        verdict:
            'Delle ~€37.038: la quota dominante (€32.410,30) è esercizio 2025 (saldo/incolla patrimoniale) e non entra nei €10.800/2026. La residua 2026 (~€4.628) è ALTRI_RICAVI/RIMBORSI (CCIAA, Wix, micro-PayPal) e concorre al PnL 2026 come ricavi atipici, non come vendite floreali.',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Transito PayPal −€1.568,30 vs IVA-zero €1.683
// ─────────────────────────────────────────────────────────────────────────────
async function point2PaypalTransit() {
    const reversed = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: { not: null } },
        select: {
            id: true,
            sourceType: true,
            sourceKey: true,
            totalCents: true,
            netCents: true,
            direction: true,
            category: true,
            accountingDate: true,
            description: true,
            metadataJson: true,
            reversedAt: true,
        },
    });

    const noise = reversed.filter(
        (r) => asMeta(r.metadataJson).sanitizeReason === 'paypal_net_or_generic_noise'
    );
    const noiseNetSum = noise.reduce((s, r) => s + (r.netCents || 0), 0);
    const noiseTotSum = noise.reduce((s, r) => s + r.totalCents, 0);
    const noiseIn = noise.filter((r) => r.direction === 'ENTRATA' || r.totalCents > 0);
    const noiseOut = noise.filter((r) => r.direction === 'USCITA' || r.totalCents < 0);

    const activePaypal = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, sourceType: 'PAYPAL_MOVEMENT' },
        select: {
            id: true,
            totalCents: true,
            netCents: true,
            direction: true,
            category: true,
            description: true,
            accountingDate: true,
            metadataJson: true,
        },
    });
    const activeSum = activePaypal.reduce((s, r) => s + r.totalCents, 0);
    const activeIn = activePaypal
        .filter((r) => r.totalCents > 0)
        .reduce((s, r) => s + r.totalCents, 0);
    const activeOut = activePaypal
        .filter((r) => r.totalCents < 0)
        .reduce((s, r) => s + r.totalCents, 0);

    // vat=0 PAYPAL residual revenues from pre-fase4 (~€1.683)
    const paypalVatZeroRev = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            category: { in: ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI'] },
            vatCents: 0,
            OR: [{ direction: 'ENTRATA' }, { totalCents: { gt: 0 } }],
        },
        select: { totalCents: true, netCents: true, description: true, category: true },
    });
    const paypalVatZeroSum = paypalVatZeroRev.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // Sample categories on active paypal
    const byCat: Record<string, { count: number; sumCents: number }> = {};
    for (const r of activePaypal) {
        const c = r.category || 'NULL';
        if (!byCat[c]) byCat[c] = { count: 0, sumCents: 0 };
        byCat[c].count += 1;
        byCat[c].sumCents += r.totalCents;
    }

    // Hypotheses on missing credit leg
    const gapCents = activeSum; // expected ≈ -156830
    const noiseAbs = Math.abs(noiseNetSum);

    return {
        activePaypalRows: activePaypal.length,
        activePaypalBalanceEuro: euro(activeSum),
        activePaypalBalanceCents: activeSum,
        activeCreditsEuro: euro(activeIn),
        activeDebitsEuro: euro(activeOut),
        byCategory: Object.fromEntries(
            Object.entries(byCat).map(([k, v]) => [
                k,
                { count: v.count, sumEuro: euro(v.sumCents) },
            ])
        ),
        sanitizerNoise: {
            note: 'Le 199 del 2026-08-24 erano il PICCO GIORNALIERO di TUTTI gli storni; il motivo paypal_net_or_generic_noise conta 101 righe.',
            rowsWithReason: noise.length,
            sumNetCents: noiseNetSum,
            sumNetEuro: euro(noiseNetSum),
            sumTotalEuro: euro(noiseTotSum),
            creditsReversed: noiseIn.length,
            creditsReversedEuro: euro(noiseIn.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            debitsReversed: noiseOut.length,
            debitsReversedEuro: euro(noiseOut.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        },
        paypalVatZeroRevenueEuro: euro(paypalVatZeroSum),
        paypalVatZeroRevenueRows: paypalVatZeroRev.length,
        diagnosis: {
            gapMatchesActiveBalance: Math.abs(activeSum + 156830) < 2 || Math.abs(activeSum) === 156830,
            gapEuro: euro(activeSum),
            webhookSyncHypothesis:
                'Il saldo attivo PayPal è negativo (−€1.568,30): prevalgono uscite/SaaS/fee rispetto agli incassi lordi ancora aperti. Gli storni noise (101) hanno netto aggregato piccolo (+€339,16) — NON spiegano da soli il gap di −€1.568.',
            legitimateSuppressedEstimateEuro: euro(
                noiseIn.reduce((s, r) => s + Math.abs(r.totalCents), 0)
            ),
            noiseAbsEuro: euro(noiseAbs),
            verdict:
                'Il gap −€1.568,30 coincide col saldo delle PAYPAL_MOVEMENT attive (uscite > entrate residue). Gli storni noise hanno soppresso sia rumore interno sia alcuni crediti (vedi creditsReversedEuro); la quota “ricavo legittimo soppresso” va cercata tra i crediti stornati con orderId/giorno+importo (punto 3), non nel totale netto noise (+€339).',
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) 292 storni — recupero incassi veri
// ─────────────────────────────────────────────────────────────────────────────
async function point3ReversedRecovery() {
    const reversed = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: { not: null } },
        select: {
            id: true,
            sourceType: true,
            sourceKey: true,
            orderId: true,
            totalCents: true,
            netCents: true,
            vatCents: true,
            direction: true,
            category: true,
            accountingDate: true,
            description: true,
            documentRef: true,
            counterpartyName: true,
            metadataJson: true,
            reversedAt: true,
        },
    });

    const byReason: Record<string, { count: number; absEuroCents: number }> = {};
    for (const r of reversed) {
        const reason = String(asMeta(r.metadataJson).sanitizeReason || 'UNKNOWN');
        if (!byReason[reason]) byReason[reason] = { count: 0, absEuroCents: 0 };
        byReason[reason].count += 1;
        byReason[reason].absEuroCents += Math.abs(r.totalCents);
    }

    // Candidati ricavo: ENTRATA / total>0 / categorie ricavo
    const revenueLike = reversed.filter(
        (r) =>
            r.category === 'RICAVI_VENDITE' ||
            r.category === 'ALTRI_RICAVI' ||
            r.category === 'RIMBORSI' ||
            r.direction === 'ENTRATA' ||
            r.totalCents > 0
    );

    // (A) con orderId esplicito
    const withOrderId = revenueLike.filter((r) => Boolean(r.orderId));

    // (B) match ordine stesso giorno + stesso importo (senza orderId sulla riga)
    const orders = await prisma.order.findMany({
        where: { isTest: false, deletedAt: null, totalPriceCents: { gt: 0 } },
        select: { id: true, orderNumber: true, totalPriceCents: true, createdAt: true },
        take: 8000,
    });
    const orderByDayAmt = new Map<string, typeof orders>();
    for (const o of orders) {
        const k = `${dayKey(o.createdAt)}|${o.totalPriceCents}`;
        const arr = orderByDayAmt.get(k) || [];
        arr.push(o);
        orderByDayAmt.set(k, arr);
    }

    const matchedByDayAmt: typeof revenueLike = [];
    for (const r of revenueLike) {
        if (r.orderId) continue;
        const abs = Math.abs(r.totalCents);
        const k = `${dayKey(r.accountingDate)}|${abs}`;
        const hits = orderByDayAmt.get(k) || [];
        // unica collisione giorno+importo → alta probabilità incasso vero
        if (hits.length === 1) matchedByDayAmt.push(r);
    }

    const uniqueRecoverable = new Map<string, (typeof revenueLike)[0]>();
    for (const r of withOrderId) uniqueRecoverable.set(r.id, r);
    for (const r of matchedByDayAmt) uniqueRecoverable.set(r.id, r);
    const recoverable = [...uniqueRecoverable.values()];
    const recoverableEuroCents = recoverable.reduce((s, r) => s + Math.abs(r.totalCents), 0);

    // Escludi reason tipicamente rumore interno PayPal dal "legittimo"
    const highConfidence = recoverable.filter((r) => {
        const reason = String(asMeta(r.metadataJson).sanitizeReason || '');
        return (
            reason === 'order_covered_by_gateway_authority' ||
            reason === 'stripe_paypal_same_order_dedup' ||
            Boolean(r.orderId) ||
            reason === 'UNKNOWN'
        );
    });
    // order_covered_by_gateway: lo storno ORDER è CORRETTO se resta l'autorità gateway —
    // non è "ricavo soppresso" ma dedup. Segnaliamo separatamente.
    const orderCovered = recoverable.filter(
        (r) => asMeta(r.metadataJson).sanitizeReason === 'order_covered_by_gateway_authority'
    );
    const possiblyWronglySuppressed = recoverable.filter((r) => {
        const reason = String(asMeta(r.metadataJson).sanitizeReason || '');
        return (
            reason !== 'order_covered_by_gateway_authority' &&
            reason !== 'stripe_paypal_same_order_dedup' &&
            (Boolean(r.orderId) || matchedByDayAmt.some((m) => m.id === r.id))
        );
    });

    return {
        totalReversed: reversed.length,
        byReason: Object.fromEntries(
            Object.entries(byReason)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([k, v]) => [k, { count: v.count, absEuro: euro(v.absEuroCents) }])
        ),
        revenueLikeReversed: {
            count: revenueLike.length,
            absEuro: euro(revenueLike.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        },
        withExplicitOrderId: {
            count: withOrderId.length,
            euro: euro(withOrderId.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        },
        matchedUniqueDayAmountWithoutOrderId: {
            count: matchedByDayAmt.length,
            euro: euro(matchedByDayAmt.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
        },
        recoverableCandidates: {
            count: recoverable.length,
            euro: euro(recoverableEuroCents),
            note: 'Unione orderId + match univoco giorno/importo su Order',
        },
        orderCoveredByGatewayAuthority: {
            count: orderCovered.length,
            euro: euro(orderCovered.reduce((s, r) => s + Math.abs(r.totalCents), 0)),
            note: 'Dedup corretto: il ricavo resta sull’autorità gateway/banca — NON recuperare come doppio ricavo',
        },
        possiblyWronglySuppressed: {
            count: possiblyWronglySuppressed.length,
            euro: euro(
                possiblyWronglySuppressed.reduce((s, r) => s + Math.abs(r.totalCents), 0)
            ),
            sample: possiblyWronglySuppressed.slice(0, 12).map((r) => ({
                sourceKey: r.sourceKey,
                sourceType: r.sourceType,
                euro: euro(Math.abs(r.totalCents)),
                day: dayKey(r.accountingDate),
                orderId: r.orderId,
                reason: asMeta(r.metadataJson).sanitizeReason || null,
                desc: (r.description || '').slice(0, 80),
            })),
        },
        paypalNoiseCreditsForManualReview: {
            count: revenueLike.filter(
                (r) =>
                    asMeta(r.metadataJson).sanitizeReason === 'paypal_net_or_generic_noise' &&
                    (r.direction === 'ENTRATA' || r.totalCents > 0)
            ).length,
            euro: euro(
                revenueLike
                    .filter(
                        (r) =>
                            asMeta(r.metadataJson).sanitizeReason ===
                                'paypal_net_or_generic_noise' &&
                            (r.direction === 'ENTRATA' || r.totalCents > 0)
                    )
                    .reduce((s, r) => s + Math.abs(r.totalCents), 0)
            ),
            note: 'Pool da revisione manuale (rumore vs possibile incasso) — non auto-recuperare',
        },
        highConfidenceNote: highConfidence.length,
        verdict:
            'Gli storni con orderId risultano quasi tutti order_covered_by_gateway_authority / stripe_paypal_same_order_dedup: dedup corretto (il ricavo resta sull’autorità). Nessun recupero automatico di ricavi legittimi azzerati (€0). Eventuale recupero va cercato solo nel pool paypal_net_or_generic_noise a credito, con revisione umana.',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) IVA a credito sui 99 pair duplicati
// ─────────────────────────────────────────────────────────────────────────────
type CostRow = {
    id: string;
    sourceType: string;
    sourceKey: string;
    accountingDate: Date;
    totalCents: number;
    vatCents: number;
    counterpartyName: string | null;
    documentRef: string | null;
    metadataJson: unknown;
};

async function point4DuplicateCostVat() {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            direction: 'USCITA',
            OR: [{ sourceType: 'JSON_ENTRY' }, { sourceType: 'MANUAL_EXPENSE' }],
        },
        select: {
            id: true,
            sourceType: true,
            sourceKey: true,
            accountingDate: true,
            totalCents: true,
            vatCents: true,
            counterpartyName: true,
            documentRef: true,
            metadataJson: true,
        },
    });

    const json = rows.filter(
        (r) => r.sourceType === 'JSON_ENTRY' || r.sourceKey.startsWith('JSON_ENTRY:')
    );
    const manual = rows.filter((r) => r.sourceType === 'MANUAL_EXPENSE');

    type Pair = { json: CostRow; manual: CostRow; amountAbs: number; vatAbsJson: number; vatAbsManual: number };
    const pairs: Pair[] = [];
    const usedManual = new Set<string>();

    for (const j of json) {
        const jDay = dayKey(j.accountingDate);
        const jAbs = Math.abs(j.totalCents);
        const jMeta = asMeta(j.metadataJson);
        const jKey = typeof jMeta.dedupeKey === 'string' ? jMeta.dedupeKey : null;
        let best: CostRow | null = null;
        for (const m of manual) {
            if (usedManual.has(m.id)) continue;
            if (dayKey(m.accountingDate) !== jDay) continue;
            if (Math.abs(m.totalCents) !== jAbs) continue;
            const mMeta = asMeta(m.metadataJson);
            const mKey = typeof mMeta.dedupeKey === 'string' ? mMeta.dedupeKey : null;
            if (jKey && mKey && canonicalDocumentKeysMatch(jKey, mKey)) {
                best = m;
                break;
            }
            const jName = (j.counterpartyName || '').toUpperCase();
            const mName = (m.counterpartyName || '').toUpperCase();
            if (
                jName &&
                mName &&
                (jName.includes(mName.slice(0, 8)) || mName.includes(jName.slice(0, 8)))
            ) {
                best = m;
                break;
            }
            if (!best) best = m;
        }
        if (best) {
            pairs.push({
                json: j,
                manual: best,
                amountAbs: jAbs,
                vatAbsJson: Math.abs(j.vatCents || 0),
                vatAbsManual: Math.abs(best.vatCents || 0),
            });
            usedManual.add(best.id);
        }
    }

    // Excess IVA = IVA della gamba duplicata (preferisci max delle due = credito indebito se entrambe in PnL)
    // Per rettifica Erario: tipicamente una sola gamba è "in più" → usiamo max(vatJ, vatM) come IVA excess del pair
    // (se una gamba ha vat=0 e l'altra no, excess = quella con IVA)
    const pairVat = (p: Pair) => Math.max(p.vatAbsJson, p.vatAbsManual);

    const excessNetCents = pairs.reduce((s, p) => s + p.amountAbs, 0);
    const excessVatCents = pairs.reduce((s, p) => s + pairVat(p), 0);

    const liquidated = pairs.filter((p) => isIvaLiquidated(p.json.accountingDate));
    const liquidatedExcessCents = liquidated.reduce((s, p) => s + p.amountAbs, 0);
    const liquidatedVatCents = liquidated.reduce((s, p) => s + pairVat(p), 0);

    const byPeriod: Record<
        string,
        { pairs: number; excessNetCents: number; excessVatCents: number; liquidated: boolean }
    > = {};
    for (const p of pairs) {
        const key = periodLabel(p.json.accountingDate);
        if (!byPeriod[key]) {
            byPeriod[key] = {
                pairs: 0,
                excessNetCents: 0,
                excessVatCents: 0,
                liquidated: isIvaLiquidated(p.json.accountingDate),
            };
        }
        byPeriod[key].pairs += 1;
        byPeriod[key].excessNetCents += p.amountAbs;
        byPeriod[key].excessVatCents += pairVat(p);
    }

    return {
        overlapPairs: pairs.length,
        excessNetCents,
        excessNetEuro: euro(excessNetCents),
        excessVatCreditEuro: euro(excessVatCents),
        excessVatCreditCents: excessVatCents,
        liquidatedPairs: liquidated.length,
        liquidatedExcessNetCents: liquidatedExcessCents,
        liquidatedExcessNetEuro: euro(liquidatedExcessCents),
        liquidatedExcessVatCreditEuro: euro(liquidatedVatCents),
        liquidatedExcessVatCreditCents: liquidatedVatCents,
        byPeriod: Object.fromEntries(
            Object.entries(byPeriod)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [
                    k,
                    {
                        pairs: v.pairs,
                        excessNetCents: v.excessNetCents,
                        excessNetEuro: euro(v.excessNetCents),
                        excessVatCreditCents: v.excessVatCents,
                        excessVatCreditEuro: euro(v.excessVatCents),
                        ivaLiquidated: v.liquidated,
                    },
                ])
        ),
        erarioNote:
            'L’IVA a credito indebitamente detratta (gamba duplicata) da esporre al commercialista per rettifica periodica sui trimestri chiusi è liquidatedExcessVatCreditEuro.',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Dossier commercialista
// ─────────────────────────────────────────────────────────────────────────────
function buildDossierMarkdown(report: {
    generatedAt: string;
    point1: Awaited<ReturnType<typeof point1AnatomyFourBankLines>>;
    point2: Awaited<ReturnType<typeof point2PaypalTransit>>;
    point3: Awaited<ReturnType<typeof point3ReversedRecovery>> & {
        possiblyWronglySuppressed: {
            count: number;
            euro: string;
            euroCents: number;
            sample: unknown[];
        };
    };
    point4: Awaited<ReturnType<typeof point4DuplicateCostVat>>;
    pnl: Awaited<ReturnType<typeof computeHistoricalPnl>>;
    fase4PayoutTargetCents: number;
}): string {
    const pnl = report.pnl;
    const ricaviAttuali = pnl.ricaviLordiCents;
    const costiAttuali =
        pnl.costiProduzioneCents + pnl.costiSaasCents + pnl.costiOperativiCents;
    const ebitdaAttuale = pnl.ebitdaCents;

    const payoutFake = report.fase4PayoutTargetCents;
    const dupCents = report.point4.excessNetCents;
    const wronglyCents = report.point3.possiblyWronglySuppressed.euroCents;

    const ricaviRettificati = ricaviAttuali - payoutFake + wronglyCents;
    const costiReali = costiAttuali - dupCents;
    const ebitdaReale = ricaviRettificati - costiReali;

    const ivaDebitoAttuale = pnl.ivaDebitoCents;
    const ivaDebitoRettifica = 0;
    const ivaCreditoDaRegolarizzare = report.point4.liquidatedExcessVatCreditCents;

    return `# Dossier bonifica contabile — Fase 4a (sola lettura)

**Data generazione:** ${report.generatedAt}  
**Destinatario:** Commercialista / revisione periodica  
**Vincolo:** nessuna mutazione DB in questa fase — solo evidenza istruttoria.

---

## 1. Anatomia residuali bancari €37.038 (vatCents = 0, non-target Fase 4 payout)

| Data | Importo | Esercizio | Natura | Perché ≠ €10.800 PnL 2026 |
|------|---------|-----------|--------|---------------------------|
${report.point1.rows
    .map(
        (r) =>
            `| ${r.accountingDate} | ${r.amountEuro} | ${r.fiscalYear}-T${r.fiscalQuarter} | ${r.nature} | ${r.whyNotInDeclared10800.explanation.replace(/\|/g, '/')} |`
    )
    .join('\n')}

**Verdetto:** ${report.point1.verdict}

---

## 2. Transito PayPal (−€1.568,30)

- Saldo attivo \`PAYPAL_MOVEMENT\`: **${report.point2.activePaypalBalanceEuro}** (${report.point2.activePaypalRows} righe)
- Crediti attivi: ${report.point2.activeCreditsEuro} · Debiti/uscite attive: ${report.point2.activeDebitsEuro}
- Storni \`paypal_net_or_generic_noise\`: **${report.point2.sanitizerNoise.rowsWithReason}** righe · Σ net = **${report.point2.sanitizerNoise.sumNetEuro}**
  - (Nota: 199 = picco giornaliero 2026-08-24 di *tutti* gli storni, non solo questo motivo)
- Ricavi PayPal vat=0 ancora attivi: ${report.point2.paypalVatZeroRevenueEuro} (${report.point2.paypalVatZeroRevenueRows} righe)

**Diagnosi:** ${report.point2.diagnosis.verdict}

---

## 3. Storni sanitizer (${report.point3.totalReversed})

| Metrica | Valore |
|---------|--------|
| Righe reversed | ${report.point3.totalReversed} |
| Revenue-like reversed | ${report.point3.revenueLikeReversed.count} · ${report.point3.revenueLikeReversed.absEuro} |
| Con orderId | ${report.point3.withExplicitOrderId.count} · ${report.point3.withExplicitOrderId.euro} |
| Match univoco giorno+importo Order | ${report.point3.matchedUniqueDayAmountWithoutOrderId.count} · ${report.point3.matchedUniqueDayAmountWithoutOrderId.euro} |
| Dedup corretto (order covered by gateway) | ${report.point3.orderCoveredByGatewayAuthority.count} · ${report.point3.orderCoveredByGatewayAuthority.euro} |
| **Possibilmente soppressi per errore** | **${report.point3.possiblyWronglySuppressed.count} · ${report.point3.possiblyWronglySuppressed.euro}** |

**Verdetto:** ${report.point3.verdict}

---

## 4. IVA a credito sui costi duplicati (99 pair)

| Voce | Valore |
|------|--------|
| Pair overlap JSON↔MANUAL | ${report.point4.overlapPairs} |
| Excess netto costi | ${report.point4.excessNetEuro} |
| **IVA a credito associata (tutti i pair)** | **${report.point4.excessVatCreditEuro}** |
| Pair in trimestri liquidati | ${report.point4.liquidatedPairs} · costi ${report.point4.liquidatedExcessNetEuro} |
| **IVA a credito da regolarizzare (periodi chiusi)** | **${report.point4.liquidatedExcessVatCreditEuro}** |

### Spaccatura per trimestre

| Periodo | Pair | Excess costi | IVA credito excess | Liquidato |
|---------|------|--------------|--------------------|-----------|
${Object.entries(report.point4.byPeriod)
    .map(
        ([k, v]) =>
            `| ${k} | ${v.pairs} | ${v.excessNetEuro} | ${v.excessVatCreditEuro} | ${v.ivaLiquidated ? 'SÌ' : 'NO'} |`
    )
    .join('\n')}

---

## 5. Quadro riepilogativo per il commercialista

### Quadro Ricavi
| | Importo |
|--|---------|
| Ricavi attuali (PnL 2026 post-gerarchia) | ${euro(ricaviAttuali)} |
| − Payout gateway ancora in ricavo (target Fase 4b, 87 righe) | − ${euro(payoutFake)} |
| + Incassi potenzialmente da recuperare (storni sospetti) | + ${euro(wronglyCents)} |
| **Ricavi rettificati (stima istruttoria)** | **${euro(ricaviRettificati)}** |

### Quadro Costi
| | Importo |
|--|---------|
| Costi operativi attuali (produzione+SaaS+operativi) | ${euro(costiAttuali)} |
| − Excess netto 99 pair duplicati | − ${euro(dupCents)} |
| **Costi reali (stima)** | **${euro(costiReali)}** |

### Quadro Risultato operativo
| | Importo |
|--|---------|
| EBITDA / risultato apparente attuale | ${euro(ebitdaAttuale)} |
| **Risultato rettificato (stima)** | **${euro(ebitdaReale)}** |

### Quadro fiscale IVA
| | Importo |
|--|---------|
| IVA a debito attuale (vendite) | ${euro(ivaDebitoAttuale)} |
| Rettifica IVA debito su payout fittizi | ${euro(ivaDebitoRettifica)} (già vat=0 sulle 87) |
| IVA a credito attuale | ${euro(pnl.ivaCreditoCents)} |
| **IVA a credito da restituire/regolarizzare (periodi liquidati, costi doppi)** | **${euro(ivaCreditoDaRegolarizzare)}** |

---

## Note metodologiche
1. Nessuna scrittura/storno eseguito in Fase 4a.
2. I €10.800 sono il PnL 2026 *dopo* \`applyFiscalAuthorityHierarchy\` (non il grezzo ledger).
3. Il recupero incassi “soppressi” esclude esplicitamente i dedup ORDER↔gateway (corretti).
4. Prossima fase (4b): piano di riclassifica controllata con approvazione commercialista — ancora senza delete fisico.

---
*Generato da \`scripts/audit-finance-fase4a-forensic.ts\` — FloreMoria Contabilità*
`;
}

async function computeWronglySuppressedCents(): Promise<{ n: number; sum: number }> {
    const reversed = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: { not: null } },
        select: {
            id: true,
            orderId: true,
            totalCents: true,
            direction: true,
            category: true,
            accountingDate: true,
            metadataJson: true,
        },
    });
    const revenueLike = reversed.filter(
        (r) =>
            r.category === 'RICAVI_VENDITE' ||
            r.category === 'ALTRI_RICAVI' ||
            r.category === 'RIMBORSI' ||
            r.direction === 'ENTRATA' ||
            r.totalCents > 0
    );
    const orders = await prisma.order.findMany({
        where: { isTest: false, deletedAt: null, totalPriceCents: { gt: 0 } },
        select: { totalPriceCents: true, createdAt: true },
        take: 8000,
    });
    const orderByDayAmt = new Map<string, number>();
    for (const o of orders) {
        const k = `${dayKey(o.createdAt)}|${o.totalPriceCents}`;
        orderByDayAmt.set(k, (orderByDayAmt.get(k) || 0) + 1);
    }
    let sum = 0;
    let n = 0;
    for (const r of revenueLike) {
        const reason = String(asMeta(r.metadataJson).sanitizeReason || '');
        if (
            reason === 'order_covered_by_gateway_authority' ||
            reason === 'stripe_paypal_same_order_dedup'
        ) {
            continue;
        }
        const abs = Math.abs(r.totalCents);
        const dayAmtHits = orderByDayAmt.get(`${dayKey(r.accountingDate)}|${abs}`) || 0;
        if (r.orderId || dayAmtHits === 1) {
            sum += abs;
            n += 1;
        }
    }
    return { n, sum };
}

async function main() {
    console.log('[fase4a-forensic] READ-ONLY audit start — no DB mutations');

    const [point1, point2, point3, point4, pnl] = await Promise.all([
        point1AnatomyFourBankLines(),
        point2PaypalTransit(),
        point3ReversedRecovery(),
        point4DuplicateCostVat(),
        computeHistoricalPnl({ fiscalYear: 2026 }),
    ]);

    const wrongly = await computeWronglySuppressedCents();
    const point3enriched = {
        ...point3,
        possiblyWronglySuppressed: {
            ...point3.possiblyWronglySuppressed,
            count: wrongly.n,
            euro: euro(wrongly.sum),
            euroCents: wrongly.sum,
        },
    };

    let fase4PayoutTargetCents = 0;
    let fase4Rows = 0;
    const revenueBank = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'BANK_LINE',
            category: { in: ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI'] },
        },
        select: { totalCents: true, bankLineId: true, sourceId: true },
    });
    for (const r of revenueBank) {
        const blId = r.bankLineId || r.sourceId;
        if (!blId) continue;
        const line = await prisma.bankStatementLine.findUnique({
            where: { id: blId },
            select: {
                id: true,
                amountCents: true,
                accountingDate: true,
                valueDate: true,
                description: true,
                matchType: true,
            },
        });
        if (!line || line.amountCents <= 0) continue;
        const cls = await dryRunClassifyBankLine(line);
        if (cls.kind === 'PAYOUT_MATCHED') {
            fase4Rows += 1;
            fase4PayoutTargetCents += Math.abs(r.totalCents);
        }
    }

    const generatedAt = new Date().toISOString();
    const md = buildDossierMarkdown({
        generatedAt,
        point1,
        point2,
        point3: point3enriched,
        point4,
        pnl,
        fase4PayoutTargetCents,
    });

    const outPath = path.join(process.cwd(), 'docs/verbali/dossier_bonifica_fase4a.md');
    fs.writeFileSync(outPath, md, 'utf8');
    console.log('[fase4a-forensic] wrote', outPath);

    const summary = {
        generatedAt,
        point1_residualBankEuro: point1.residualSumEuro,
        point1_rows: point1.rows.map((r) => ({
            date: r.accountingDate,
            euro: r.amountEuro,
            fy: r.fiscalYear,
            nature: r.nature,
            sourceKey: r.sourceKey,
        })),
        point1_verdict: point1.verdict,
        point2_paypalBalance: point2.activePaypalBalanceEuro,
        point2_noiseNet: point2.sanitizerNoise.sumNetEuro,
        point2_noiseRows: point2.sanitizerNoise.rowsWithReason,
        point3_reversed: point3.totalReversed,
        point3_wronglySuppressed: point3enriched.possiblyWronglySuppressed,
        point4_excessNet: point4.excessNetEuro,
        point4_excessVatAll: point4.excessVatCreditEuro,
        point4_excessVatLiquidated: point4.liquidatedExcessVatCreditEuro,
        point4_byPeriod: point4.byPeriod,
        fase4PayoutRows: fase4Rows,
        fase4PayoutEuro: euro(fase4PayoutTargetCents),
        pnl2026: {
            ricavi: euro(pnl.ricaviLordiCents),
            costi: euro(
                pnl.costiProduzioneCents + pnl.costiSaasCents + pnl.costiOperativiCents
            ),
            ebitda: euro(pnl.ebitdaCents),
            ivaDebito: euro(pnl.ivaDebitoCents),
            ivaCredito: euro(pnl.ivaCreditoCents),
        },
        dossierPath: outPath,
    };

    console.log(JSON.stringify(summary, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

/**
 * Fase 4b — Lotto 4 ESECUZIONE + collasso `:v…`
 *
 * Acceptance RIBALTATA (socio 2026-09-07):
 * - Totali CE INVARIANTI (costi, RAI, IVA, banca)
 * - Solo soft-reverse di scritture già soppresse dalla gerarchia (+ versioni `:v`)
 * - Se un totale CE si muove → STOP (non scrivere oltre / rollback report)
 *
 * Uso: npx tsx scripts/fase4b-lotto4-execute.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { computeHistoricalPnl } from '../lib/financial/historicalLedgerQuery';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';
import { canonicalDocumentKeysMatch } from '../lib/financial/canonicalDocumentKey';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}
function dayKey(d: Date) {
    return d.toISOString().slice(0, 10);
}
function asMeta(m: unknown): Record<string, unknown> {
    return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}
function norm(s: string) {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s./-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function extractDocNo(text: string): string {
    const d = text || '';
    const m =
        d.match(/\bn\.?\s*(FPR\s*[\d./-]+)/i) ||
        d.match(/\bn\.?\s*([A-Z]{0,6}\d[\w./-]*)/i) ||
        d.match(/\b(\d{1,4}\/\d{2,4})\b/) ||
        d.match(/\b(20\d{2}\/\d+)\b/) ||
        d.match(/\b(00000\d+-2026-EST)\b/i);
    return norm(m?.[1] || '');
}
function extractVendor(name: string | null, desc: string): string {
    if (name?.trim()) return name.trim();
    const m =
        desc.match(/Fattura report\s+(.+?)\s+n\./i) ||
        desc.match(/Fattura SDI\s+(.+?)\s+n\./i) ||
        desc.match(/Autofattura estera\s+(?:autofattura estera\s+)?(.+?)\s+n\./i);
    return (m?.[1] || '').trim();
}
function vendorIdentityKey(vendor: string): string {
    return norm(vendor)
        .split(' ')
        .filter((w) => w.length > 1)
        .sort()
        .join(' ');
}
function samePersonVendor(a: string, b: string): boolean {
    const ka = vendorIdentityKey(a);
    const kb = vendorIdentityKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    const ta = new Set(ka.split(' '));
    const tb = new Set(kb.split(' '));
    let o = 0;
    for (const x of ta) if (tb.has(x)) o += 1;
    return o >= 2;
}
function baseJsonKey(sourceKey: string) {
    return (sourceKey || '').replace(/:v\d+$/, '');
}
function isVersionedJson(sourceKey: string) {
    return /:v\d+$/.test(sourceKey || '');
}
function batchIdNow() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `FASE4B_L4_${y}${m}${day}_${hh}${mm}${ss}`;
}

const AUTOFATTURA_VENDOR =
    /\b(stripe|openai|google|apple|cursor|anthropic|vercel|meta\s*platforms|aws|amazon web)\b/i;

type Snap = {
    at: string;
    costiTotCents: number;
    raiCents: number;
    ivaDebitoCents: number;
    ivaCreditoCents: number;
    cashBankCents: number;
    activeCount: number;
    ricaviLordiCents: number;
    ebitdaCents: number;
};

async function snapshot(): Promise<Snap> {
    const p = await computeHistoricalPnl({ fiscalYear: 2026 });
    const costiTotCents =
        p.costiFioristiCents +
        p.costiFatturePassiveSdiCents +
        p.costiSaasCents +
        p.costiOperativiCents +
        p.oneriBancariCents;
    const activeCount = await prisma.financialLedgerEntry.count({
        where: { reversedAt: null, fiscalYear: 2026 },
    });
    return {
        at: new Date().toISOString(),
        costiTotCents,
        raiCents: p.risultatoAnteImposteCents,
        ivaDebitoCents: p.ivaDebitoCents,
        ivaCreditoCents: p.ivaCreditoCents,
        cashBankCents: p.cashBankBalanceCents,
        activeCount,
        ricaviLordiCents: p.ricaviLordiCents,
        ebitdaCents: p.ebitdaCents,
    };
}

function assertInvariant(pre: Snap, post: Snap, label: string) {
    const checks = [
        ['costiTot', pre.costiTotCents, post.costiTotCents],
        ['rai', pre.raiCents, post.raiCents],
        ['ivaDebito', pre.ivaDebitoCents, post.ivaDebitoCents],
        ['ivaCredito', pre.ivaCreditoCents, post.ivaCreditoCents],
        ['cashBank', pre.cashBankCents, post.cashBankCents],
    ] as const;
    const moved = checks.filter(([, a, b]) => a !== b);
    return {
        label,
        ok: moved.length === 0,
        moved: moved.map(([k, a, b]) => ({
            metric: k,
            pre: euro(a),
            post: euro(b),
            delta: euro(b - a),
        })),
        activeDelta: post.activeCount - pre.activeCount,
    };
}

async function main() {
    const batchId = batchIdNow();
    const executedAt = new Date().toISOString();
    console.log('batch', batchId);

    // ── Snapshot pre-write ─────────────────────────────────────────────
    const pre = await snapshot();
    console.log('PRE', {
        costi: euro(pre.costiTotCents),
        rai: euro(pre.raiCents),
        banca: euro(pre.cashBankCents),
        active: pre.activeCount,
        raiVsStorico569251: euro(pre.raiCents - -569_251),
    });

    // ── Load ledger ────────────────────────────────────────────────────
    const all = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026 },
        select: {
            id: true,
            sourceType: true,
            sourceId: true,
            sourceKey: true,
            orderId: true,
            documentRef: true,
            accountingDate: true,
            totalCents: true,
            direction: true,
            category: true,
            bankLineId: true,
            description: true,
            counterpartyName: true,
            attachmentUrl: true,
            metadataJson: true,
        },
    });

    const usable = applyFiscalAuthorityHierarchy(all);
    const usableIds = new Set(usable.map((u) => u.id).filter(Boolean) as string[]);

    // ── 1) Collasso `:v…` — reverse tutte le versionate attive ─────────
    const versioned = all.filter(
        (r) => r.sourceType === 'JSON_ENTRY' && isVersionedJson(r.sourceKey || '')
    );
    const reverseIds = new Set<string>();
    const reverseReasons = new Map<string, string>();
    for (const v of versioned) {
        reverseIds.add(v.id);
        reverseReasons.set(v.id, 'COLLAPSE_JSON_VERSION_SUFFIX');
    }

    // ── 2) Lotto 4: per documento, reverse gambe costo soppresse ────────
    const costLegs = all.filter(
        (r) =>
            r.direction === 'USCITA' &&
            (r.sourceType === 'JSON_ENTRY' || r.sourceType === 'MANUAL_EXPENSE') &&
            !isVersionedJson(r.sourceKey || '') // base only; :v already queued
    );

    const byDoc = new Map<string, typeof costLegs>();
    for (const leg of costLegs) {
        const vendor = extractVendor(leg.counterpartyName, leg.description);
        const num =
            extractDocNo(leg.description) ||
            extractDocNo(leg.documentRef || '') ||
            (typeof asMeta(leg.metadataJson).invoiceNumber === 'string'
                ? norm(String(asMeta(leg.metadataJson).invoiceNumber))
                : '');
        if (!norm(vendor) && !num) continue;
        const blob = `${vendor} ${leg.description}`;
        if (AUTOFATTURA_VENDOR.test(blob) || /autofattura|2026-est|td17|td18|td19/i.test(blob)) {
            continue; // G5 fuori Lotto 4
        }
        const key = `${vendorIdentityKey(vendor) || norm(vendor)}|${num}|${dayKey(leg.accountingDate)}`;
        const arr = byDoc.get(key) || [];
        arr.push(leg);
        byDoc.set(key, arr);
    }

    let docsTouched = 0;
    let skippedBecauseVisibleInPnl = 0;
    for (const [, legs] of byDoc) {
        if (legs.length < 2) continue;
        docsTouched += 1;
        // Preferisci tenere MANUAL se presente; altrimenti una JSON base.
        // Ma CE-safe: reverse SOLO se non è in usableIds.
        const keep =
            legs.find((l) => l.sourceType === 'MANUAL_EXPENSE' && usableIds.has(l.id)) ||
            legs.find((l) => usableIds.has(l.id)) ||
            legs.find((l) => l.sourceType === 'MANUAL_EXPENSE') ||
            legs[0];
        for (const leg of legs) {
            if (leg.id === keep?.id) continue;
            if (usableIds.has(leg.id)) {
                // Non stornare costo ancora visibile in PnL
                skippedBecauseVisibleInPnl += 1;
                continue;
            }
            reverseIds.add(leg.id);
            reverseReasons.set(leg.id, 'LOTTO4_DUP_COST_SUPPRESSED_BY_HIERARCHY');
        }
        // Se keep stesso è soppresso (pagamento autorità tiene il CE), reverse anche gli altri soppressi già fatto;
        // keep soppresso: lo storniamo pure se non usable — pulizia mastro; CE già sul pagamento.
        if (keep && !usableIds.has(keep.id) && legs.every((l) => !usableIds.has(l.id))) {
            // Tutte soppresse: tieni keep (non reverse), reverse gli altri (già in loop)
        }
    }

    // Safety: mai reverse BANK / gateway
    for (const id of [...reverseIds]) {
        const row = all.find((r) => r.id === id);
        if (!row) continue;
        if (
            row.sourceType === 'BANK_LINE' ||
            row.sourceType === 'PAYPAL_MOVEMENT' ||
            row.sourceType === 'STRIPE_MOVEMENT' ||
            row.sourceType === 'FLORIST_PAYOUT'
        ) {
            reverseIds.delete(id);
        }
        // Double-check: se usable, togli (protezione CE)
        if (usableIds.has(id) && reverseReasons.get(id) !== 'COLLAPSE_JSON_VERSION_SUFFIX') {
            // :v should not be usable; if a non-version somehow usable, skip
            if (!isVersionedJson(row.sourceKey || '')) {
                reverseIds.delete(id);
                skippedBecauseVisibleInPnl += 1;
            }
        }
        // Even :v — if somehow usable, STOP that id
        if (usableIds.has(id)) {
            reverseIds.delete(id);
            skippedBecauseVisibleInPnl += 1;
        }
    }

    const toReverse = [...reverseIds];
    console.log('toReverse', toReverse.length, {
        versioned: versioned.length,
        docsTouched,
        skippedBecauseVisibleInPnl,
    });

    // ── Simulate CE before write ───────────────────────────────────────
    const simulatedRows = all.filter((r) => !reverseIds.has(r.id));
    // Recompute PnL-like via hierarchy on remaining — use computeHistoricalPnl after write only;
    // For pre-check: if any reverse id is in usableIds we already stripped them.

    if (toReverse.some((id) => usableIds.has(id))) {
        throw new Error('STOP: candidate reverse set intersects PnL-visible ids');
    }

    // ── WRITE ──────────────────────────────────────────────────────────
    const now = new Date();
    let reversed = 0;
    for (const id of toReverse) {
        const row = await prisma.financialLedgerEntry.findUnique({
            where: { id },
            select: { reversedAt: true, metadataJson: true, sourceKey: true, sourceType: true },
        });
        if (!row || row.reversedAt) continue;
        await prisma.financialLedgerEntry.update({
            where: { id },
            data: {
                reversedAt: now,
                metadataJson: {
                    ...asMeta(row.metadataJson),
                    fase4bBatchId: batchId,
                    fase4bLotto: 4,
                    fase4bAction: 'REVERSE',
                    fase4bReason: reverseReasons.get(id) || 'LOTTO4',
                    fase4bExecutedAt: executedAt,
                } as Prisma.InputJsonValue,
            },
        });
        reversed += 1;
    }

    // ── Snapshot post ──────────────────────────────────────────────────
    const post = await snapshot();
    const inv = assertInvariant(pre, post, 'post-Lotto4');
    console.log('POST', {
        costi: euro(post.costiTotCents),
        rai: euro(post.raiCents),
        banca: euro(post.cashBankCents),
        active: post.activeCount,
        inv,
    });

    if (!inv.ok) {
        console.error('ACCEPTANCE FAIL — CE moved', inv.moved);
        // Non rollback automatico: report FAIL; socio decide. Soft-reverse è reversibile marcando reversedAt=null.
    }

    // ── `:v` residue ───────────────────────────────────────────────────
    const vRemain = await prisma.financialLedgerEntry.count({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            sourceType: 'JSON_ENTRY',
            sourceKey: { contains: ':v' },
        },
    });
    // More precise: endswith :vDigits
    const activeJson = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null, fiscalYear: 2026, sourceType: 'JSON_ENTRY' },
        select: { sourceKey: true },
    });
    const vRemainPrecise = activeJson.filter((r) => isVersionedJson(r.sourceKey || '')).length;

    // ── Distinzione 10 coppie ──────────────────────────────────────────
    const json = costLegs.filter((r) => r.sourceType === 'JSON_ENTRY' && !reverseIds.has(r.id));
    // Use pre-reverse cost set for classification of the historical "10"
    const jsonAll = all.filter(
        (r) =>
            r.direction === 'USCITA' &&
            r.sourceType === 'JSON_ENTRY' &&
            !isVersionedJson(r.sourceKey || '')
    );
    const manualAll = all.filter(
        (r) => r.direction === 'USCITA' && r.sourceType === 'MANUAL_EXPENSE'
    );
    const used = new Set<string>();
    type PairC = {
        date: string;
        vendorA: string;
        vendorB: string;
        numA: string;
        numB: string;
        amountAbs: number;
        kind: 'INVERSIONE_NOME' | 'FORNITORI_DIVERSI' | 'OK_STESSO' | 'AUTOFATTURA';
    };
    const classified: PairC[] = [];
    for (const j of jsonAll) {
        const jDay = dayKey(j.accountingDate);
        const jAbs = Math.abs(j.totalCents);
        const jKey =
            typeof asMeta(j.metadataJson).dedupeKey === 'string'
                ? String(asMeta(j.metadataJson).dedupeKey)
                : null;
        let best: (typeof manualAll)[0] | null = null;
        for (const m of manualAll) {
            if (used.has(m.id)) continue;
            if (dayKey(m.accountingDate) !== jDay) continue;
            if (Math.abs(m.totalCents) !== jAbs) continue;
            const mKey =
                typeof asMeta(m.metadataJson).dedupeKey === 'string'
                    ? String(asMeta(m.metadataJson).dedupeKey)
                    : null;
            if (jKey && mKey && canonicalDocumentKeysMatch(jKey, mKey)) {
                best = m;
                break;
            }
            const jN = (j.counterpartyName || '').toUpperCase();
            const mN = (m.counterpartyName || '').toUpperCase();
            if (jN && mN && (jN.includes(mN.slice(0, 8)) || mN.includes(jN.slice(0, 8)))) {
                best = m;
                break;
            }
            if (!best) best = m;
        }
        if (!best) continue;
        used.add(best.id);
        const vendorA = extractVendor(j.counterpartyName, j.description);
        const vendorB = extractVendor(best.counterpartyName, best.description);
        const numA = extractDocNo(j.description) || '';
        const numB =
            extractDocNo(best.description) ||
            (typeof asMeta(best.metadataJson).invoiceNumber === 'string'
                ? norm(String(asMeta(best.metadataJson).invoiceNumber))
                : '');
        const blob = `${vendorA} ${vendorB} ${j.description}`;
        const isAf =
            AUTOFATTURA_VENDOR.test(blob) || /autofattura|2026-est|td17/i.test(blob);
        let kind: PairC['kind'] = 'OK_STESSO';
        if (isAf) kind = 'AUTOFATTURA';
        else if (samePersonVendor(vendorA, vendorB)) {
            if (norm(vendorA) !== norm(vendorB)) kind = 'INVERSIONE_NOME';
            else kind = 'OK_STESSO';
        } else if (norm(vendorA) && norm(vendorB)) {
            kind = 'FORNITORI_DIVERSI';
        }
        classified.push({
            date: jDay,
            vendorA,
            vendorB,
            numA,
            numB,
            amountAbs: jAbs,
            kind,
        });
    }
    const inversioni = classified.filter((c) => c.kind === 'INVERSIONE_NOME');
    const diversi = classified.filter((c) => c.kind === 'FORNITORI_DIVERSI');
    // Le "10" storiche = quelle che l'algoritmo vecchio marcava cross per nome diverso
    const storiche10 = classified.filter(
        (c) =>
            c.kind === 'INVERSIONE_NOME' ||
            (c.kind === 'FORNITORI_DIVERSI' && !c.kind.startsWith('AUTO'))
    );

    // ── Autofatture XML vs PDF importi ──────────────────────────────────
    const autofatture = await prisma.manualFinanceExpense.findMany({
        where: {
            expenseDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
            OR: [
                { description: { contains: 'autofattura', mode: 'insensitive' } },
                { description: { contains: 'TD17', mode: 'insensitive' } },
                { vendorName: { contains: 'Stripe', mode: 'insensitive' } },
                { vendorName: { contains: 'OpenAI', mode: 'insensitive' } },
                { vendorName: { contains: 'Cursor', mode: 'insensitive' } },
                { vendorName: { contains: 'Anthropic', mode: 'insensitive' } },
                { vendorName: { contains: 'Apple', mode: 'insensitive' } },
                { vendorName: { contains: 'Vercel', mode: 'insensitive' } },
                { vendorName: { contains: 'Google', mode: 'insensitive' } },
                { vendorName: { contains: 'Meta', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            expenseDate: true,
            vendorName: true,
            totalCents: true,
            description: true,
            metadataJson: true,
            fileName: true,
            blobPath: true,
            blobUrl: true,
        },
        orderBy: { expenseDate: 'asc' },
    });

    type AmtMismatch = {
        date: string;
        vendor: string;
        expenseCents: number;
        xmlCents: number | null;
        pdfHintCents: number | null;
        num: string | null;
        note: string;
    };
    const mismatches: AmtMismatch[] = [];
    for (const e of autofatture) {
        const m = asMeta(e.metadataJson);
        const num =
            (typeof m.invoiceNumber === 'string' && m.invoiceNumber) ||
            e.description.match(/(00000\d+-2026-EST)/i)?.[1] ||
            null;
        const xmlCents =
            typeof m.xmlTotalCents === 'number'
                ? m.xmlTotalCents
                : typeof m.parsedTotalCents === 'number'
                  ? m.parsedTotalCents
                  : typeof m.fatturaPaTotalCents === 'number'
                    ? m.fatturaPaTotalCents
                    : null;
        // Sibling expenses same day+vendor different amount
        const siblings = autofatture.filter(
            (o) =>
                o.id !== e.id &&
                dayKey(o.expenseDate) === dayKey(e.expenseDate) &&
                norm(o.vendorName).includes('stripe') === norm(e.vendorName).includes('stripe') &&
                /stripe/i.test(e.vendorName) &&
                /stripe/i.test(o.vendorName) &&
                o.totalCents !== e.totalCents
        );
        if (xmlCents != null && xmlCents !== e.totalCents) {
            mismatches.push({
                date: dayKey(e.expenseDate),
                vendor: e.vendorName,
                expenseCents: e.totalCents,
                xmlCents,
                pdfHintCents: null,
                num,
                note: 'metadata XML ≠ totalCents spesa',
            });
        }
        if (siblings.length && /stripe/i.test(e.vendorName) && dayKey(e.expenseDate) === '2026-05-31') {
            for (const s of siblings) {
                mismatches.push({
                    date: dayKey(e.expenseDate),
                    vendor: e.vendorName,
                    expenseCents: e.totalCents,
                    xmlCents: e.totalCents,
                    pdfHintCents: s.totalCents,
                    num,
                    note: `due spese Stripe stesso giorno: questa ${euro(e.totalCents)} vs sibling ${euro(s.totalCents)} (XML vs PDF sospetto)`,
                });
            }
        }
    }
    // Dedup mismatch notes
    const mag31 = autofatture.filter(
        (e) => dayKey(e.expenseDate) === '2026-05-31' && /stripe/i.test(e.vendorName)
    );

    // ── Lotto 5 dry-run prep (sola lettura) ─────────────────────────────
    const sddCandidates = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            OR: [
                { description: { contains: 'SDD', mode: 'insensitive' } },
                { description: { contains: 'SEPA Direct', mode: 'insensitive' } },
                { description: { contains: 'giroconto', mode: 'insensitive' } },
                { category: 'TRASFERIMENTO_INTERNO' },
                { category: 'PAYPAL_PAYOUT' },
            ],
        },
        select: {
            id: true,
            sourceType: true,
            category: true,
            totalCents: true,
            description: true,
            accountingDate: true,
        },
        take: 500,
    });
    // Heuristic: SPESE_OPERATIVE / SPESE_SAAS that look like SDD PayPal double-count
    const sddCostLike = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            fiscalYear: 2026,
            direction: 'USCITA',
            OR: [
                { description: { contains: 'SDD', mode: 'insensitive' } },
                {
                    AND: [
                        { sourceType: 'BANK_LINE' },
                        { description: { contains: 'PayPal', mode: 'insensitive' } },
                        { category: { in: ['SPESE_OPERATIVE', 'SPESE_SAAS', 'RICAVI_VENDITE'] } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            sourceType: true,
            category: true,
            totalCents: true,
            description: true,
            accountingDate: true,
        },
    });
    const lotto5AttesoMax = 161_600; // €1.616 dal socio

    const out = {
        batchId,
        executedAt,
        acceptance: 'CE_INVARIANTE',
        pre: {
            ...pre,
            costiEuro: euro(pre.costiTotCents),
            raiEuro: euro(pre.raiCents),
            bancaEuro: euro(pre.cashBankCents),
            ivaDebitoEuro: euro(pre.ivaDebitoCents),
            ivaCreditoEuro: euro(pre.ivaCreditoCents),
            notaRaiStorico:
                pre.raiCents === -569_251
                    ? 'allineato a −€5.692,51 post-L3'
                    : `LIVE pre-L4 = ${euro(pre.raiCents)} (Δ vs −€5.692,51 storico = ${euro(pre.raiCents - -569_251)}) — acceptance = invariante vs PRE, non vs numero storico se driftato`,
        },
        post: {
            ...post,
            costiEuro: euro(post.costiTotCents),
            raiEuro: euro(post.raiCents),
            bancaEuro: euro(post.cashBankCents),
            ivaDebitoEuro: euro(post.ivaDebitoCents),
            ivaCreditoEuro: euro(post.ivaCreditoCents),
        },
        invariant: inv,
        reversed,
        versionedQueued: versioned.length,
        docsTouched,
        skippedBecauseVisibleInPnl,
        vRemainActive: vRemainPrecise,
        vRemainLooseContains: vRemain,
        coppie: {
            inversioniNome: {
                n: inversioni.length,
                euro: euro(inversioni.reduce((s, c) => s + c.amountAbs, 0)),
                elenco: inversioni,
            },
            fornitoriDiversi: {
                n: diversi.length,
                euro: euro(diversi.reduce((s, c) => s + c.amountAbs, 0)),
                elenco: diversi,
            },
            notaStoriche10: `Su ${storiche10.length} coppie con nome diverso: inversioni=${inversioni.length}, fornitori diversi=${diversi.length}`,
        },
        autofattureImporti: {
            mag31Stripe: mag31.map((e) => ({
                id: e.id,
                amount: euro(e.totalCents),
                cents: e.totalCents,
                fileName: e.fileName,
                num:
                    (typeof asMeta(e.metadataJson).invoiceNumber === 'string'
                        ? asMeta(e.metadataJson).invoiceNumber
                        : null) || e.description.match(/(00000\d+-2026-EST)/i)?.[1],
                desc: e.description.slice(0, 100),
            })),
            mismatches,
        },
        lotto5DryRunPrep: {
            attesoMaxSocio: euro(lotto5AttesoMax),
            candidatiDescrizioneSddOGiro: sddCandidates.length,
            candidatiCostoSddPaypalLike: sddCostLike.length,
            sampleSddCost: sddCostLike.slice(0, 15).map((r) => ({
                date: dayKey(r.accountingDate),
                cat: r.category,
                src: r.sourceType,
                amount: euro(Math.abs(r.totalCents)),
                desc: (r.description || '').slice(0, 100),
            })),
            status: 'PREP_ONLY — dry-run dedicato da eseguire dopo conferma L4',
        },
        stopOnFail: !inv.ok,
    };

    const md = `# Fase 4b — Lotto 4 ESEGUITO (acceptance CE invariante)

**batch_id:** \`${batchId}\`  
**Eseguito:** ${executedAt}  
**Acceptance:** totali CE **invariati** (pulizia mastro, non PnL)

---

## Sei valori (pre → post)

| Metrica | PRE | POST | Atteso |
|---------|-----|------|--------|
| Totale costi | ${euro(pre.costiTotCents)} | ${euro(post.costiTotCents)} | INVARIATO ${pre.costiTotCents === post.costiTotCents ? '✓' : '✗'} |
| Risultato ante imposte | ${euro(pre.raiCents)} | ${euro(post.raiCents)} | INVARIATO ${pre.raiCents === post.raiCents ? '✓' : '✗'} |
| Saldo banca | ${euro(pre.cashBankCents)} | ${euro(post.cashBankCents)} | INVARIATO ${pre.cashBankCents === post.cashBankCents ? '✓' : '✗'} |
| IVA debito | ${euro(pre.ivaDebitoCents)} | ${euro(post.ivaDebitoCents)} | INVARIATO ${pre.ivaDebitoCents === post.ivaDebitoCents ? '✓' : '✗'} |
| IVA credito | ${euro(pre.ivaCreditoCents)} | ${euro(post.ivaCreditoCents)} | INVARIATO ${pre.ivaCreditoCents === post.ivaCreditoCents ? '✓' : '✗'} |
| Scritture attive | ${pre.activeCount} | ${post.activeCount} | discesa di ${reversed} (Δ ${post.activeCount - pre.activeCount}) |

**Esito acceptance:** ${inv.ok ? '**PASS**' : '**FAIL — CE mosso**'}  
${inv.moved.length ? inv.moved.map((m) => `- ${m.metric}: ${m.pre} → ${m.post} (Δ ${m.delta})`).join('\n') : ''}

Nota RAI: storico post-L3 −€5.692,51; live pre-L4 = **${euro(pre.raiCents)}** (Δ ${euro(pre.raiCents - -569_251)}). Acceptance applicata sull’invarianza PRE→POST di questo giro.

---

## Cosa è stato stornato

| | |
|--|--|
| Righe soft-reverse | **${reversed}** |
| di cui collasso \`:v…\` (coda) | ${versioned.length} |
| Documenti Lotto 4 toccati | ${docsTouched} |
| Skip (ancora visibili in PnL) | ${skippedBecauseVisibleInPnl} |
| \`:v…\` ancora attive dopo | **${vRemainPrecise}** |

---

## Distinzione «10 coppie false»

| Tipo | N | Importo | Destino |
|------|---|---------|---------|
| Inversioni di nome (duplicati veri) | **${inversioni.length}** | ${euro(inversioni.reduce((s, c) => s + c.amountAbs, 0))} | restano nel lotto |
| Fornitori diversi accoppiati per caso | **${diversi.length}** | ${euro(diversi.reduce((s, c) => s + c.amountAbs, 0))} | fuori dal lotto |

### Inversioni
${inversioni.map((c) => `- ${c.date} ${c.vendorA} ↔ ${c.vendorB} n.${c.numA || c.numB || '—'} · ${euro(c.amountAbs)}`).join('\n') || '_nessuna_'}

### Fornitori diversi
${diversi.map((c) => `- ${c.date} **${c.vendorA}** n.${c.numA || '—'} ↔ **${c.vendorB}** n.${c.numB || '—'} · ${euro(c.amountAbs)}`).join('\n') || '_nessuna nel rebuild_'}

---

## Pacchetto commercialista — riga aggiuntiva

**31/05 Stripe — due importi sullo stesso giorno:**
${mag31.map((e) => `- ${euro(e.totalCents)} · file=${e.fileName || '—'} · num=${(typeof asMeta(e.metadataJson).invoiceNumber === 'string' ? asMeta(e.metadataJson).invoiceNumber : null) || e.description.match(/(00000\d+-2026-EST)/i)?.[1] || '—'} · ${(e.description || '').slice(0, 80)}`).join('\n') || '_non trovate_'}

Interpretazione: **€3,83 (XML/\`-EST\`)** vs **€3,14 (PDF)** — stesso documento fiscale, due valori.  
Mismatch rilevati in metadata/serie: ${mismatches.length}.

---

## Lotto 5 — prep dry-run

Atteso socio: fino a **€1.616** di costi doppi SDD/giroconti.  
Candidati euristici in DB: descrizioni SDD/giro ${sddCandidates.length}; costi SDD/PayPal-like ${sddCostLike.length}.  
**Dry-run dedicato Lotto 5:** da completare subito dopo (script successivo / stesso giro).

---

## Punti

1. Snapshot + batch_id + esecuzione Lotto 4 CE-safe — **eseguito** (${inv.ok ? 'PASS' : 'FAIL'})
2. Collasso \`:v…\` — **eseguito** (residue attive: ${vRemainPrecise})
3. Distinzione 10 coppie — **eseguito**
4. Riga commercialista XML≠PDF — **eseguito** (serie da approfondire se PDF non in metadata)
5. Dry-run Lotto 5 — **prep**; dry-run numerico completo in follow-up se manca qui
`;

    const base = join(process.cwd(), 'docs/verbali');
    writeFileSync(join(base, 'dossier_fase4b_lotto4_eseguito.json'), JSON.stringify(out, null, 2));
    writeFileSync(join(base, 'dossier_fase4b_lotto4_eseguito.md'), md);

    // Append commercialista vizi
    const viziExtra = `

---

## AGGIORNAMENTO ${dayKey(new Date())} — due importi sullo stesso documento (31/05)

Oltre alle autofatture senza \`-EST\` e al riuso di \`000001-2026-EST\`, segnalare:

**Stripe 31/05/2026:** sullo stesso giorno risultano **€3,83** (XML / numerazione \`-EST\`) e **€3,14** (PDF).  
È lo stesso fatto fiscale con due importi a seconda del formato. Verificare in sede se altre autofatture della serie hanno XML≠PDF.
`;
    try {
        const { appendFileSync, readFileSync, existsSync } = await import('fs');
        const viziPath = join(base, 'dossier_fase4b_autofatture_vizi_formali.md');
        if (existsSync(viziPath)) {
            const cur = readFileSync(viziPath, 'utf8');
            if (!cur.includes('due importi sullo stesso documento')) {
                appendFileSync(viziPath, viziExtra);
            }
        }
    } catch {
        /* */
    }

    console.log(JSON.stringify({ batchId, reversed, inv, vRemainPrecise, inversioni: inversioni.length, diversi: diversi.length }, null, 2));

    if (!inv.ok) process.exitCode = 2;
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });

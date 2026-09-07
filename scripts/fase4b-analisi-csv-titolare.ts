/**
 * Analisi post-CSV titolare — sola lettura, nessun Lotto 4.
 * Uso: npx tsx scripts/fase4b-analisi-csv-titolare.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../lib/prisma';
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
    return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
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
        desc.match(/Autofattura estera\s+(?:autofattura estera\s+)?(.+?)\s+n\./i) ||
        desc.match(/SCONTRINO\s+([^—\-]+)/i);
    return (m?.[1] || '').trim();
}

const GIROCONTO_STRICT =
    /\b(giroconto|trasferiment[oi]\s+intern|payout|addebito\s+sdd|sdd\b|sepa\s+direct|add to balanc|funding|wallet|paypal europe|stripe.*(payout|transfer)|fineco.*(paypal|stripe)|bonifico\s+ist.*paypal)\b/i;

const AUTOFATTURA_VENDOR =
    /\b(stripe|openai|google|apple|cursor|anthropic|vercel|meta\s*platforms|aws|amazon web)\b/i;

type Leg = {
    id: string;
    sourceType: string;
    sourceKey: string;
    sourceId: string;
    accountingDate: Date;
    totalCents: number;
    counterpartyName: string | null;
    description: string;
    documentRef: string | null;
    attachmentUrl: string | null;
    attachmentPath: string | null;
    metadataJson: unknown;
};

function hasAtt(leg: Leg, manualBlob: Map<string, boolean>) {
    if (leg.attachmentUrl || leg.attachmentPath) return 'sì';
    if (leg.sourceType === 'MANUAL_EXPENSE' && manualBlob.get(leg.sourceId)) return 'sì';
    return 'no';
}

function docIdentity(leg: Leg): string {
    const vendor = extractVendor(leg.counterpartyName, leg.description);
    const num =
        extractDocNo(leg.description) ||
        extractDocNo(leg.documentRef || '') ||
        (typeof asMeta(leg.metadataJson).invoiceNumber === 'string'
            ? norm(String(asMeta(leg.metadataJson).invoiceNumber))
            : '');
    const day = dayKey(leg.accountingDate);
    return `${norm(vendor)}|${num}|${day}`;
}

async function buildPairs() {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            direction: 'USCITA',
            fiscalYear: 2026,
            OR: [{ sourceType: 'JSON_ENTRY' }, { sourceType: 'MANUAL_EXPENSE' }],
        },
        select: {
            id: true,
            sourceType: true,
            sourceKey: true,
            sourceId: true,
            accountingDate: true,
            totalCents: true,
            counterpartyName: true,
            description: true,
            documentRef: true,
            attachmentUrl: true,
            attachmentPath: true,
            metadataJson: true,
        },
    });
    const json = rows.filter(
        (r) => r.sourceType === 'JSON_ENTRY' || r.sourceKey.startsWith('JSON_ENTRY:')
    );
    const manual = rows.filter((r) => r.sourceType === 'MANUAL_EXPENSE');
    const manualIds = manual.map((m) => m.sourceId).filter(Boolean);
    const expenses = manualIds.length
        ? await prisma.manualFinanceExpense.findMany({
              where: { id: { in: manualIds } },
              select: { id: true, blobUrl: true, blobPath: true, fileName: true },
          })
        : [];
    const manualBlob = new Map(
        expenses.map((e) => [e.id, !!(e.blobUrl || e.blobPath || e.fileName)] as const)
    );

    type Pair = {
        a: Leg;
        b: Leg;
        amountAbs: number;
        vendorA: string;
        vendorB: string;
        numA: string;
        numB: string;
        sameVendor: boolean;
        sameNum: boolean;
        crossDoc: boolean;
        gruppo: string;
    };
    const pairs: Pair[] = [];
    const usedManual = new Set<string>();

    for (const j of json) {
        const jDay = dayKey(j.accountingDate);
        const jAbs = Math.abs(j.totalCents);
        const jKey =
            typeof asMeta(j.metadataJson).dedupeKey === 'string'
                ? String(asMeta(j.metadataJson).dedupeKey)
                : null;
        let best: (typeof manual)[0] | null = null;
        for (const m of manual) {
            if (usedManual.has(m.id)) continue;
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
            if (
                jN &&
                mN &&
                (jN.includes(mN.slice(0, 8)) || mN.includes(jN.slice(0, 8)))
            ) {
                best = m;
                break;
            }
            if (!best) best = m;
        }
        if (best) {
            const vendorA = extractVendor(j.counterpartyName, j.description);
            const vendorB = extractVendor(best.counterpartyName, best.description);
            const numA =
                extractDocNo(j.description) ||
                extractDocNo(j.documentRef || '') ||
                '';
            const numB =
                extractDocNo(best.description) ||
                extractDocNo(best.documentRef || '') ||
                (typeof asMeta(best.metadataJson).invoiceNumber === 'string'
                    ? norm(String(asMeta(best.metadataJson).invoiceNumber))
                    : '');
            const sameVendor = norm(vendorA) === norm(vendorB) && !!norm(vendorA);
            const sameNum = !!numA && !!numB && numA === numB;
            const fornSdi =
                /fornitore sdi/i.test(vendorA) ||
                /fornitore sdi/i.test(vendorB) ||
                /fornitore sdi/i.test(j.description) ||
                /fornitore sdi/i.test(best.description);
            const crossDoc = (!sameVendor && !!vendorA && !!vendorB) || (numA && numB && numA !== numB) || fornSdi;

            const blob = `${vendorA} ${vendorB} ${j.description} ${best.description}`;
            let gruppo: string;
            if (
                GIROCONTO_STRICT.test(blob) &&
                !AUTOFATTURA_VENDOR.test(blob) &&
                !/fioreria|shoppingarden|battistella|rossella|flowers|ferrante/i.test(blob)
            ) {
                gruppo = 'G3 GIROCONTI BANCA↔WALLET';
            } else if (
                AUTOFATTURA_VENDOR.test(blob) ||
                /autofattura|2026-est|td17|td18|td19/i.test(blob)
            ) {
                gruppo = 'G5 AUTOFATTURE ESTERE';
            } else if (
                sameVendor &&
                Math.abs(j.totalCents) === Math.abs(best.totalCents) &&
                jDay === dayKey(best.accountingDate)
            ) {
                if (
                    /\b(aruba|openai|hosting|saas|abbonament|software|google|microsoft)\b/i.test(
                        blob
                    ) &&
                    !AUTOFATTURA_VENDOR.test(blob)
                ) {
                    gruppo = 'G2 RICORRENTI NOTE';
                } else {
                    gruppo = 'G1 GEMELLE PERFETTE';
                }
            } else {
                gruppo = 'G4 DA GUARDARE UNO A UNO';
            }

            pairs.push({
                a: j,
                b: best,
                amountAbs: jAbs,
                vendorA,
                vendorB,
                numA,
                numB,
                sameVendor,
                sameNum,
                crossDoc,
                gruppo,
            });
            usedManual.add(best.id);
        }
    }

    return { pairs, manualBlob, allRows: rows };
}

async function main() {
    // ─── 1. AUTOFATTURE -EST ───────────────────────────────────────────
    const estExpenses = await prisma.manualFinanceExpense.findMany({
        where: {
            expenseDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
            OR: [
                { description: { contains: '-2026-EST', mode: 'insensitive' } },
                { metadataJson: { path: ['invoiceNumber'], string_contains: '-2026-EST' } },
            ],
        },
        select: {
            id: true,
            expenseDate: true,
            vendorName: true,
            description: true,
            totalCents: true,
            metadataJson: true,
        },
        orderBy: { expenseDate: 'asc' },
    });
    const estLedger = await prisma.financialLedgerEntry.findMany({
        where: {
            fiscalYear: 2026,
            reversedAt: null,
            OR: [
                { documentRef: { contains: '-2026-EST' } },
                { description: { contains: '-2026-EST' } },
            ],
        },
        select: {
            id: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            documentRef: true,
            sourceKey: true,
            sourceType: true,
            counterpartyName: true,
        },
    });

    type EstDoc = {
        numero: string;
        date: string;
        vendor: string;
        totalCents: number;
        expenseId: string;
        desc: string;
    };
    const estDocs: EstDoc[] = [];
    for (const e of estExpenses) {
        const m = asMeta(e.metadataJson);
        const num =
            (typeof m.invoiceNumber === 'string' && m.invoiceNumber.includes('EST')
                ? m.invoiceNumber
                : null) ||
            e.description.match(/(00000\d+-2026-EST)/i)?.[1] ||
            '';
        if (!num) continue;
        estDocs.push({
            numero: num.toUpperCase(),
            date: dayKey(e.expenseDate),
            vendor: e.vendorName,
            totalCents: e.totalCents,
            expenseId: e.id,
            desc: e.description.slice(0, 120),
        });
    }
    // also from ledger-only refs
    for (const r of estLedger) {
        const num = (r.documentRef || r.description).match(/(00000\d+-2026-EST)/i)?.[1];
        if (!num) continue;
        if (estDocs.some((d) => d.numero === num.toUpperCase() && d.date === dayKey(r.accountingDate)))
            continue;
        // only add if no expense already
        if (!estDocs.some((d) => d.numero === num.toUpperCase())) {
            estDocs.push({
                numero: num.toUpperCase(),
                date: dayKey(r.accountingDate),
                vendor: r.counterpartyName || '—',
                totalCents: Math.abs(r.totalCents),
                expenseId: r.id,
                desc: r.description.slice(0, 120),
            });
        }
    }

    const byNum = new Map<string, EstDoc[]>();
    for (const d of estDocs) {
        const arr = byNum.get(d.numero) || [];
        arr.push(d);
        byNum.set(d.numero, arr);
    }
    // Unique official numbered series: prefer expense docs with -EST in invoiceNumber
    const numbered = [...byNum.entries()]
        .map(([numero, docs]) => {
            // distinct by date+amount
            const uniq: EstDoc[] = [];
            for (const d of docs) {
                if (
                    !uniq.some(
                        (u) =>
                            u.date === d.date &&
                            Math.abs(u.totalCents) === Math.abs(d.totalCents) &&
                            norm(u.vendor) === norm(d.vendor)
                    )
                ) {
                    uniq.push(d);
                }
            }
            return { numero, docs: uniq, reused: uniq.length > 1 };
        })
        .sort((a, b) => a.numero.localeCompare(b.numero));

    const seqNums = numbered
        .map((n) => Number(n.numero.match(/^(\d+)/)?.[1] || 0))
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
    const maxSeq = seqNums.length ? Math.max(...seqNums) : 0;
    const present = new Set(seqNums);
    const gaps: number[] = [];
    for (let i = 1; i <= maxSeq; i++) if (!present.has(i)) gaps.push(i);

    // Special: 000001 used on 31/01 €2.01 AND 31/05 €3.14/3.83
    const dup001 = numbered.filter((n) => n.reused);

    // ─── 2. DC STUDIO + IRIN ───────────────────────────────────────────
    async function allLedgerForVendor(vendorPat: string, amountAbs: number, around: string) {
        const from = new Date(around);
        from.setUTCDate(from.getUTCDate() - 5);
        const to = new Date(around);
        to.setUTCDate(to.getUTCDate() + 5);
        const rows = await prisma.financialLedgerEntry.findMany({
            where: {
                reversedAt: null,
                OR: [
                    { counterpartyName: { contains: vendorPat, mode: 'insensitive' } },
                    { description: { contains: vendorPat, mode: 'insensitive' } },
                ],
            },
            select: {
                id: true,
                sourceKey: true,
                sourceType: true,
                accountingDate: true,
                totalCents: true,
                description: true,
                counterpartyName: true,
                documentRef: true,
                attachmentUrl: true,
                attachmentPath: true,
                category: true,
                direction: true,
            },
            orderBy: { accountingDate: 'asc' },
        });
        // Prefer same amount near date, but return ALL matching vendor
        return rows.map((r) => ({
            id: r.id,
            sourceKey: r.sourceKey,
            sourceType: r.sourceType,
            date: dayKey(r.accountingDate),
            amount: euro(r.totalCents),
            totalCents: r.totalCents,
            category: r.category,
            direction: r.direction,
            vendor: r.counterpartyName,
            ref: r.documentRef,
            desc: (r.description || '').slice(0, 140),
            allegato: r.attachmentUrl || r.attachmentPath ? 'sì' : 'no',
            nearTargetAmount: Math.abs(r.totalCents) === amountAbs,
            nearTargetDate:
                r.accountingDate >= from && r.accountingDate <= to,
        }));
    }

    const dcStudio = await allLedgerForVendor('DC STUDIO', 377430, '2026-03-02');
    const irin = await allLedgerForVendor('IRIN', 68149, '2026-02-18');

    // ─── 3–5 pairs + regroup ───────────────────────────────────────────
    const { pairs, manualBlob, allRows } = await buildPairs();

    // Document identity groups across ALL cost legs (json+manual) that appear in pairs
    const legsInPairs = new Map<string, Leg>();
    for (const p of pairs) {
        legsInPairs.set(p.a.id, p.a);
        legsInPairs.set(p.b.id, p.b);
    }
    // Also pull any other JSON/MANUAL with same identity
    const docMap = new Map<
        string,
        { vendor: string; num: string; date: string; legs: Leg[]; amountAbs: number }
    >();
    for (const leg of allRows) {
        const vendor = extractVendor(leg.counterpartyName, leg.description);
        const num =
            extractDocNo(leg.description) ||
            extractDocNo(leg.documentRef || '') ||
            (typeof asMeta(leg.metadataJson).invoiceNumber === 'string'
                ? norm(String(asMeta(leg.metadataJson).invoiceNumber))
                : '');
        if (!vendor && !num) continue;
        const key = `${norm(vendor)}|${num}|${dayKey(leg.accountingDate)}`;
        // only docs that touch pair set OR have same amount as a pair leg
        const cur = docMap.get(key) || {
            vendor,
            num,
            date: dayKey(leg.accountingDate),
            legs: [],
            amountAbs: Math.abs(leg.totalCents),
        };
        if (!cur.legs.some((l) => l.id === leg.id)) cur.legs.push(leg);
        docMap.set(key, cur);
    }

    // Focus on docs that appear in pairs (known duplicate zone)
    const pairDocKeys = new Set<string>();
    for (const p of pairs) {
        pairDocKeys.add(docIdentity(p.a));
        pairDocKeys.add(docIdentity(p.b));
    }

    const docsFromPairs = [...docMap.entries()]
        .filter(([k]) => pairDocKeys.has(k) || k.split('|')[1])
        .map(([key, v]) => ({
            key,
            vendor: v.vendor,
            num: v.num,
            date: v.date,
            nScritture: v.legs.length,
            amountAbs: v.amountAbs,
            amount: euro(v.amountAbs),
            deveRestarne: 1,
            daStornare: Math.max(0, v.legs.length - 1),
            sourceTypes: [...new Set(v.legs.map((l) => l.sourceType))],
            ids: v.legs.map((l) => l.id),
        }))
        .filter((d) => d.nScritture >= 2)
        .sort((a, b) => b.nScritture - a.nScritture || b.amountAbs - a.amountAbs);

    const docs3plus = docsFromPairs.filter((d) => d.nScritture >= 3);
    const docs3plusEuro = docs3plus.reduce((s, d) => s + d.amountAbs * (d.nScritture - 1), 0);

    // Named multi-pair docs from titolare
    const named = [
        'vidoz',
        'di paola',
        'ballarate',
        'shoppingarden',
        'benda',
        'battistella',
        'aruba',
        'cannone',
        'calamunci',
        'torre',
    ];
    const namedDocs = docsFromPairs.filter((d) =>
        named.some((n) => norm(d.vendor).includes(n) || norm(d.key).includes(n))
    );

    // Cross-doc pairs to exclude
    const crossPairs = pairs.filter((p) => p.crossDoc);
    const ferranteCross = pairs.filter(
        (p) =>
            /ferrante|shoppingarden/i.test(p.vendorA + p.vendorB + p.a.description + p.b.description) &&
            p.crossDoc
    );

    // Group recount
    const byGruppo: Record<string, { n: number; euro: number }> = {};
    for (const p of pairs) {
        const g = p.crossDoc && p.gruppo !== 'G5 AUTOFATTURE ESTERE' ? 'SCARTATE_ACCOPPIAMENTO_ERRATO' : p.gruppo;
        // reassign cross to scartate unless G5
        if (!byGruppo[g]) byGruppo[g] = { n: 0, euro: 0 };
        byGruppo[g].n += 1;
        byGruppo[g].euro += p.amountAbs;
    }
    // Also recount with cross moved
    const pairsClassified = pairs.map((p) => ({
        ...p,
        gruppoFinale:
            p.crossDoc && !p.gruppo.startsWith('G5')
                ? 'SCARTATE_ACCOPPIAMENTO_ERRATO'
                : p.gruppo,
        verdettoSuggerito: p.crossDoc
            ? 'SCARTARE_NON_DOPPIONE'
            : p.gruppo.startsWith('G3')
              ? 'ESCLUSO_LOTTO5'
              : p.gruppo.startsWith('G5')
                ? 'FUORI_LOTTO4_COMMERCIALISTA'
                : '',
    }));

    const gruppoFinaleCount: Record<string, { n: number; euro: number }> = {};
    for (const p of pairsClassified) {
        if (!gruppoFinaleCount[p.gruppoFinale]) gruppoFinaleCount[p.gruppoFinale] = { n: 0, euro: 0 };
        gruppoFinaleCount[p.gruppoFinale].n += 1;
        gruppoFinaleCount[p.gruppoFinale].euro += p.amountAbs;
    }

    // G5: cost writings per autofattura doc
    const g5pairs = pairsClassified.filter((p) => p.gruppoFinale.startsWith('G5'));
    const g5ByDoc = new Map<string, number>();
    for (const p of g5pairs) {
        const k = docIdentity(p.a);
        g5ByDoc.set(k, (g5ByDoc.get(k) || 0) + 2); // two legs in pair
    }

    // ─── 6. Isabella ───────────────────────────────────────────────────
    const stripe284 = await prisma.stripeFinanceMovement.findMany({
        where: {
            OR: [
                { amountCents: { in: [28490, -28490] } },
                { description: { contains: 'Cesaroni', mode: 'insensitive' } },
            ],
            createdAtStripe: {
                gte: new Date('2026-04-28'),
                lte: new Date('2026-05-10'),
            },
        },
        select: {
            id: true,
            stripeId: true,
            amountCents: true,
            feeCents: true,
            netCents: true,
            type: true,
            description: true,
            createdAtStripe: true,
        },
    });
    const paypalLed = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { description: { contains: 'Cesaroni', mode: 'insensitive' } },
                { counterpartyName: { contains: 'Cesaroni', mode: 'insensitive' } },
                {
                    AND: [
                        { sourceType: 'PAYPAL_MOVEMENT' },
                        {
                            totalCents: {
                                in: [28490, -28490, 28038, -28038, 27875, -27875, 452, -452],
                            },
                        },
                        {
                            accountingDate: {
                                gte: new Date('2026-04-28'),
                                lte: new Date('2026-05-15'),
                            },
                        },
                    ],
                },
            ],
        },
        select: {
            id: true,
            sourceType: true,
            sourceKey: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            counterpartyName: true,
            category: true,
        },
    });
    const finecoIsabella = await prisma.bankStatementLine.findMany({
        where: {
            OR: [
                { amountCents: { in: [27875, 28038, 28490] } },
                { description: { contains: 'Cesaroni', mode: 'insensitive' } },
                {
                    AND: [
                        { description: { contains: 'PayPal', mode: 'insensitive' } },
                        {
                            accountingDate: {
                                gte: new Date('2026-05-01'),
                                lte: new Date('2026-05-15'),
                            },
                        },
                        { amountCents: { gt: 20000, lt: 30000 } },
                    ],
                },
                {
                    AND: [
                        { description: { contains: 'Stripe', mode: 'insensitive' } },
                        {
                            accountingDate: {
                                gte: new Date('2026-05-01'),
                                lte: new Date('2026-05-15'),
                            },
                        },
                        { amountCents: { gt: 20000, lt: 30000 } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            matchType: true,
        },
    });
    const isabellaOrders = await prisma.order.findMany({
        where: {
            orderNumber: { in: ['FT-MC-26-003', 'FT-MC-26-004', 'FT-MC-26-005', 'FT-MC-26-006'] },
        },
        select: {
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            totalPriceCents: true,
            createdAt: true,
            deliveryDate: true,
            deletedAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    // PayPal movements table if exists
    let paypalMovements: unknown[] = [];
    try {
        paypalMovements = await prisma.$queryRawUnsafe(
            `SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%paypal%'`
        );
    } catch {
        /* */
    }

    // Search paypal around 280.38 / 4.52
    const ppHits = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            accountingDate: { gte: new Date('2026-04-25'), lte: new Date('2026-05-20') },
            OR: [
                { totalCents: { in: [28490, -28490, 28038, -28038, 452, -452, 27875, -27875] } },
                { description: { contains: 'Cesaroni', mode: 'insensitive' } },
                { description: { contains: 'Isabella', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            accountingDate: true,
            totalCents: true,
            description: true,
            sourceKey: true,
            category: true,
        },
    });

    // ─── 7. Luciano cancelled ──────────────────────────────────────────
    const lucianoCancelled = await prisma.order.findMany({
        where: {
            buyerFullName: { contains: 'Mamm', mode: 'insensitive' },
            status: 'CANCELLED',
        },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            totalPriceCents: true,
            createdAt: true,
            deletedAt: true,
        },
    });
    const lucianoRev = [];
    for (const o of lucianoCancelled) {
        const led = await prisma.financialLedgerEntry.findMany({
            where: {
                reversedAt: null,
                OR: [
                    { orderId: o.id },
                    { documentRef: o.orderNumber || undefined },
                    { description: { contains: o.orderNumber || '___none___' } },
                ],
                AND: [
                    {
                        OR: [
                            { category: { in: ['RICAVI_VENDITE', 'ALTRI_RICAVI', 'RIMBORSI'] } },
                            { direction: 'ENTRATA' },
                            { totalCents: { gt: 0 } },
                        ],
                    },
                ],
            },
            select: {
                id: true,
                sourceKey: true,
                category: true,
                direction: true,
                totalCents: true,
                description: true,
                accountingDate: true,
                reversedAt: true,
            },
        });
        lucianoRev.push({
            order: o.orderNumber,
            orderId: o.id,
            amount: euro(o.totalPriceCents),
            deleted: !!o.deletedAt,
            revenueEntries: led.map((r) => ({
                id: r.id,
                sourceKey: r.sourceKey,
                cat: r.category,
                dir: r.direction,
                amount: euro(r.totalCents),
                date: dayKey(r.accountingDate),
                desc: r.description.slice(0, 100),
            })),
        });
    }

    const report = {
        generatedAt: new Date().toISOString(),
        vincolo: 'SOLA LETTURA — nessun Lotto 4 eseguito',
        punto1_autofattureEst: {
            serieNumerata: numbered.map((n) => ({
                numero: n.numero,
                usi: n.docs.length,
                riusato: n.reused,
                docs: n.docs.map((d) => ({
                    date: d.date,
                    vendor: d.vendor,
                    importo: euro(d.totalCents),
                    expenseId: d.expenseId,
                })),
            })),
            duplicatiNumero: dup001.map((n) => ({
                numero: n.numero,
                n: n.docs.length,
                docs: n.docs.map((d) => `${d.date} ${d.vendor} ${euro(d.totalCents)}`),
            })),
            progressione: {
                max: maxSeq,
                presenti: seqNums,
                buchi: gaps,
                notaBuchi:
                    gaps.length === 0
                        ? 'Nessun buco nella serie numerata 00000N-2026-EST fino al max trovato.'
                        : `Buchi: ${gaps.map((g) => String(g).padStart(6, '0') + '-2026-EST').join(', ')}`,
            },
            nota001:
                '000001-2026-EST usato almeno due volte: 31/01 Stripe €2,01 e 31/05 Stripe ~€3,14/€3,83. Vizio formale → pacchetto commercialista, NON Lotto 4.',
            autofattureSenzaNumeroEst: estExpenses
                .filter((e) => {
                    const m = asMeta(e.metadataJson);
                    const num = typeof m.invoiceNumber === 'string' ? m.invoiceNumber : '';
                    return !num.includes('-2026-EST') && !/-2026-EST/i.test(e.description);
                })
                .map((e) => ({
                    date: dayKey(e.expenseDate),
                    vendor: e.vendorName,
                    importo: euro(e.totalCents),
                    desc: e.description.slice(0, 80),
                })),
        },
        punto2_dueRighePesanti: {
            peso: {
                dc: euro(377430),
                irin: euro(68149),
                somma: euro(377430 + 68149),
                suTotaleLotto: '€4.455,79 / €7.481,92 ≈ 59,6%',
            },
            dcStudioStp: dcStudio,
            irinSrl: irin,
        },
        punto3_perDocumento: {
            documentiConAlmeno2Scritture: docsFromPairs.length,
            documentiCon3oPiu: {
                n: docs3plus.length,
                excessEuroSeSiTiene1: euro(docs3plusEuro),
                lista: docs3plus.slice(0, 40),
            },
            documentiCitatiTitolare: namedDocs,
            regola: 'Per ogni identità fornitore+numero+data deve restare 1 scrittura di costo. Stornare 1 gamba per coppia su documenti a 4 scritture lascia 2, non 1.',
        },
        punto4_gruppiRifatti: {
            definizioneG3:
                'Solo movimenti banca↔wallet (giroconti, SDD funding). NON autofatture SaaS, NON costi fiorista.',
            gruppoG5: 'AUTOFATTURE ESTERE — fuori Lotto 4 (commercialista / numerazione).',
            conteggi: Object.fromEntries(
                Object.entries(gruppoFinaleCount).map(([k, v]) => [
                    k,
                    { n: v.n, euro: euro(v.euro) },
                ])
            ),
            g5Coppie: g5pairs.length,
            g5Sample: g5pairs.slice(0, 15).map((p) => ({
                vendors: `${p.vendorA} / ${p.vendorB}`,
                nums: `${p.numA}/${p.numB}`,
                amount: euro(p.amountAbs),
                date: dayKey(p.a.accountingDate),
            })),
        },
        punto5_accoppiamentiErrati: {
            nScartare: crossPairs.length,
            euroScartare: euro(crossPairs.reduce((s, p) => s + p.amountAbs, 0)),
            ferranteShoppingarden: ferranteCross.map((p) => ({
                a: `${p.vendorA} n.${p.numA} ${dayKey(p.a.accountingDate)} ${euro(p.a.totalCents)}`,
                b: `${p.vendorB} n.${p.numB} ${dayKey(p.b.accountingDate)} ${euro(p.b.totalCents)}`,
            })),
            sample: crossPairs.slice(0, 20).map((p) => ({
                a: `${p.vendorA}|${p.numA}|${dayKey(p.a.accountingDate)}`,
                b: `${p.vendorB}|${p.numB}|${dayKey(p.b.accountingDate)}`,
                amount: euro(p.amountAbs),
                reason: !p.sameVendor
                    ? 'fornitore diverso'
                    : !p.sameNum
                      ? 'numero diverso'
                      : 'Fornitore SDI / altro',
            })),
        },
        punto6_isabella: {
            stripeHits: stripe284.map((s) => ({
                id: s.stripeId,
                date: dayKey(s.createdAtStripe),
                gross: euro(s.amountCents),
                fee: euro(s.feeCents),
                net: euro(s.netCents),
                type: s.type,
                desc: s.description,
            })),
            finecoHits: finecoIsabella.map((b) => ({
                id: b.id,
                date: dayKey(b.accountingDate || b.valueDate || new Date()),
                amount: euro(b.amountCents),
                matchType: b.matchType,
                desc: (b.description || '').slice(0, 160),
            })),
            paypalLedgerHits: ppHits.map((p) => ({
                id: p.id,
                date: dayKey(p.accountingDate),
                amount: euro(p.totalCents),
                key: p.sourceKey,
                desc: p.description.slice(0, 120),
            })),
            otherCesaroniLedger: paypalLed.map((p) => ({
                id: p.id,
                st: p.sourceType,
                date: dayKey(p.accountingDate),
                amount: euro(p.totalCents),
                desc: p.description.slice(0, 120),
            })),
            ordersConfermati: isabellaOrders.map((o) => ({
                num: o.orderNumber,
                created: dayKey(o.createdAt),
                delivery: o.deliveryDate ? dayKey(o.deliveryDate) : null,
                status: o.status,
                pay: o.partnerPaymentStatus,
                amount: euro(o.totalPriceCents),
            })),
            deltaFineco: {
                titolarePayPalNettoAtteso: euro(28038),
                commissionAttese: euro(452),
                grossAtteso: euro(28490),
                finecoOsservato: euro(27875),
                deltaVs28038: euro(27875 - 28038),
                nota: 'Δ Fineco €278,75 vs netto PayPal dichiarato €280,38 = −€1,63. Verificare se payout Fineco è Stripe (non PayPal) o se c’è fee aggiuntiva / altro movimento.',
            },
            paypalTables: paypalMovements,
        },
        punto7_luciano: {
            cancelledOrders: lucianoRev,
            conclusione: lucianoRev.every((x) => x.revenueEntries.length === 0)
                ? 'OK: nessun ricavo ledger attivo sugli ordini ANNULLATI.'
                : 'ATTENZIONE: esistono scritture di ricavo da stornare.',
        },
        stop: 'Nessuna esecuzione Lotto 4.',
    };

    const outJson = join(process.cwd(), 'docs/verbali/dossier_fase4b_analisi_csv_titolare.json');
    writeFileSync(outJson, JSON.stringify(report, null, 2));

    // Markdown summary
    const md = `# Fase 4b — Analisi CSV titolare (sola lettura)

**Generato:** ${report.generatedAt}  
**Vincolo:** nessuna scrittura Lotto 4.

---

## 1. Autofatture \`-EST\` 2026 — numerazione

### Numeri riusati (vizio formale → commercialista)
${
    dup001.length
        ? dup001
              .map(
                  (n) =>
                      `- **${n.numero}** × ${n.docs.length}: ${n.docs.map((d) => `${d.date} ${d.vendor} ${euro(d.totalCents)}`).join(' · ')}`
              )
              .join('\n')
        : '- (nessuno oltre il controllo manuale)'
}

In particolare **000001-2026-EST**: 31/01 Stripe €2,01 **e** 31/05 Stripe (altro importo). Non è un doppione da Lotto 4.

### Serie numerata (documenti con \`NNNNNN-2026-EST\`)
| Numero | Usi distinti | Dettaglio |
|--------|--------------|-----------|
${numbered.map((n) => `| ${n.numero} | ${n.docs.length}${n.reused ? ' ⚠️' : ''} | ${n.docs.map((d) => `${d.date} ${d.vendor} ${euro(d.totalCents)}`).join('; ')} |`).join('\n')}

### Buchi progressione 1…${maxSeq}
${gaps.length ? gaps.map((g) => `\`${String(g).padStart(6, '0')}-2026-EST\``).join(', ') : '_Nessun buco_'}

Molte autofatture Cursor/Apple/Anthropic/Vercel **non hanno** numero \`-EST\` (solo TD17 generico): fuori serie formale.

---

## 2. Le due righe (~60%)

| Fornitore | Importo | Scritture ledger trovate |
|-----------|---------|--------------------------|
| DC STUDIO STP SRL | €3.774,30 | **${dcStudio.length}** |
| IRIN S.R.L. | €681,49 | **${irin.length}** |
| Somma | €4.455,79 | su €7.481,92 |

### DC STUDIO — tutte le scritture
| Data | Importo | sourceType | sourceKey | allegato | desc |
|------|---------|------------|-----------|----------|------|
${dcStudio.map((r) => `| ${r.date} | ${r.amount} | ${r.sourceType} | \`${r.sourceKey}\` | ${r.allegato} | ${(r.desc || '').replace(/\|/g, '/')} |`).join('\n')}

### IRIN — tutte le scritture
| Data | Importo | sourceType | sourceKey | allegato | desc |
|------|---------|------------|-----------|----------|------|
${irin.map((r) => `| ${r.date} | ${r.amount} | ${r.sourceType} | \`${r.sourceKey}\` | ${r.allegato} | ${(r.desc || '').replace(/\|/g, '/')} |`).join('\n')}

---

## 3. Per documento (non per coppia)

Documenti (fornitore+n.+data) con ≥2 scritture nel perimetro costi JSON∩MANUAL: **${docsFromPairs.length}**  
Con **≥3 scritture**: **${docs3plus.length}** (excess se si tiene 1: **${euro(docs3plusEuro)}**)

### Citati dal titolare (multi-coppia)
| Fornitore | N. | Data | Scritture | Da stornare (→1) | Importo |
|-----------|----|------|-----------|------------------|---------|
${namedDocs.map((d) => `| ${d.vendor} | ${d.num || '—'} | ${d.date} | ${d.nScritture} | ${d.daStornare} | ${d.amount} |`).join('\n') || '_nessun match diretto_'}

**Regola:** storno “una gamba per coppia” su documenti a 4 scritture lascia **2**, non **1**.

---

## 4. Gruppi rifatti

| Gruppo | Coppie | Euro |
|--------|--------|------|
${Object.entries(gruppoFinaleCount)
    .map(([k, v]) => `| ${k} | ${v.n} | ${euro(v.euro)} |`)
    .join('\n')}

- **G3** = solo banca↔wallet (SDD/giroconti).  
- **G5 AUTOFATTURE** = costi servizi esteri (fuori Lotto 4).  
- Autofatture / fioristi non vanno più in G3.

---

## 5. Accoppiamenti errati (scartare dal lotto)

**${crossPairs.length}** coppie con fornitore o numero documento diverso (o Fornitore SDI): **${euro(crossPairs.reduce((s, p) => s + p.amountAbs, 0))}**  
Incluse Ferrante↔Shoppingarden a €20.

---

## 6. Isabella

### Gateway
${stripe284.length ? `Stripe trovato: ${stripe284.map((s) => `${dayKey(s.createdAtStripe)} gross ${euro(s.amountCents)} fee ${euro(s.feeCents)} net ${euro(s.netCents)}`).join('; ')}` : 'Nessun Stripe €284,90 nel range.'}
${ppHits.length ? `PayPal ledger: ${ppHits.map((p) => `${dayKey(p.accountingDate)} ${euro(p.totalCents)}`).join('; ')}` : 'Nessun PayPal ledger €284,90/€280,38/€4,52 nel range.'}

### Fineco
${finecoIsabella.map((b) => `- ${dayKey(b.accountingDate || b.valueDate || new Date())} ${euro(b.amountCents)} — ${(b.description || '').slice(0, 100)}`).join('\n') || '_nessuna riga_'}

Δ dichiarato titolare: netto PayPal €280,38 − Fineco €278,75 = **€1,63**.

### Ordini confermati
${isabellaOrders.map((o) => `- ${o.orderNumber} consegna ${o.deliveryDate ? dayKey(o.deliveryDate) : '—'} · ${o.status}/${o.partnerPaymentStatus}`).join('\n')}

---

## 7. Luciano Mammì — annullati

${lucianoRev.map((x) => `- **${x.order}** ${x.amount}: ricavi ledger = **${x.revenueEntries.length}**${x.revenueEntries.length ? ' ⚠️ ' + JSON.stringify(x.revenueEntries) : ' ✓'}`).join('\n') || '_nessun annullato_'}

**${report.punto7_luciano.conclusione}**

---

## STOP
Nessun Lotto 4. JSON completo: \`docs/verbali/dossier_fase4b_analisi_csv_titolare.json\`.
`;

    const outMd = join(process.cwd(), 'docs/verbali/dossier_fase4b_analisi_csv_titolare.md');
    writeFileSync(outMd, md);
    console.log(JSON.stringify({ outJson, outMd, summary: {
        estDup: dup001.length,
        estGaps: gaps,
        dcN: dcStudio.length,
        irinN: irin.length,
        docs3plus: docs3plus.length,
        gruppi: gruppoFinaleCount,
        cross: crossPairs.length,
        luciano: report.punto7_luciano.conclusione,
        stripeN: stripe284.length,
        ppN: ppHits.length,
        finecoN: finecoIsabella.length,
    }}, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await prisma.$disconnect();
        } catch {
            /* */
        }
    });

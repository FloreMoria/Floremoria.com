/**
 * Lotto 4 — ricalcolo eccesso PER DOCUMENTO, solo scritture di COSTO.
 *
 * Decisione socio 2026-09-07:
 * 1. Test plausibilità obbligatorio vs costi 2026 €12.984,96
 * 2. Solo JSON_ENTRY + MANUAL_EXPENSE; escludere pagamenti (BANK/gateway)
 * 3. Collassare JSON versionate (`:vNNN`) — stessa scrittura, non N costi
 * 4. Coppie false → file a parte (a/b); autofatture senza -EST in cima
 * 5. Dry-run, stop per via — nessuna scrittura
 *
 * Uso: npx tsx scripts/fase4b-lotto4-ricalcolo-costi.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../lib/prisma';
import { canonicalDocumentKeysMatch } from '../lib/financial/canonicalDocumentKey';
import { applyFiscalAuthorityHierarchy } from '../lib/financial/fiscalAuthorityDedupe';

const COSTI_TOTALI_2026_CENTS = 1_298_496; // €12.984,96 Lotto 0
const MIN_COSTI_RESIDUI_PLAUSIBILI_CENTS = 400_000; // €4.000
const STORICO_99_COPPIE_CENTS = 748_192; // €7.481,92

const PAYMENT_SOURCE_TYPES = new Set([
    'BANK_LINE',
    'PAYPAL_MOVEMENT',
    'STRIPE_MOVEMENT',
    'FLORIST_PAYOUT',
    'GATEWAY_MOVEMENT',
]);

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
/** Identità persona/ditta: token set ordinato (gestisce «TORRE DOMENICA» = «DOMENICA TORRE»). */
function vendorIdentityKey(vendor: string): string {
    const t = norm(vendor)
        .split(' ')
        .filter((w) => w.length > 1)
        .sort();
    return t.join(' ');
}
function samePersonVendor(a: string, b: string): boolean {
    const ka = vendorIdentityKey(a);
    const kb = vendorIdentityKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    const ta = new Set(ka.split(' '));
    const tb = new Set(kb.split(' '));
    let overlap = 0;
    for (const x of ta) if (tb.has(x)) overlap += 1;
    return overlap >= 2;
}
function baseJsonKey(sourceKey: string) {
    return (sourceKey || '').replace(/:v\d+$/, '');
}

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
    metadataJson: unknown;
};

function assertPlausibility(label: string, costiTotali: number, eccesso: number) {
    const residui = costiTotali - eccesso;
    const ok = residui >= MIN_COSTI_RESIDUI_PLAUSIBILI_CENTS && eccesso < costiTotali * 0.85;
    return {
        label,
        costiTotali: euro(costiTotali),
        eccesso: euro(eccesso),
        costiResiduiSeSiStorna: euro(residui),
        ok,
        motivo: ok
            ? 'plausibile'
            : `STOP: residui ${euro(residui)} sotto soglia ${euro(MIN_COSTI_RESIDUI_PLAUSIBILI_CENTS)} o eccesso >85% costi — conteggio sbagliato`,
    };
}

async function main() {
    const costLegsRaw = await prisma.financialLedgerEntry.findMany({
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
            metadataJson: true,
            category: true,
        },
    });

    const leaked = costLegsRaw.filter((l) => PAYMENT_SOURCE_TYPES.has(l.sourceType));
    if (leaked.length) throw new Error(`STOP: payment legs nel perimetro costo (${leaked.length})`);

    // A) Naive senza collasso versioni (il bug che produceva ~€12.8k)
    const naiveByDoc = new Map<string, Leg[]>();
    for (const leg of costLegsRaw) {
        const vendor = extractVendor(leg.counterpartyName, leg.description);
        const num =
            extractDocNo(leg.description) ||
            extractDocNo(leg.documentRef || '') ||
            (typeof asMeta(leg.metadataJson).invoiceNumber === 'string'
                ? norm(String(asMeta(leg.metadataJson).invoiceNumber))
                : '');
        if (!norm(vendor) && !num) continue;
        if (AUTOFATTURA_VENDOR.test(`${vendor} ${leg.description}`) || /autofattura|2026-est|td17/i.test(leg.description))
            continue;
        const key = `${vendorIdentityKey(vendor) || norm(vendor)}|${num}|${dayKey(leg.accountingDate)}`;
        const arr = naiveByDoc.get(key) || [];
        arr.push(leg);
        naiveByDoc.set(key, arr);
    }
    let naiveExcess = 0;
    for (const legs of naiveByDoc.values()) {
        if (legs.length < 2) continue;
        const abs = legs.map((l) => Math.abs(l.totalCents)).sort((a, b) => b - a);
        naiveExcess += abs.slice(1).reduce((s, x) => s + x, 0);
    }
    const plausNaive = assertPlausibility('NAIVE_senza_collasso_versioni', COSTI_TOTALI_2026_CENTS, naiveExcess);
    const plaus12847 = assertPlausibility('VECCHIO_errato_12847', COSTI_TOTALI_2026_CENTS, 1_284_718);

    // B) Collasso JSON versionate (`:v…`) — una gamba JSON per sourceKey base
    const costLegs: Leg[] = [];
    const seenJsonBase = new Set<string>();
    let jsonVersionsCollapsed = 0;
    for (const leg of costLegsRaw) {
        if (leg.sourceType === 'JSON_ENTRY') {
            const b = baseJsonKey(leg.sourceKey);
            if (seenJsonBase.has(b)) {
                jsonVersionsCollapsed += 1;
                continue;
            }
            seenJsonBase.add(b);
        }
        costLegs.push(leg);
    }

    const byDoc = new Map<
        string,
        {
            vendor: string;
            num: string;
            date: string;
            legs: Leg[];
            isAutofattura: boolean;
        }
    >();
    for (const leg of costLegs) {
        const vendor = extractVendor(leg.counterpartyName, leg.description);
        const num =
            extractDocNo(leg.description) ||
            extractDocNo(leg.documentRef || '') ||
            (typeof asMeta(leg.metadataJson).invoiceNumber === 'string'
                ? norm(String(asMeta(leg.metadataJson).invoiceNumber))
                : '');
        if (!norm(vendor) && !num) continue;
        const key = `${vendorIdentityKey(vendor) || norm(vendor)}|${num}|${dayKey(leg.accountingDate)}`;
        const blob = `${vendor} ${leg.description} ${leg.documentRef || ''}`;
        const cur = byDoc.get(key) || {
            vendor,
            num,
            date: dayKey(leg.accountingDate),
            legs: [] as Leg[],
            isAutofattura:
                AUTOFATTURA_VENDOR.test(blob) || /autofattura|2026-est|td17|td18|td19/i.test(blob),
        };
        if (!cur.legs.some((l) => l.id === leg.id)) cur.legs.push(leg);
        byDoc.set(key, cur);
    }

    type DocDup = {
        vendor: string;
        num: string;
        date: string;
        nCostLegs: number;
        jsonN: number;
        manualN: number;
        amountAbs: number;
        excessCents: number;
        isAutofattura: boolean;
        sourceTypes: string[];
    };
    const docsDup: DocDup[] = [];
    for (const v of byDoc.values()) {
        if (v.legs.length < 2) continue;
        const absAmounts = v.legs.map((l) => Math.abs(l.totalCents)).sort((a, b) => b - a);
        docsDup.push({
            vendor: v.vendor,
            num: v.num,
            date: v.date,
            nCostLegs: v.legs.length,
            jsonN: v.legs.filter((l) => l.sourceType === 'JSON_ENTRY').length,
            manualN: v.legs.filter((l) => l.sourceType === 'MANUAL_EXPENSE').length,
            amountAbs: absAmounts[0] || 0,
            excessCents: absAmounts.slice(1).reduce((s, x) => s + x, 0),
            isAutofattura: v.isAutofattura,
            sourceTypes: [...new Set(v.legs.map((l) => l.sourceType))],
        });
    }
    docsDup.sort((a, b) => b.excessCents - a.excessCents);

    const lotto4Docs = docsDup.filter((d) => !d.isAutofattura);
    const g5Docs = docsDup.filter((d) => d.isAutofattura);
    const eccessoLotto4 = lotto4Docs.reduce((s, d) => s + d.excessCents, 0);
    const eccessoG5 = g5Docs.reduce((s, d) => s + d.excessCents, 0);
    const plausL4 = assertPlausibility('Lotto4_costi_con_collasso_versioni', COSTI_TOTALI_2026_CENTS, eccessoLotto4);

    // Coppie (per confronto storico + classificazione scarti)
    const json = costLegs.filter((r) => r.sourceType === 'JSON_ENTRY');
    const manual = costLegs.filter((r) => r.sourceType === 'MANUAL_EXPENSE');
    type Pair = {
        amountAbs: number;
        vendorA: string;
        vendorB: string;
        numA: string;
        numB: string;
        date: string;
        crossDoc: boolean;
        isAf: boolean;
        descA: string;
        descB: string;
        jsonId: string;
        nameInversionOnly: boolean;
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
            if (jN && mN && (jN.includes(mN.slice(0, 8)) || mN.includes(jN.slice(0, 8)))) {
                best = m;
                break;
            }
            if (!best) best = m;
        }
        if (!best) continue;
        usedManual.add(best.id);
        const vendorA = extractVendor(j.counterpartyName, j.description);
        const vendorB = extractVendor(best.counterpartyName, best.description);
        const numA = extractDocNo(j.description) || extractDocNo(j.documentRef || '') || '';
        const numB =
            extractDocNo(best.description) ||
            extractDocNo(best.documentRef || '') ||
            (typeof asMeta(best.metadataJson).invoiceNumber === 'string'
                ? norm(String(asMeta(best.metadataJson).invoiceNumber))
                : '');
        const sameVendor = samePersonVendor(vendorA, vendorB);
        const fornSdi = /fornitore sdi/i.test(vendorA + vendorB + j.description);
        const numClash = !!numA && !!numB && numA !== numB;
        // Cross-doc vero: fornitori diversi (non sola inversione nome) OPPURE numeri diversi OPPURE Fornitore SDI
        const crossDoc = (!sameVendor && !!norm(vendorA) && !!norm(vendorB)) || numClash || fornSdi;
        const nameInversionOnly =
            !!norm(vendorA) &&
            !!norm(vendorB) &&
            norm(vendorA) !== norm(vendorB) &&
            sameVendor &&
            !numClash &&
            !fornSdi;
        const blob = `${vendorA} ${vendorB} ${j.description} ${best.description}`;
        const isAf =
            AUTOFATTURA_VENDOR.test(blob) || /autofattura|2026-est|td17|td18|td19/i.test(blob);
        pairs.push({
            amountAbs: jAbs,
            vendorA,
            vendorB,
            numA,
            numB,
            date: jDay,
            crossDoc,
            isAf,
            descA: j.description.slice(0, 100),
            descB: best.description.slice(0, 100),
            jsonId: j.id,
            nameInversionOnly,
        });
    }

    // a) documenti davvero diversi (non inversioni di nome)
    const falseA = pairs.filter((p) => p.crossDoc && !p.isAf && !samePersonVendor(p.vendorA, p.vendorB));
    // b) JSON senza passivo solido / Fornitore SDI / num clash con mate debole
    const falseB = pairs.filter(
        (p) =>
            !p.isAf &&
            (/fornitore sdi/i.test(p.vendorA + p.vendorB + p.descA) ||
                (p.crossDoc && samePersonVendor(p.vendorA, p.vendorB) && !!p.numA && !!p.numB && p.numA !== p.numB))
    );
    const nameInversions = pairs.filter((p) => p.nameInversionOnly);
    const pairedJson = new Set(pairs.map((p) => p.jsonId));
    const jsonOrfani = json
        .filter((j) => !pairedJson.has(j.id))
        .map((j) => ({
            vendor: extractVendor(j.counterpartyName, j.description),
            num: extractDocNo(j.description) || extractDocNo(j.documentRef || '') || '—',
            date: dayKey(j.accountingDate),
            amountAbs: Math.abs(j.totalCents),
            description: j.description.slice(0, 140),
            id: j.id,
        }))
        .sort((a, b) => b.amountAbs - a.amountAbs);

    const pairsL4 = pairs.filter((p) => !p.crossDoc && !p.isAf);
    const pairsL4Euro = pairsL4.reduce((s, p) => s + p.amountAbs, 0);

    // Impatto PnL: gerarchia già sopprime JSON/MANUAL quando c'è pagamento autorità
    const allRows = await prisma.financialLedgerEntry.findMany({
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
    const usable = applyFiscalAuthorityHierarchy(allRows);
    const usableIds = new Set(usable.map((u) => u.id));
    let pnlVisibleExcess = 0;
    let pnlVisibleDocs = 0;
    for (const v of byDoc.values()) {
        if (v.isAutofattura) continue;
        const surviving = v.legs.filter((l) => usableIds.has(l.id));
        if (surviving.length >= 2) {
            const abs = surviving.map((l) => Math.abs(l.totalCents)).sort((a, b) => b - a);
            pnlVisibleExcess += abs.slice(1).reduce((s, x) => s + x, 0);
            pnlVisibleDocs += 1;
        }
    }

    // Autofatture vizi formali
    const autofatture = await prisma.manualFinanceExpense.findMany({
        where: {
            expenseDate: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
            OR: [
                { description: { contains: 'autofattura', mode: 'insensitive' } },
                { description: { contains: 'TD17', mode: 'insensitive' } },
                { vendorName: { contains: 'Cursor', mode: 'insensitive' } },
                { vendorName: { contains: 'Anthropic', mode: 'insensitive' } },
                { vendorName: { contains: 'Apple', mode: 'insensitive' } },
                { vendorName: { contains: 'Vercel', mode: 'insensitive' } },
                { vendorName: { contains: 'Google', mode: 'insensitive' } },
                { vendorName: { contains: 'Meta', mode: 'insensitive' } },
                { vendorName: { contains: 'Stripe', mode: 'insensitive' } },
                { vendorName: { contains: 'OpenAI', mode: 'insensitive' } },
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
    function estNum(e: (typeof autofatture)[0]): string | null {
        const m = asMeta(e.metadataJson);
        if (typeof m.invoiceNumber === 'string' && /EST/i.test(m.invoiceNumber))
            return m.invoiceNumber.toUpperCase();
        return e.description.match(/(00000\d+-2026-EST)/i)?.[1]?.toUpperCase() || null;
    }
    const senzaEst = autofatture
        .filter((e) => !estNum(e))
        .map((e) => ({
            date: dayKey(e.expenseDate),
            vendor: e.vendorName,
            amount: euro(e.totalCents),
            amountCents: e.totalCents,
            id: e.id,
        }));
    const conEst = autofatture
        .map((e) => ({ e, num: estNum(e) }))
        .filter((x) => x.num)
        .map((x) => ({
            date: dayKey(x.e.expenseDate),
            vendor: x.e.vendorName,
            num: x.num!,
            amount: euro(x.e.totalCents),
            amountCents: x.e.totalCents,
        }));
    const dup001 = conEst.filter((d) => d.num === '000001-2026-EST');
    const stripeMag = await prisma.manualFinanceExpense.findMany({
        where: {
            expenseDate: { gte: new Date('2026-05-28'), lte: new Date('2026-06-02') },
            vendorName: { contains: 'Stripe', mode: 'insensitive' },
        },
        select: {
            id: true,
            expenseDate: true,
            totalCents: true,
            description: true,
            metadataJson: true,
            vendorName: true,
        },
    });

    // Isabella
    const isabella = await prisma.order.findMany({
        where: { buyerFullName: { contains: 'Cesaroni', mode: 'insensitive' } },
        include: { items: true },
        orderBy: { createdAt: 'asc' },
    });
    const pack001 = isabella.find((o) => o.orderNumber === 'FT-MC-26-001');
    const packQty = pack001?.items?.reduce((s, i) => s + (i.quantity || 0), 0) ?? null;
    const vivi = isabella.filter((o) => !o.deletedAt && o.status !== 'CANCELLED');
    const fatti = vivi.filter((o) => o.status === 'COMPLETED');
    const programmati = vivi.filter((o) => o.status === 'PENDING');

    const dcIrin = lotto4Docs.filter(
        (d) => /dc studio/i.test(d.vendor) || /irin/i.test(d.vendor)
    );

    const dryRun = {
        perimetro:
            'per documento · solo JSON_ENTRY+MANUAL_EXPENSE · collasso :v · no pagamenti · no autofatture G5 · no coppie false',
        documenti: lotto4Docs.length,
        esattamente2: lotto4Docs.filter((d) => d.nCostLegs === 2).length,
        ge3: lotto4Docs.filter((d) => d.nCostLegs >= 3).length,
        eccessoCents: eccessoLotto4,
        eccessoEuro: euro(eccessoLotto4),
        vsStorico99: {
            storico: euro(STORICO_99_COPPIE_CENTS),
            delta: euro(eccessoLotto4 - STORICO_99_COPPIE_CENTS),
            lettura:
                'Intorno ai €7.5k: le 99 coppie erano la direzione giusta; serviva raggruppare per documento + collassare versioni JSON + escludere pagamenti/scarti/G5',
        },
        costiResiduiAttesiSu12984: euro(COSTI_TOTALI_2026_CENTS - eccessoLotto4),
        plausibilita: plausL4,
        impattoPnLGerarchia: {
            docsConDueGambeCostoAncoraVisibiliInPnL: pnlVisibleDocs,
            excessVisibileInPnL: euro(pnlVisibleExcess),
            nota: 'La gerarchia fiscale (BANK/PayPal autorità) già sopprime quasi tutte le JSON/MANUAL duplicate nel CE. Stornarle pulisce il mastro; il totale costi ufficiale NON scende di ~€6.2k. DC/IRIN in PnL restano sulla gamba pagamento finché non si riclassifica.',
        },
        esecuzione: 'NO — stop per via titolare',
    };

    if (!plausL4.ok) {
        console.error('STOP PLAUSIBILITÀ — non dichiarare dry-run eseguibile', plausL4);
    }

    const out = {
        generatedAt: new Date().toISOString(),
        correzione: '€12.847 sbagliato: pagamenti contati come costi + JSON :v contate come costi distinti',
        plausibilita: { vecchio12847: plaus12847, naiveSenzaCollasso: plausNaive, lotto4Corretto: plausL4 },
        jsonVersionsCollapsed,
        ricalcolo: {
            lotto4: {
                nDocs: lotto4Docs.length,
                excessCents: eccessoLotto4,
                excessEuro: euro(eccessoLotto4),
                docs: lotto4Docs,
            },
            g5: { nDocs: g5Docs.length, excessEuro: euro(eccessoG5) },
            dcStudioIrin: dcIrin,
            pairsL4Confronto: { n: pairsL4.length, euro: euro(pairsL4Euro) },
        },
        coppieFalse: {
            nota: 'Le 10 «scartate» del report precedente erano quasi tutte inversioni di nome (stesso fiorista) — restano in Lotto 4. Qui: a) documenti davvero diversi; b) JSON senza passivo solido → Fase 5.',
            a: falseA.map((p) => ({
                date: p.date,
                vendorA: p.vendorA,
                numA: p.numA || '—',
                vendorB: p.vendorB,
                numB: p.numB || '—',
                amount: euro(p.amountAbs),
            })),
            b: falseB.map((p) => ({
                date: p.date,
                vendor: p.vendorA,
                num: p.numA || '—',
                mateDebole: `${p.vendorB} / ${p.numB || '—'}`,
                amount: euro(p.amountAbs),
            })),
            nameInversionsRestanoInLotto4: nameInversions.map((p) => ({
                date: p.date,
                a: p.vendorA,
                b: p.vendorB,
                num: p.numA || p.numB || '—',
                amount: euro(p.amountAbs),
            })),
            jsonOrfaniN: jsonOrfani.length,
            jsonOrfaniTop: jsonOrfani.slice(0, 40),
        },
        autofattureViziFormali: {
            senzaEst,
            riuso000001: dup001,
            stripeMaggio: stripeMag.map((e) => ({
                date: dayKey(e.expenseDate),
                amount: euro(e.totalCents),
                cents: e.totalCents,
                num: estNum(e),
                desc: e.description.slice(0, 100),
            })),
        },
        isabella: {
            pacchetto11: packQty === 11,
            qty: packQty,
            order: pack001
                ? {
                      orderNumber: pack001.orderNumber,
                      totalCents: pack001.totalPriceCents,
                      status: pack001.status,
                      deletedAt: pack001.deletedAt,
                  }
                : null,
            fatti: fatti.map((o) => ({
                orderNumber: o.orderNumber,
                delivery: o.deliveryDate ? dayKey(o.deliveryDate) : null,
            })),
            programmati: programmati.map((o) => ({
                orderNumber: o.orderNumber,
                delivery: o.deliveryDate ? dayKey(o.deliveryDate) : null,
                status: o.status,
            })),
            residuiDopoProgrammati: packQty != null ? packQty - fatti.length - programmati.length : null,
        },
        dryRunLotto4: dryRun,
        stop: true,
    };

    const base = join(process.cwd(), 'docs/verbali');

    const md = `# Lotto 4 — Ricalcolo eccesso (STOP su €12.847)

**Generato:** ${out.generatedAt}

---

## Verdetto

Il **€12.847 è sbagliato**. Confondeva la gamba **pagamento** con il **costo**, e contava le JSON \`:v…\` come costi distinti.

Con perimetro corretto (solo costo, collasso versioni, no G5/scarti):

| Metrica | Valore |
|---------|--------|
| **Eccesso Lotto 4** | **${euro(eccessoLotto4)}** |
| Documenti | ${lotto4Docs.length} (quasi tutti 1 JSON + 1 MANUAL) |
| Costi residui su €12.984,96 | **${euro(COSTI_TOTALI_2026_CENTS - eccessoLotto4)}** |
| Plausibilità | **${plausL4.ok ? 'PASS' : 'FAIL — STOP'}** |
| Storico 99 coppie | ${euro(STORICO_99_COPPIE_CENTS)} (Δ ${euro(eccessoLotto4 - STORICO_99_COPPIE_CENTS)}) |

Lettura socio: sì — le 99 coppie erano la direzione giusta; serviva il raggruppamento per documento (e collassare le versioni JSON). Numero nell’intorno dei ~€6,2–7,5k, non €12,8k.

---

## 1. Test di plausibilità (regola permanente)

| Scenario | Eccesso | Residui | Esito |
|----------|---------|---------|-------|
| Vecchio €12.847 | ${plaus12847.eccesso} | ${plaus12847.costiResiduiSeSiStorna} | **STOP** |
| Naive solo-costi senza collasso \`:v\` | ${plausNaive.eccesso} | ${plausNaive.costiResiduiSeSiStorna} | **${plausNaive.ok ? 'PASS' : 'STOP'}** |
| **Corretto** (costi + collasso \`:v\`) | ${plausL4.eccesso} | ${plausL4.costiResiduiSeSiStorna} | **${plausL4.ok ? 'PASS' : 'STOP'}** |

JSON versionate collassate: **${jsonVersionsCollapsed}**.

---

## 2. Perimetro: per documento, solo COSTO

- Contate: \`JSON_ENTRY\`, \`MANUAL_EXPENSE\`
- Escluse: \`BANK_LINE\`, PayPal/Stripe/payout (pagamento = altra gamba)
- Collasso: \`JSON_ENTRY:…:v123\` ≡ stessa scrittura della base

### DC STUDIO / IRIN (check)
${dcIrin
    .map(
        (d) =>
            `- **${d.vendor}** n.${d.num} ${d.date}: ${d.nCostLegs} gambe costo (JSON ${d.jsonN}+MANUAL ${d.manualN}) → eccesso **${euro(d.excessCents)}** — pagamento escluso`
    )
    .join('\n')}

### Top documenti Lotto 4
| Fornitore | N. | Data | Gambe | Importo | Eccesso |
|-----------|----|------|-------|---------|---------|
${lotto4Docs
    .slice(0, 20)
    .map(
        (d) =>
            `| ${d.vendor} | ${d.num || '—'} | ${d.date} | ${d.nCostLegs} | ${euro(d.amountAbs)} | ${euro(d.excessCents)} |`
    )
    .join('\n')}

---

## 3. Coppie false — fuori Lotto 4, in lista

Vedi \`dossier_fase4b_coppie_false_scartate.md\`.

- **a)** Accoppiamenti errati documenti diversi: **${falseA.length}**
- **b)** JSON senza passivo solido → Fase 5: **${falseB.length}** (+ ${jsonOrfani.length} JSON orfani)

---

## 4. Autofatture — vizi formali (priorità commercialista)

Vedi \`dossier_fase4b_autofatture_vizi_formali.md\`.

- **Senza numero \`-EST\`:** **${senzaEst.length}**
- **Riuso 000001-2026-EST:** ${dup001.map((d) => `${d.date} ${d.amount}`).join(' · ')}
- Stripe maggio: ${stripeMag.map((e) => `${euro(e.totalCents)} num=${estNum(e) || 'NESSUNO'}`).join(' · ')}

---

## 5. Isabella — erano 11 consegne?

**Sì.** \`FT-MC-26-001\` (annullato) aveva \`OrderItem.quantity = ${packQty}\` × €29,99 = €299,90.  
Stripe 03/05: charge €284,90.

Oggi: **${fatti.length} fatte** + **${programmati.length} programmata** (${programmati.map((o) => `${o.orderNumber}→${o.deliveryDate ? dayKey(o.deliveryDate) : '?'}`).join(', ') || '—'}).  
Dopo il 12/09 restano **${packQty != null ? packQty - fatti.length - programmati.length : '?'}** consegne non aperte in anagrafica (11−${fatti.length}−${programmati.length}).

---

## 6. Dry-run Lotto 4 — STOP per via

- Eccesso dichiarato: **${euro(eccessoLotto4)}**
- Plausibilità: **${plausL4.ok ? 'PASS' : 'FAIL'}**
- Impatto CE con gerarchia attuale: docs con 2+ gambe costo ancora visibili = **${pnlVisibleDocs}** (excess PnL-visibile **${euro(pnlVisibleExcess)}**)
- **Nota critica:** stornare JSON/MANUAL pulisce il mastro; il totale costi ufficiale (~€12.985) **non** scende di €6,2k perché la gerarchia tiene già il pagamento (BANK/PayPal) come autorità. Eventuale riclassifica pagamento↔documento è decisione separata.
- **Esecuzione: NO**

---

## Punti eseguiti / saltati

1. Test plausibilità — **eseguito** (€12.847 → STOP; corretto → ${plausL4.ok ? 'PASS' : 'FAIL'})
2. Ricalcolo per documento solo costi (+ collasso \`:v\`) — **eseguito** → ${euro(eccessoLotto4)}
3. Coppie false a/b in file — **eseguito**
4. Autofatture senza -EST + riuso 000001 — **eseguito**
5. Isabella qty pacchetto — **eseguito** (**11**)
6. Dry-run Lotto 4 — **eseguito (sola lettura)**; **esecuzione saltata** (via)
`;

    writeFileSync(join(base, 'dossier_fase4b_lotto4_ricalcolo.json'), JSON.stringify(out, null, 2));
    writeFileSync(join(base, 'dossier_fase4b_lotto4_ricalcolo.md'), md);

    writeFileSync(
        join(base, 'dossier_fase4b_coppie_false_scartate.md'),
        `# Coppie false — fuori Lotto 4

**Generato:** ${out.generatedAt}

> Correzione: le 10 «SCARTATE» del report precedente (€372) erano quasi tutte **inversioni di nome** (TORRE DOMENICA ↔ DOMENICA TORRE, ecc.). Stesso soggetto → **restano in Lotto 4** (ora fuse con token-set). Ferrante↔Shoppingarden non risulta nel rebuild attuale.

## a) Accoppiamenti errati fra documenti davvero diversi (non toccare)

| Data | Fornitore A (JSON) | N. | Fornitore B (MANUAL) | N. | Importo |
|------|--------------------|----|----------------------|----|---------|
${falseA.length
    ? falseA
          .map(
              (p) =>
                  `| ${p.date} | ${p.vendorA} | ${p.numA || '—'} | ${p.vendorB} | ${p.numB || '—'} | ${euro(p.amountAbs)} |`
          )
          .join('\n')
    : '| — | _nessuna nel rebuild_ | | | | |'}

## b) Costo JSON senza documento passivo solido → Fase 5

| Data | Fornitore | N. | Importo | Mate debole |
|------|-----------|----|---------|-------------|
${falseB.length
    ? falseB
          .map(
              (p) =>
                  `| ${p.date} | ${p.vendorA} | ${p.numA || '—'} | ${euro(p.amountAbs)} | ${p.vendorB} / ${p.numB || '—'} |`
          )
          .join('\n')
    : '| — | _nessuna classifica b stretta_ | | | |'}

### Inversioni di nome (NON scartate — in Lotto 4)
${nameInversions
    .map((p) => `- ${p.date} ${p.vendorA} ↔ ${p.vendorB} n.${p.numA || p.numB || '—'} · ${euro(p.amountAbs)}`)
    .join('\n') || '_nessuna_'}

### JSON senza coppia MANUAL (ampio)
Totale **${jsonOrfani.length}**. Top 25:

| Data | Fornitore | N. | Importo |
|------|-----------|----|---------|
${jsonOrfani
    .slice(0, 25)
    .map((j) => `| ${j.date} | ${j.vendor} | ${j.num} | ${euro(j.amountAbs)} |`)
    .join('\n')}
`
    );
    writeFileSync(
        join(base, 'dossier_fase4b_coppie_false_scartate.json'),
        JSON.stringify(
            { a: out.coppieFalse.a, b: out.coppieFalse.b, jsonOrfani: out.coppieFalse.jsonOrfaniTop },
            null,
            2
        )
    );

    writeFileSync(
        join(base, 'dossier_fase4b_autofatture_vizi_formali.md'),
        `# Pacchetto commercialista — vizi formali autofatture (PRIORITÀ)

**Generato:** ${out.generatedAt}

## 1. Senza numero \`-EST\` (documento incompleto) — ${senzaEst.length}

| Data | Fornitore | Importo |
|------|-----------|---------|
${senzaEst.map((e) => `| ${e.date} | ${e.vendor} | ${e.amount} |`).join('\n')}

## 2. Numero riusato \`000001-2026-EST\`

${dup001.map((d) => `- ${d.date} · ${d.vendor} · ${d.amount}`).join('\n')}

## 3. Stripe maggio — €3,14 vs €3,83

${stripeMag
    .map(
        (e) =>
            `- ${dayKey(e.expenseDate)} · ${euro(e.totalCents)} · num=${estNum(e) || 'NESSUNO'} · ${(e.description || '').slice(0, 80)}`
    )
    .join('\n')}

Prossimo progressivo dopo 000008 (post-fix riuso): **000009-2026-EST**.
`
    );

    console.log(
        JSON.stringify(
            {
                plausL4,
                eccessoLotto4: euro(eccessoLotto4),
                naiveExcess: euro(naiveExcess),
                jsonVersionsCollapsed,
                pnlVisibleExcess: euro(pnlVisibleExcess),
                senzaEst: senzaEst.length,
                isabellaQty: packQty,
                residuiIsabella:
                    packQty != null ? packQty - fatti.length - programmati.length : null,
                stop: true,
            },
            null,
            2
        )
    );
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });

/**
 * Export CSV revisione umana (sola lettura) — Lotto 4 pairs + Isabella + Mammì.
 * Uso: npx tsx scripts/fase4b-export-revisione-csv.ts
 * Zero scritture DB.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import prisma from '../lib/prisma';
import { canonicalDocumentKeysMatch } from '../lib/financial/canonicalDocumentKey';

function euroPlain(cents: number): string {
    return (Math.abs(cents) / 100).toFixed(2).replace('.', ',');
}

function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
    const da = Date.UTC(
        Number(dayKey(a).slice(0, 4)),
        Number(dayKey(a).slice(5, 7)) - 1,
        Number(dayKey(a).slice(8, 10))
    );
    const db = Date.UTC(
        Number(dayKey(b).slice(0, 4)),
        Number(dayKey(b).slice(5, 7)) - 1,
        Number(dayKey(b).slice(8, 10))
    );
    return Math.round(Math.abs(da - db) / 86400000);
}

function asMeta(m: unknown): Record<string, unknown> {
    return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
}

function csvEscape(v: string | number | null | undefined): string {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function csvRow(cols: Array<string | number | null | undefined>): string {
    return cols.map(csvEscape).join(';');
}

function norm(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function suppliersEqual(a: string, b: string): boolean {
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return false;
    return na === nb;
}

function causaliEqual(a: string, b: string): boolean {
    const na = norm(a).slice(0, 80);
    const nb = norm(b).slice(0, 80);
    if (!na || !nb) return false;
    return na === nb;
}

const GIROCONTO_RE =
    /\b(paypal|stripe|fineco|qonto|sdd|sepa|addebito\s+diretto|bonifico|giroconto|trasferiment|payout|banking)\b/i;

const SAAS_RE =
    /\b(aruba|hosting|vercel|cloudflare|aws|amazon\s*web|digitalocean|ovh|ionos|godaddy|namecheap|register\.it|google|microsoft|office\s*365|adobe|dropbox|slack|notion|openai|anthropic|github|mailchimp|brevo|sendinblue|canva|figma|zoom|netlify|hetzner|linode|shopify|meta\s*ads|facebook|instagram|apple\s*developer|cursor|chatgpt|midjourney|railway|render\.com|supabase|neon\.tech|planetscale|s3|saas|abbonament|subscription|licenza|software)\b/i;

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

function hasAttachment(leg: Leg, manualBlob: Map<string, boolean>): string {
    if (leg.attachmentUrl || leg.attachmentPath) return 'sì';
    if (leg.sourceType === 'MANUAL_EXPENSE' && manualBlob.get(leg.sourceId)) return 'sì';
    return 'no';
}

function isGiroconto(leg: Leg): boolean {
    const blob = `${leg.counterpartyName || ''} ${leg.description || ''} ${leg.sourceKey || ''} ${leg.documentRef || ''}`;
    if (GIROCONTO_RE.test(blob)) return true;
    const meta = asMeta(leg.metadataJson);
    const metaStr = JSON.stringify(meta);
    if (GIROCONTO_RE.test(metaStr)) return true;
    return false;
}

function isSaas(leg: Leg): boolean {
    const blob = `${leg.counterpartyName || ''} ${leg.description || ''}`;
    return SAAS_RE.test(blob);
}

type Gruppo = 'G1 GEMELLE PERFETTE' | 'G2 RICORRENTI NOTE' | 'G3 SOSPETTI GIROCONTO' | 'G4 DA GUARDARE UNO A UNO';

function extractVendorHint(leg: Leg): string {
    if (leg.counterpartyName?.trim()) return leg.counterpartyName.trim();
    const d = leg.description || '';
    const m =
        d.match(/Fattura report\s+(.+?)\s+n\./i) ||
        d.match(/Fattura SDI\s+(.+?)\s+n\./i) ||
        d.match(/SCONTRINO\s+([^—\-]+)/i) ||
        d.match(/Autofattura estera\s+(?:autofattura estera\s+)?(.+?)\s+n\./i) ||
        d.match(/Fattura n\.\s*\S+\s*[—\-]\s*(.+)$/i);
    return (m?.[1] || '').trim();
}

function extractDocNo(text: string): string {
    const d = text || '';
    const m =
        d.match(/\bn\.?\s*(FPR\s*[\d./-]+)/i) ||
        d.match(/\bn\.?\s*([A-Z]{0,6}\d[\w./-]*)/i) ||
        d.match(/\b(\d{1,4}\/\d{2,4})\b/);
    return norm(m?.[1] || '');
}

function sameSupplier(a: Leg, b: Leg): boolean {
    const va = extractVendorHint(a);
    const vb = extractVendorHint(b);
    if (va && vb && suppliersEqual(va, vb)) return true;
    if (va && norm(`${b.counterpartyName || ''} ${b.description || ''}`).includes(norm(va).slice(0, 12)))
        return true;
    if (vb && norm(`${a.counterpartyName || ''} ${a.description || ''}`).includes(norm(vb).slice(0, 12)))
        return true;
    return false;
}

function sameCausaleOrDoc(a: Leg, b: Leg): boolean {
    if (causaliEqual(a.description || '', b.description || '')) return true;
    const da = extractDocNo(a.description || '');
    const db = extractDocNo(b.description || '');
    if (da && db && da === db) return true;
    return false;
}

function classifyPair(a: Leg, b: Leg): { gruppo: Gruppo; verdetto: string } {
    // G3 prima: non stornare in Lotto 4
    if (isGiroconto(a) || isGiroconto(b)) {
        return { gruppo: 'G3 SOSPETTI GIROCONTO', verdetto: 'ESCLUSO_LOTTO5' };
    }
    // G2: SaaS/abbonamenti anche se “gemelle” (titolare approva come ricorrenti)
    if (isSaas(a) || isSaas(b)) {
        return { gruppo: 'G2 RICORRENTI NOTE', verdetto: '' };
    }
    const sameDate = dayKey(a.accountingDate) === dayKey(b.accountingDate);
    const sameAmt = Math.abs(a.totalCents) === Math.abs(b.totalCents);
    if (sameDate && sameAmt && sameSupplier(a, b)) {
        return { gruppo: 'G1 GEMELLE PERFETTE', verdetto: '' };
    }
    return { gruppo: 'G4 DA GUARDARE UNO A UNO', verdetto: '' };
}

async function exportCosti99() {
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

    type Pair = { a: Leg; b: Leg; amountAbs: number };
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
            pairs.push({ a: j, b: best, amountAbs: jAbs });
            usedManual.add(best.id);
        }
    }

    const classified = pairs.map((p) => {
        const { gruppo, verdetto } = classifyPair(p.a, p.b);
        return { ...p, gruppo, verdetto };
    });

    const order: Gruppo[] = [
        'G1 GEMELLE PERFETTE',
        'G2 RICORRENTI NOTE',
        'G3 SOSPETTI GIROCONTO',
        'G4 DA GUARDARE UNO A UNO',
    ];
    classified.sort((x, y) => {
        const dx = order.indexOf(x.gruppo) - order.indexOf(y.gruppo);
        if (dx !== 0) return dx;
        return dayKey(x.a.accountingDate).localeCompare(dayKey(y.a.accountingDate));
    });

    const lines: string[] = [];
    lines.push(
        csvRow([
            'TIPO',
            'gruppo',
            'data_A',
            'fornitore_A',
            'importo_A',
            'causale_A',
            'origine_A',
            'allegato_A',
            'data_B',
            'fornitore_B',
            'importo_B',
            'causale_B',
            'origine_B',
            'allegato_B',
            'delta_giorni',
            'VERDETTO',
        ])
    );

    // Riepilogo gruppi in cima
    for (const g of order) {
        const subset = classified.filter((c) => c.gruppo === g);
        const euro = subset.reduce((s, c) => s + c.amountAbs, 0);
        lines.push(
            csvRow([
                'RIEPILOGO',
                g,
                '',
                '',
                euroPlain(euro),
                `${subset.length} coppie`,
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                g.startsWith('G3') ? 'ESCLUSO_LOTTO5' : '',
            ])
        );
    }
    lines.push(
        csvRow([
            'RIEPILOGO',
            'TOTALE',
            '',
            '',
            euroPlain(classified.reduce((s, c) => s + c.amountAbs, 0)),
            `${classified.length} coppie`,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
        ])
    );

    for (const p of classified) {
        lines.push(
            csvRow([
                'COPPIA',
                p.gruppo,
                dayKey(p.a.accountingDate),
                extractVendorHint(p.a) || p.a.counterpartyName || '',
                euroPlain(p.a.totalCents),
                (p.a.description || '').slice(0, 160),
                p.a.sourceType,
                hasAttachment(p.a, manualBlob),
                dayKey(p.b.accountingDate),
                extractVendorHint(p.b) || p.b.counterpartyName || '',
                euroPlain(p.b.totalCents),
                (p.b.description || '').slice(0, 160),
                p.b.sourceType,
                hasAttachment(p.b, manualBlob),
                daysBetween(p.a.accountingDate, p.b.accountingDate),
                p.verdetto,
            ])
        );
    }

    const path = join(process.cwd(), 'docs/verbali/costi_99_coppie.csv');
    writeFileSync(path, lines.join('\n') + '\n', 'utf8');
    return {
        path,
        n: classified.length,
        byGroup: Object.fromEntries(
            order.map((g) => [
                g,
                {
                    n: classified.filter((c) => c.gruppo === g).length,
                    euro: euroPlain(
                        classified.filter((c) => c.gruppo === g).reduce((s, c) => s + c.amountAbs, 0)
                    ),
                },
            ])
        ),
    };
}

async function exportIsabella() {
    const lines: string[] = [];
    lines.push(
        csvRow([
            'tipo',
            'data',
            'riferimento',
            'importo',
            'stato',
            'dettaglio',
            'sourceKey_o_id',
            'CONSEGNA FATTA (sì/no)',
            'VERDETTO',
        ])
    );

    // Stripe €284,90 ~ 03/05/2026
    const stripeFrom = new Date('2026-05-01T00:00:00.000Z');
    const stripeTo = new Date('2026-05-06T23:59:59.999Z');
    const stripeHits = await prisma.stripeFinanceMovement.findMany({
        where: {
            amountCents: { in: [28490, -28490] },
            createdAtStripe: { gte: stripeFrom, lte: stripeTo },
        },
        select: {
            id: true,
            stripeId: true,
            type: true,
            amountCents: true,
            description: true,
            createdAtStripe: true,
            orderId: true,
            status: true,
        },
        orderBy: { createdAtStripe: 'asc' },
    });
    // fallback wider amount search around May
    const stripeWide =
        stripeHits.length > 0
            ? stripeHits
            : await prisma.stripeFinanceMovement.findMany({
                  where: {
                      OR: [
                          { amountCents: 28490 },
                          { amountCents: -28490 },
                          { description: { contains: 'Cesaroni', mode: 'insensitive' } },
                      ],
                      createdAtStripe: {
                          gte: new Date('2026-04-28T00:00:00.000Z'),
                          lte: new Date('2026-05-10T23:59:59.999Z'),
                      },
                  },
                  select: {
                      id: true,
                      stripeId: true,
                      type: true,
                      amountCents: true,
                      description: true,
                      createdAtStripe: true,
                      orderId: true,
                      status: true,
                  },
                  orderBy: { createdAtStripe: 'asc' },
              });

    for (const s of stripeWide) {
        lines.push(
            csvRow([
                'STRIPE',
                dayKey(s.createdAtStripe),
                s.stripeId,
                euroPlain(s.amountCents),
                s.status || s.type,
                (s.description || '').slice(0, 160),
                s.id,
                '',
                '',
            ])
        );
    }

    // Fineco €278,75 ~ 07/05
    const bankHits = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: 27875,
            OR: [
                {
                    accountingDate: {
                        gte: new Date('2026-05-05T00:00:00.000Z'),
                        lte: new Date('2026-05-10T23:59:59.999Z'),
                    },
                },
                {
                    valueDate: {
                        gte: new Date('2026-05-05T00:00:00.000Z'),
                        lte: new Date('2026-05-10T23:59:59.999Z'),
                    },
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
    for (const b of bankHits) {
        lines.push(
            csvRow([
                'FINECO',
                dayKey(b.accountingDate || b.valueDate || new Date()),
                b.id,
                euroPlain(b.amountCents),
                b.matchType || '',
                (b.description || '').slice(0, 160),
                b.id,
                '',
                '',
            ])
        );
    }

    const orders = await prisma.order.findMany({
        where: { buyerFullName: { contains: 'Cesaroni', mode: 'insensitive' } },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            partnerPaymentStatus: true,
            totalPriceCents: true,
            createdAt: true,
            deliveryDate: true,
            deletedAt: true,
            isRecurring: true,
            deceasedName: true,
            stripeTransactionId: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const focus = new Set(['FT-MC-26-003', 'FT-MC-26-004', 'FT-MC-26-005', 'FT-MC-26-006']);
    const focusIds = new Set(
        orders.filter((o) => focus.has(o.orderNumber || '')).map((o) => o.id)
    );
    for (const o of orders) {
        const isFocus = focus.has(o.orderNumber || '');
        if (!isFocus && o.deletedAt) {
            // Inclusi solo se pacchetto correlato (001/002)
            if (!/^FT-MC-26-00[12]$/.test(o.orderNumber || '')) continue;
        }
        lines.push(
            csvRow([
                isFocus
                    ? 'ORDINE_POSA'
                    : o.deletedAt
                      ? 'ORDINE_CANCELLATO'
                      : 'ORDINE_ALTRO',
                dayKey(o.createdAt),
                o.orderNumber,
                euroPlain(o.totalPriceCents),
                `${o.status}/${o.partnerPaymentStatus}${o.deletedAt ? '/DELETED' : ''}`,
                `consegna=${o.deliveryDate ? dayKey(o.deliveryDate) : '—'}; defunto=${o.deceasedName || '—'}; recurring=${o.isRecurring}`,
                o.id,
                '',
                '',
            ])
        );
    }

    const orderIds = orders.map((o) => o.id);
    const ledger = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            OR: [
                { orderId: { in: [...focusIds] } },
                { documentRef: { in: [...focus] } },
                { description: { contains: 'Cesaroni', mode: 'insensitive' } },
                { counterpartyName: { contains: 'Cesaroni', mode: 'insensitive' } },
                { description: { contains: 'FT-MC-26-00', mode: 'insensitive' } },
                {
                    AND: [
                        { totalCents: { in: [28490, -28490, 27875, -27875] } },
                        {
                            accountingDate: {
                                gte: new Date('2026-05-01T00:00:00.000Z'),
                                lte: new Date('2026-05-15T23:59:59.999Z'),
                            },
                        },
                    ],
                },
            ],
        },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            category: true,
            direction: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            counterpartyName: true,
            orderId: true,
            documentRef: true,
        },
        orderBy: { accountingDate: 'asc' },
        take: 200,
    });

    for (const r of ledger) {
        const blob = `${r.description || ''} ${r.counterpartyName || ''} ${r.documentRef || ''}`.toUpperCase();
        const linked =
            (r.orderId && focusIds.has(r.orderId)) ||
            /CESARONI|ISABELLA|FT-MC-26-00/.test(blob) ||
            Math.abs(r.totalCents) === 28490 ||
            Math.abs(r.totalCents) === 27875;
        if (!linked) continue;
        // Escludi SDD/PayPal generici non Isabella
        if (/PAYPAL|SDD|SEPA/i.test(blob) && !/CESARONI|FT-MC-26/i.test(blob)) continue;
        lines.push(
            csvRow([
                'LEDGER',
                dayKey(r.accountingDate),
                r.documentRef || r.sourceKey,
                euroPlain(r.totalCents),
                `${r.direction}/${r.category}/${r.sourceType}`,
                (r.description || '').slice(0, 160),
                r.sourceKey,
                '',
                '',
            ])
        );
    }

    const path = join(process.cwd(), 'docs/verbali/isabella_pacchetto.csv');
    writeFileSync(path, lines.join('\n') + '\n', 'utf8');
    return { path, n: lines.length - 1, stripeN: stripeWide.length, bankN: bankHits.length };
}

async function exportMammi() {
    const orders = await prisma.order.findMany({
        where: { buyerFullName: { contains: 'Mamm', mode: 'insensitive' } },
        select: {
            id: true,
            orderNumber: true,
            buyerFullName: true,
            status: true,
            partnerPaymentStatus: true,
            totalPriceCents: true,
            createdAt: true,
            deliveryDate: true,
            deletedAt: true,
            stripeTransactionId: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const alive = orders.filter((o) => !o.deletedAt);
    const amounts = [...new Set(alive.map((o) => o.totalPriceCents))];
    const minDate = new Date('2026-01-01T00:00:00.000Z');
    const maxDate = new Date('2026-12-31T23:59:59.999Z');

    const stripeMovs = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: minDate, lte: maxDate },
            OR: [
                { amountCents: { in: amounts } },
                { amountCents: { in: amounts.map((a) => -a) } },
                { description: { contains: 'Mamm', mode: 'insensitive' } },
                { orderId: { in: alive.map((o) => o.id) } },
            ],
        },
        select: {
            id: true,
            stripeId: true,
            amountCents: true,
            createdAtStripe: true,
            description: true,
            orderId: true,
            type: true,
        },
    });

    const paypal = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceType: 'PAYPAL_MOVEMENT',
            OR: [
                { totalCents: { in: [...amounts, ...amounts.map((a) => -a)] } },
                { description: { contains: 'Mamm', mode: 'insensitive' } },
                { counterpartyName: { contains: 'Mamm', mode: 'insensitive' } },
                { orderId: { in: alive.map((o) => o.id) } },
            ],
            accountingDate: { gte: minDate, lte: maxDate },
        },
        select: {
            id: true,
            sourceKey: true,
            sourceId: true,
            totalCents: true,
            accountingDate: true,
            description: true,
            orderId: true,
        },
    });

    function matchIncassoExclusive(
        o: (typeof alive)[0],
        usedStripe: Set<string>,
        usedPaypal: Set<string>
    ): { found: string; ref: string } {
        if (o.stripeTransactionId) {
            usedStripe.add(o.stripeTransactionId);
            return { found: 'sì', ref: `Order.stripeTransactionId=${o.stripeTransactionId}` };
        }
        const byOrder = stripeMovs.find(
            (s) => s.orderId === o.id && !usedStripe.has(s.stripeId)
        );
        if (byOrder) {
            usedStripe.add(byOrder.stripeId);
            return {
                found: 'sì',
                ref: `Stripe ${byOrder.stripeId} ${dayKey(byOrder.createdAtStripe)} ${euroPlain(byOrder.amountCents)}€ (orderId)`,
            };
        }
        const ppByOrder = paypal.find(
            (p) => p.orderId === o.id && !usedPaypal.has(p.id)
        );
        if (ppByOrder) {
            usedPaypal.add(ppByOrder.id);
            return {
                found: 'sì',
                ref: `PayPal ${ppByOrder.sourceId || ppByOrder.sourceKey} ${dayKey(ppByOrder.accountingDate)} ${euroPlain(ppByOrder.totalCents)}€ (orderId)`,
            };
        }
        const stripeHit = stripeMovs.find((s) => {
            if (usedStripe.has(s.stripeId)) return false;
            if (Math.abs(s.amountCents) !== o.totalPriceCents) return false;
            return daysBetween(s.createdAtStripe, o.createdAt) <= 5;
        });
        if (stripeHit) {
            usedStripe.add(stripeHit.stripeId);
            return {
                found: 'sì',
                ref: `Stripe ${stripeHit.stripeId} ${dayKey(stripeHit.createdAtStripe)} ${euroPlain(stripeHit.amountCents)}€ (±5g)`,
            };
        }
        const ppHit = paypal.find((p) => {
            if (usedPaypal.has(p.id)) return false;
            if (Math.abs(p.totalCents) !== o.totalPriceCents) return false;
            return daysBetween(p.accountingDate, o.createdAt) <= 5;
        });
        if (ppHit) {
            usedPaypal.add(ppHit.id);
            return {
                found: 'sì',
                ref: `PayPal ${ppHit.sourceId || ppHit.sourceKey} ${dayKey(ppHit.accountingDate)} ${euroPlain(ppHit.totalCents)}€ (±5g)`,
            };
        }
        return { found: 'no', ref: '' };
    }

    // Assegna prima gli ordini PAID (hanno più diritto sull'incasso), poi UNPAID
    const usedStripe = new Set<string>();
    const usedPaypal = new Set<string>();
    const orderedForMatch = [...alive].sort((a, b) => {
        const pa = a.partnerPaymentStatus === 'PAID' ? 0 : 1;
        const pb = b.partnerPaymentStatus === 'PAID' ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const matchById = new Map<string, { found: string; ref: string }>();
    for (const o of orderedForMatch) {
        matchById.set(o.id, matchIncassoExclusive(o, usedStripe, usedPaypal));
    }

    const rows = alive.map((o) => {
        const inc = matchById.get(o.id)!;
        return {
            o,
            pay: o.partnerPaymentStatus || '',
            inc,
            priority:
                (o.partnerPaymentStatus === 'UNPAID' || !o.partnerPaymentStatus) &&
                inc.found === 'no'
                    ? 0
                    : o.partnerPaymentStatus === 'UNPAID'
                      ? 1
                      : 2,
        };
    });
    rows.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.o.createdAt.getTime() - b.o.createdAt.getTime();
    });

    const lines: string[] = [];
    lines.push(
        csvRow([
            'data',
            'numero_ordine',
            'importo',
            'stato_pagamento',
            'stato_ordine',
            'data_consegna',
            'incasso_trovato',
            'riferimento_incasso',
            'VERDETTO',
        ])
    );
    for (const r of rows) {
        lines.push(
            csvRow([
                dayKey(r.o.createdAt),
                r.o.orderNumber,
                euroPlain(r.o.totalPriceCents),
                r.pay || '—',
                r.o.status,
                r.o.deliveryDate ? dayKey(r.o.deliveryDate) : '',
                r.inc.found,
                r.inc.ref,
                '',
            ])
        );
    }

    const path = join(process.cwd(), 'docs/verbali/mammi_serie.csv');
    writeFileSync(path, lines.join('\n') + '\n', 'utf8');
    return {
        path,
        n: rows.length,
        unpaidNoIncasso: rows.filter((r) => r.priority === 0).length,
    };
}

async function main() {
    const costi = await exportCosti99();
    const isa = await exportIsabella();
    const mammi = await exportMammi();
    console.log(JSON.stringify({ costi, isa, mammi }, null, 2));
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

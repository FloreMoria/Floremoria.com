/**
 * Audit sola lettura 2026: abbinamento bonifico uscita → fiorista.
 * Replica la logica di listFloristMissingInvoices (namesCompatible) senza side-effect.
 */
import fs from 'node:fs';
import prisma from '@/lib/prisma';

function normalizeName(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/** Stessa logica permissiva usata in floristMissingInvoices (token len>3). */
function namesCompatiblePermissive(a: string, b: string): boolean {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    if (na.includes(nb) || nb.includes(na)) return true;
    const tokens = na.split(' ').filter((t) => t.length > 3);
    return tokens.some((t) => nb.includes(t));
}

const GENERIC_TOKENS = new Set([
    'STUDIO',
    'FLOWER',
    'FLOWERS',
    'FIORI',
    'FIORE',
    'FIORERIA',
    'FLORERIA',
    'GARDEN',
    'SHOP',
    'DI',
    'DELLA',
    'DELLE',
    'SNC',
    'SRL',
    'SAS',
    'SPA',
    'DITTA',
    'SOCIETA',
]);

function extractBeneficiary(description: string): string | null {
    const d = description || '';
    const patterns = [
        /Ben(?:eficiario)?\s*:\s*(.+?)(?:\s+Iban:|\s+Ins:|\s+Da:|\s+Transid:|\s+TransID:|\s+Cau:|\s+·|$)/i,
        /Beneficiario:\s*(.+?)(?:\s+Iban:|\s+Data|\s+Canale:|\s+Causale:|$)/i,
    ];
    for (const p of patterns) {
        const m = d.match(p);
        if (m?.[1]) return m[1].replace(/\s+/g, ' ').trim();
    }
    return null;
}

function beneficiaryMatchesPartner(
    beneficiary: string | null,
    partnerShop: string,
    partnerOwner: string | null
): { ok: boolean; reason: string } {
    if (!beneficiary) return { ok: false, reason: 'beneficiario_non_estratto' };
    const b = normalizeName(beneficiary);
    const shop = normalizeName(partnerShop);
    const owner = normalizeName(partnerOwner || '');

    // Match stretto: inclusione o token significativi (non generici)
    const significant = (s: string) =>
        s.split(' ').filter((t) => t.length > 3 && !GENERIC_TOKENS.has(t));

    if (shop && (b.includes(shop) || shop.includes(b))) {
        return { ok: true, reason: 'shop_inclusione' };
    }
    if (owner && owner.length >= 5 && (b.includes(owner) || owner.includes(b))) {
        return { ok: true, reason: 'owner_inclusione' };
    }

    const bTok = significant(b);
    const shopTok = significant(shop);
    const ownerTok = significant(owner);
    const hitShop = bTok.filter((t) => shopTok.some((s) => s.includes(t) || t.includes(s)));
    const hitOwner = bTok.filter((t) => ownerTok.some((s) => s.includes(t) || t.includes(s)));
    if (hitShop.length >= 1) return { ok: true, reason: `shop_token:${hitShop.join(',')}` };
    if (hitOwner.length >= 1) return { ok: true, reason: `owner_token:${hitOwner.join(',')}` };

    // Check if ONLY generic token would have matched (false positive explanation)
    const permissiveShop = namesCompatiblePermissive(partnerShop, beneficiary);
    const permissiveOwner = partnerOwner
        ? namesCompatiblePermissive(partnerOwner, beneficiary)
        : false;
    if (permissiveShop || permissiveOwner) {
        return { ok: false, reason: 'solo_token_generico_o_falso_positivo' };
    }
    return { ok: false, reason: 'nessuna_corrispondenza' };
}

function attributionCriterion(opts: {
    matchType: string | null;
    matchedOrderId: string | null;
    matchNotes: string | null;
    viaOrderPartner: boolean;
    viaNameMatch: boolean;
    viaFloristType: boolean;
}): string {
    if (opts.matchedOrderId && opts.viaOrderPartner) return 'ordine_collegato.partner';
    if (opts.matchNotes?.toLowerCase().includes('associato da contabilità')) {
        return 'bind_manuale_contabilita';
    }
    if (opts.viaNameMatch) return 'namesCompatible_shop_o_owner_vs_causale';
    if (opts.viaFloristType) return 'matchType_FLORIST_*_senza_nome_partner';
    return 'sconosciuto';
}

async function main() {
    const lookback = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));

    const partners = await prisma.partner.findMany({
        where: { deletedAt: null },
        select: { id: true, shopName: true, ownerName: true },
        take: 500,
    });

    const lines = await prisma.bankStatementLine.findMany({
        where: {
            amountCents: { lt: 0 },
            OR: [
                { accountingDate: { gte: lookback, lte: end } },
                { valueDate: { gte: lookback, lte: end } },
            ],
        },
        select: {
            id: true,
            amountCents: true,
            accountingDate: true,
            valueDate: true,
            description: true,
            matchType: true,
            matchStatus: true,
            matchNotes: true,
            matchedOrderId: true,
        },
        take: 5000,
        orderBy: { accountingDate: 'asc' },
    });

    const orderIds = [
        ...new Set(lines.map((l) => l.matchedOrderId).filter(Boolean) as string[]),
    ];
    const orders =
        orderIds.length > 0
            ? await prisma.order.findMany({
                  where: { id: { in: orderIds } },
                  select: {
                      id: true,
                      orderNumber: true,
                      partnerId: true,
                      partner: { select: { id: true, shopName: true, ownerName: true } },
                  },
              })
            : [];
    const orderById = new Map(orders.map((o) => [o.id, o]));

    type Row = {
        date: string;
        amountEuro: string;
        amountCents: number;
        beneficiary: string | null;
        partnerAttributed: string | null;
        partnerId: string | null;
        criterion: string;
        matchType: string | null;
        mismatch: boolean;
        mismatchReason: string | null;
        orderNumber: string | null;
        bankLineId: string;
        descriptionSnippet: string;
    };

    const rows: Row[] = [];

    for (const line of lines) {
        const payDate = line.accountingDate || line.valueDate;
        if (!payDate || payDate < lookback || payDate > end) continue;

        const floristType =
            line.matchType === 'FLORIST_TRANSFER' ||
            line.matchType === 'FLORIST_INVOICE' ||
            line.matchType === 'FLORIST_ADVANCE';

        const beneficiary = extractBeneficiary(line.description);

        let partner: (typeof partners)[number] | null = null;
        let viaOrderPartner = false;
        let viaNameMatch = false;

        if (line.matchedOrderId) {
            const ord = orderById.get(line.matchedOrderId);
            if (ord?.partner) {
                partner = {
                    id: ord.partner.id,
                    shopName: ord.partner.shopName,
                    ownerName: ord.partner.ownerName,
                };
                viaOrderPartner = true;
            }
        }

        if (!partner) {
            partner =
                partners.find(
                    (p) =>
                        namesCompatiblePermissive(p.shopName, line.description) ||
                        namesCompatiblePermissive(p.ownerName || '', line.description)
                ) || null;
            if (partner) viaNameMatch = true;
        }

        // Solo movimenti attribuiti a un fiorista (come F3 / coda missing)
        if (!partner && !floristType) continue;
        // Se floristType ma nessun partner trovato, includi comunque
        if (!partner && floristType) {
            rows.push({
                date: payDate.toISOString().slice(0, 10),
                amountEuro: (Math.abs(line.amountCents) / 100).toFixed(2),
                amountCents: Math.abs(line.amountCents),
                beneficiary,
                partnerAttributed: null,
                partnerId: null,
                criterion: attributionCriterion({
                    matchType: line.matchType,
                    matchedOrderId: line.matchedOrderId,
                    matchNotes: line.matchNotes,
                    viaOrderPartner: false,
                    viaNameMatch: false,
                    viaFloristType: true,
                }),
                matchType: line.matchType,
                mismatch: true,
                mismatchReason: 'FLORIST_*_senza_partner_risolto',
                orderNumber: line.matchedOrderId
                    ? orderById.get(line.matchedOrderId)?.orderNumber || null
                    : null,
                bankLineId: line.id,
                descriptionSnippet: line.description.slice(0, 160),
            });
            continue;
        }

        if (!partner) continue;

        // Escludi SDI_INVOICE già matchati a fornitore non fiorista? User asked for every
        // outbound attributed to a florist — include if partner was attributed.
        const check = beneficiaryMatchesPartner(
            beneficiary,
            partner.shopName,
            partner.ownerName
        );

        rows.push({
            date: payDate.toISOString().slice(0, 10),
            amountEuro: (Math.abs(line.amountCents) / 100).toFixed(2),
            amountCents: Math.abs(line.amountCents),
            beneficiary,
            partnerAttributed: partner.shopName,
            partnerId: partner.id,
            criterion: attributionCriterion({
                matchType: line.matchType,
                matchedOrderId: line.matchedOrderId,
                matchNotes: line.matchNotes,
                viaOrderPartner,
                viaNameMatch,
                viaFloristType: floristType,
            }),
            matchType: line.matchType,
            mismatch: !check.ok,
            mismatchReason: check.ok ? null : check.reason,
            orderNumber: line.matchedOrderId
                ? orderById.get(line.matchedOrderId)?.orderNumber || null
                : null,
            bankLineId: line.id,
            descriptionSnippet: line.description.slice(0, 160),
        });
    }

    const mismatches = rows.filter((r) => r.mismatch);
    const out = {
        generatedAt: new Date().toISOString(),
        scope: '2026 uscite bancarie attribuite a fiorista (partner name-match o FLORIST_*)',
        totalAttributed: rows.length,
        totalAttributedEuro: (rows.reduce((s, r) => s + r.amountCents, 0) / 100).toFixed(2),
        mismatchCount: mismatches.length,
        mismatchEuro: (mismatches.reduce((s, r) => s + r.amountCents, 0) / 100).toFixed(2),
        mismatchRate:
            rows.length > 0
                ? `${((mismatches.length / rows.length) * 100).toFixed(1)}%`
                : '0%',
        byCriterion: Object.entries(
            rows.reduce(
                (acc, r) => {
                    acc[r.criterion] = (acc[r.criterion] || 0) + 1;
                    return acc;
                },
                {} as Record<string, number>
            )
        ),
        mismatches,
        allRows: rows,
    };

    fs.writeFileSync('/tmp/audit-bank-florist-2026.json', JSON.stringify(out, null, 2));
    console.log(
        JSON.stringify(
            {
                wrote: '/tmp/audit-bank-florist-2026.json',
                totalAttributed: out.totalAttributed,
                totalAttributedEuro: out.totalAttributedEuro,
                mismatchCount: out.mismatchCount,
                mismatchEuro: out.mismatchEuro,
                mismatchRate: out.mismatchRate,
                byCriterion: out.byCriterion,
                mismatchSample: mismatches.slice(0, 15).map((r) => ({
                    date: r.date,
                    euro: r.amountEuro,
                    beneficiary: r.beneficiary,
                    partner: r.partnerAttributed,
                    reason: r.mismatchReason,
                    criterion: r.criterion,
                    matchType: r.matchType,
                })),
            },
            null,
            2
        )
    );
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

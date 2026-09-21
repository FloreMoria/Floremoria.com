/**
 * Gruppo B: toglie attribuzione partner errata (Mastro Fiori / Bonfante→RC).
 * Nessuna riassegnazione — lista lavoro «bonifici da attribuire».
 * Gruppo C: alias Ferrante → MAG Flowers.
 */
import prisma from '@/lib/prisma';
import { parsePartnerNameAliases } from '@/lib/financial/partnerNameMatch';

const GROUP_B_BANK_LINE_IDS = [
    'cmt311c5f0008l4049qwn4ait', // Piero Cotugno → Mastro Fiori
    'cmt311c5g0012l404znotvoiw', // Torcasio Angelo → Mastro Fiori
    'cmt1vc6uj0002ky04e4zg5f63', // Vidoz Alessia → Mastro Fiori
    'cmt1vc6uj000eky04yphmwedw', // Cannone Lucrezia → Mastro Fiori
    'cmt1vc6uj000gky04jsoz1834', // Provini → Mastro Fiori
    'cmt1vc6ul001xky04oan8y49b', // Bonfante → Fioreria Reggio Calabria
    'cmu5nwv5j0003k3049z6m6zoo', // Lory's Garden → Mastro Fiori
    'cmu5nwv5j0004k304q8yp8wao', // LA ROSA ROSSA → Mastro Fiori
] as const;

const MAG_FLOWERS_PARTNER_ID = 'cmrf2gsjq0000l504l53viopq';
const FERRANTE_ALIAS = 'Flowers di Ferrante Ignazio';

function upsertNameAlias(notes: string | null | undefined, alias: string): string {
    const marker = '[nameAliases]';
    const cleanAlias = alias.trim();
    const base = (notes || '').trim();
    if (base.includes(cleanAlias) && base.includes(marker)) return base;
    if (base.includes(cleanAlias)) return `${base}\n${marker} ${cleanAlias}`.trim();
    if (base.includes(marker)) {
        return base.replace(marker, `${marker} ${cleanAlias} ·`);
    }
    return [base, `${marker} ${cleanAlias}`].filter(Boolean).join('\n');
}

async function unattributeBankLine(id: string) {
    const line = await prisma.bankStatementLine.findUnique({ where: { id } });
    if (!line) return { id, ok: false, error: 'not_found' };

    const raw =
        line.rawJson && typeof line.rawJson === 'object'
            ? { ...(line.rawJson as Record<string, unknown>) }
            : {};

    delete raw.matchedPartnerId;
    delete raw.matchedPartnerName;
    delete raw.floristMissingInvoice;
    raw.awaitingPartnerAttribution = true;
    raw.attributionClearedAt = new Date().toISOString();
    raw.attributionClearedReason =
        'Falso positivo namesCompatible (token FIORI / partner errato) — lista lavoro bonifici da attribuire';

    const wasFloristType =
        line.matchType === 'FLORIST_TRANSFER' ||
        line.matchType === 'FLORIST_INVOICE' ||
        line.matchType === 'FLORIST_ADVANCE';

    await prisma.bankStatementLine.update({
        where: { id },
        data: {
            matchedOrderId: null,
            matchType: wasFloristType ? 'UNMATCHED' : line.matchType,
            matchStatus: wasFloristType ? 'UNMATCHED' : line.matchStatus,
            matchNotes: [
                line.matchNotes || '',
                'Attribuzione partner rimossa — bonifico da attribuire (lista lavoro).',
            ]
                .filter(Boolean)
                .join(' | '),
            rawJson: raw,
        },
    });

    return {
        id,
        ok: true,
        before: { matchType: line.matchType, matchedOrderId: line.matchedOrderId },
        afterMatchType: wasFloristType ? 'UNMATCHED' : line.matchType,
    };
}

async function main() {
    const bResults = [];
    for (const id of GROUP_B_BANK_LINE_IDS) {
        bResults.push(await unattributeBankLine(id));
    }

    const partner = await prisma.partner.findUnique({
        where: { id: MAG_FLOWERS_PARTNER_ID },
        select: { id: true, shopName: true, ownerName: true, internalNotes: true },
    });
    if (!partner) throw new Error('MAG Flowers partner not found');

    const newNotes = upsertNameAlias(partner.internalNotes, FERRANTE_ALIAS);
    await prisma.partner.update({
        where: { id: MAG_FLOWERS_PARTNER_ID },
        data: { internalNotes: newNotes },
    });

    console.log(
        JSON.stringify(
            {
                groupB: { n: bResults.length, results: bResults },
                groupC: {
                    partnerId: MAG_FLOWERS_PARTNER_ID,
                    shopName: partner.shopName,
                    aliasAdded: FERRANTE_ALIAS,
                    notesPreview: newNotes.slice(0, 240),
                    aliasesParsed: parsePartnerNameAliases(newNotes),
                },
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

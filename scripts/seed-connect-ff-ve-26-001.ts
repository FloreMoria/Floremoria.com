/**
 * Seed FF-VE-26-001 sul canale Connect (numeri reali 16/09).
 * Uso: FORCE_NEON=1 npx tsx scripts/seed-connect-ff-ve-26-001.ts
 */
import fs from 'node:fs';
import { recordConnectPartnerCharge } from '../lib/financial/connectPartnerChannel';
import { PrismaClient } from '@prisma/client';

if (process.env.FORCE_NEON === '1') {
    const envFile = fs.readFileSync('.env', 'utf8');
    const m = envFile.match(/^DATABASE_URL=(.+)$/m);
    if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        process.env.DATABASE_URL = v;
    }
}

const prisma = new PrismaClient();

async function main() {
    const af = await prisma.partner.findFirst({
        where: { shopName: { contains: 'Annunci Funebri' }, deletedAt: null },
        select: { id: true },
    });
    if (!af) throw new Error('Annunci Funebri non trovato');

    const fee = 900;
    const taxable = Math.round(fee / 1.22); // 738
    const vat = fee - taxable; // 162

    const result = await recordConnectPartnerCharge({
        orderNumber: 'FF-VE-26-001',
        masterPartnerId: af.id,
        accountingDate: new Date('2026-09-16T12:00:00.000Z'),
        grossCents: 8999,
        partnerFeeCents: fee,
        partnerFeeTaxableCents: taxable,
        partnerFeeVatCents: vat,
        stripeFeeCents: 358,
        notes: 'Seed da cruscotto AF 16/09 — netto atteso Fineco €77,41',
        source: 'MANUAL',
    });

    console.log(
        JSON.stringify({
            ok: true,
            chargeId: result.chargeId,
            netCents: result.netCents,
            ledger: result.ledger,
        })
    );
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

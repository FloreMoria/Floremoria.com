/**
 * Fase 5 — misura ufficiale snapshot CE + Prima Nota (post-L6).
 * Uso: npx tsx scripts/fase5-snapshot.ts [label]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import prisma from '../lib/prisma';
import {
    computeHistoricalPnl,
    listHistoricalLedgerEntries,
} from '../lib/financial/historicalLedgerQuery';
import { compareGatewayTransitBalances } from '../lib/financial/gatewayTransitBalance';
import { FISCAL_AUTHORITY_DEDUPE_ENABLED } from '../lib/financial/fiscalAuthorityDedupe';

function euro(cents: number) {
    return (cents / 100).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
    });
}

async function snap(label: string) {
    const p = await computeHistoricalPnl({ fiscalYear: 2026 });
    const t = await compareGatewayTransitBalances();
    const costi =
        p.costiFioristiCents +
        p.costiFatturePassiveSdiCents +
        p.costiSaasCents +
        p.costiOperativiCents +
        p.oneriBancariCents;

    // Conteggio Prima Nota = righe post hierarchy + Fineco master (API list)
    const listed = await listHistoricalLedgerEntries({
        fiscalYear: 2026,
        take: 2000,
        skip: 0,
        direction: 'ALL',
    });

    const out = {
        label,
        at: new Date().toISOString(),
        fiscalAuthorityEnabled: FISCAL_AUTHORITY_DEDUPE_ENABLED,
        raiCents: p.risultatoAnteImposteCents,
        ricaviCents: p.ricaviLordiCents,
        costiCents: costi,
        bancaCents: p.cashBankBalanceCents,
        stripeCents: t.stripe.transitLedgerCents,
        paypalCents: t.paypal.transitLedgerCents,
        // rows post Fineco master (API list); visual dedupe UI è ulteriore e non qui
        primaNotaRows: listed.total,
        primaNotaSampleLen: listed.rows.length,
        euro: {
            rai: euro(p.risultatoAnteImposteCents),
            ricavi: euro(p.ricaviLordiCents),
            costi: euro(costi),
            banca: euro(p.cashBankBalanceCents),
            stripe: euro(t.stripe.transitLedgerCents),
            paypal: euro(t.paypal.transitLedgerCents),
        },
    };
    console.log(JSON.stringify(out, null, 2));
    return out;
}

const label = process.argv[2] || 'snapshot';
snap(label)
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });

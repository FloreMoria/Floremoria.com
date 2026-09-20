/**
 * Recupero forzato YouDOX: finestra ampia, onlyUnread=false, mark DOPO ingest.
 * Uso: npx tsx scripts/_youdox-force-recovery.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import fs from 'node:fs';
import path from 'node:path';
import { getFinancialYoudoxClient } from '@/lib/financial/youdoxClient';
import { ingestSdiInvoiceUpload } from '@/lib/financial/ingestSdiInvoices';
import { buildPassiveIdentityKey } from '@/lib/financial/passiveInvoiceIdentity';
import prisma from '@/lib/prisma';

const BUDGET_MS = Number(process.env.YOUDOX_SYNC_BUDGET_MS || 55_000);
const LOOKBACK_DAYS = Number(process.env.YOUDOX_FORCE_LOOKBACK_DAYS || 400);

async function main() {
    const client = getFinancialYoudoxClient();
    const from = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
    const started = Date.now();
    const list = await client.fetchPassiveInvoicesForSync({
        timestampFrom: from,
        lookbackDays: LOOKBACK_DAYS,
        onlyUnread: false,
    });
    console.info('[force-recovery] polled', list.length, 'from', from.toISOString().slice(0, 10));

    const existing = new Set<string>();
    const rows = await prisma.manualFinanceExpense.findMany({
        where: { docType: { in: ['FATTURA', 'NOTA_CREDITO'] } },
        select: { metadataJson: true },
        take: 5000,
    });
    for (const row of rows) {
        const meta = (row.metadataJson || {}) as Record<string, unknown>;
        if (typeof meta.passiveIdentityKey === 'string') existing.add(meta.passiveIdentityKey);
        else {
            const k = buildPassiveIdentityKey(
                (meta.vendorVat as string) || (meta.cedenteVat as string),
                meta.invoiceNumber as string
            );
            if (k) existing.add(k);
        }
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let marked = 0;
    let remaining = 0;
    const failures: Array<{ key: string; numero?: string | null; err: string }> = [];
    const importedSample: Array<{ numero?: string | null; vendor?: string | null; totalCents?: number }> = [];

    for (const inv of list) {
        if (Date.now() - started > BUDGET_MS) {
            remaining = list.length; // approximate stop marker
            break;
        }
        const key = inv.InvoiceKey;
        if (!key) continue;
        const identity = buildPassiveIdentityKey(
            inv.DichiarantePartitaIva || inv.ClientePartitaIva,
            inv.FatturaNumero
        );
        if (identity && existing.has(identity)) {
            skipped += 1;
            continue;
        }
        try {
            const { buffer, parsed } = await client.downloadInvoiceXml(key);
            const fileName = inv.OriginalFilename?.replace(/\.p7m$/i, '') || `${key}.xml`;
            const summary = await ingestSdiInvoiceUpload({
                buffer,
                fileName: fileName.endsWith('.xml') ? fileName : `${fileName}.xml`,
                contentType: 'application/xml',
            });
            await client.markInvoiceAsRead(key);
            marked += 1;
            imported += summary.imported;
            updated += summary.updated;
            if (identity) existing.add(identity);
            if (summary.imported > 0 || summary.updated > 0) {
                importedSample.push({
                    numero: parsed.invoiceNumber,
                    vendor: parsed.vendorName,
                    totalCents: parsed.totalCents,
                });
            }
        } catch (e) {
            failed += 1;
            failures.push({
                key,
                numero: inv.FatturaNumero,
                err: e instanceof Error ? e.message : String(e),
            });
        }
    }

    const report = {
        generatedAt: new Date().toISOString(),
        lookbackDays: LOOKBACK_DAYS,
        polled: list.length,
        imported,
        updated,
        skippedAlreadyInLedger: skipped,
        failed,
        markedAfterIngest: marked,
        budgetExhausted: remaining > 0,
        failureSample: failures.slice(0, 15),
        importedSample: importedSample.slice(0, 20),
    };
    const out = path.join(process.cwd(), 'docs/verbali/17-09-2026-youdox-force-recovery.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    console.info('Wrote', out);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());

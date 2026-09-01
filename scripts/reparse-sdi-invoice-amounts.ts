#!/usr/bin/env tsx
/**
 * Re-parsing rapido imponibili FatturaPA già archiviati con netCents=0.
 * Uso: npx tsx scripts/reparse-sdi-invoice-amounts.ts
 */
import { reparseZeroNetSdiInvoices } from '@/lib/financial/reparseZeroNetSdiInvoices';

async function main() {
    const result = await reparseZeroNetSdiInvoices({ limit: 500 });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

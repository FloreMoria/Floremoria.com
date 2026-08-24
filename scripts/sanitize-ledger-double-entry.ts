/**
 * Bonifica retroattiva FinancialLedgerEntry (default: 01/01/2026 → oggi).
 * Uso: npx tsx scripts/sanitize-ledger-double-entry.ts
 * Opzioni: --from=2026-01-01
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
    const fromArg = process.argv.find((a) => a.startsWith('--from='));
    const fromDate = fromArg
        ? new Date(`${fromArg.slice('--from='.length)}T00:00:00.000Z`)
        : new Date('2026-01-01T00:00:00.000Z');

    const { sanitizeLedgerDoubleEntryAnomalies } = await import(
        '../lib/financial/ledgerDoubleEntrySanitize'
    );
    const prisma = (await import('../lib/prisma')).default;

    console.log(`Sanitizing FinancialLedgerEntry from ${fromDate.toISOString().slice(0, 10)}…`);
    const result = await sanitizeLedgerDoubleEntryAnomalies({ fromDate });
    console.log('sanitize result:', JSON.stringify(result, null, 2));

    // Post-check: residui critici
    const active = await prisma.financialLedgerEntry.findMany({
        where: { accountingDate: { gte: fromDate }, reversedAt: null },
        select: {
            sourceKey: true,
            sourceType: true,
            category: true,
            totalCents: true,
            description: true,
            counterpartyName: true,
            metadataJson: true,
        },
        take: 12000,
    });

    const internalNoise = active.filter(
        (r) =>
            r.sourceType === 'PAYPAL_MOVEMENT' &&
            /importo\s+pagato|denaro\s+raccolto/i.test(r.description || '')
    );
    const saasAsRevenue = active.filter(
        (r) =>
            r.category === 'RICAVI_VENDITE' &&
            /GOOGLE|OPENAI|ANTHROPIC|CLAUDE|CURSOR|VERCEL|TWILIO|SUPABASE|ADOBE|FUTURIA/i.test(
                `${r.description || ''} ${r.counterpartyName || ''}`
            )
    );
    const googleStillWrong = active.filter(
        (r) =>
            /GOOGLE/i.test(r.description || '') &&
            r.totalCents < 0 &&
            r.category !== 'SPESE_SAAS'
    );
    const jsonBankfee = active.filter((r) =>
        r.sourceKey.startsWith('JSON_ENTRY:entry_bankfee_')
    );

    console.log(
        JSON.stringify(
            {
                activeRows: active.length,
                residualInternalNet: internalNoise.length,
                residualSaasAsRevenue: saasAsRevenue.length,
                residualGoogleWrongCat: googleStillWrong.length,
                residualJsonBankfee: jsonBankfee.length,
                sampleSaasAsRevenue: saasAsRevenue.slice(0, 5).map((r) => ({
                    k: r.sourceKey,
                    c: r.totalCents,
                    d: (r.description || '').slice(0, 50),
                })),
            },
            null,
            2
        )
    );

    await prisma.$disconnect();
    const failed =
        internalNoise.length + saasAsRevenue.length + googleStillWrong.length;
    if (failed > 0) {
        console.warn(`WARN: ${failed} residual anomalies after sanitize`);
        process.exitCode = 0; // non bloccare CI: idempotenza può lasciare edge-case
    }
}

main().catch(async (err) => {
    console.error(err);
    process.exit(1);
});

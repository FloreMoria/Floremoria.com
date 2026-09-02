/**
 * Audit integrità movimenti bancari Fineco (anno 2026).
 * Uso: npx tsx scripts/audit-bank-movements-2026.ts
 */
import { auditBankStatementIntegrity } from '@/lib/financial/bankStatements/auditBankStatementIntegrity';
import { recomputeAllBankStatementFingerprints } from '@/lib/financial/bankStatements/store';

async function main() {
    const fp = await recomputeAllBankStatementFingerprints();
    console.info('[bank-audit] Fingerprint ricalcolati', fp);

    const audit = await auditBankStatementIntegrity({ year: 2026 });
    console.info('[bank-audit] Report', JSON.stringify(audit, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

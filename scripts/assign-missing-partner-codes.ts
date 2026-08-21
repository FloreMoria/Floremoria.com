/**
 * Script per l'assegnazione automatica di codici identificativi univoci (uniqueCode)
 * ai partner/fioristi sprovvisti (es. Carrozza, Fioreria Daniela).
 *
 * ESECUZIONE:
 * npx tsx scripts/assign-missing-partner-codes.ts [--execute]
 */
import prisma from '../lib/prisma';
import { generatePartnerCode } from '../lib/codeGenerator';

async function runAssignMissingPartnerCodes() {
    const isExecuteMode = process.argv.includes('--execute');

    console.info('=== SCANSIONE ASSEGNAZIONE CODICI UNIVOCI PARTNER ===');
    if (!isExecuteMode) {
        console.info('ℹ️  MODALITÀ DRY-RUN. Per applicare nel DB Neon PG: npx tsx scripts/assign-missing-partner-codes.ts --execute');
    } else {
        console.info('⚡ MODALITÀ ESECUZIONE ATTIVA');
    }

    const allPartners = await prisma.partner.findMany({
        select: {
            id: true,
            shopName: true,
            ownerName: true,
            uniqueCode: true,
            province: true,
            coverageArea: true,
            address: true,
        },
    });

    const missingPartners = allPartners.filter((p) => !p.uniqueCode || !p.uniqueCode.trim());

    console.info(`Trovati ${allPartners.length} partner totali nel DB.`);
    console.info(`Partner sprovvisti di codice univoco (uniqueCode): ${missingPartners.length}`);

    if (missingPartners.length === 0) {
        console.info('🎉 Tutti i partner possiedono già un codice univoco valido.');
        process.exit(0);
    }

    console.info('\nELENCO PARTNER DA VALORIZZARE:');
    const updatesToApply: Array<{ partnerId: string; shopName: string; ownerName: string | null; newCode: string }> = [];

    // Mappa province manuali di supporto per partner noti se province è nullo
    const provinceOverrides: Record<string, string> = {
        'Fioreria Daniela': 'CO',
        'Carrozza': 'RC',
    };

    for (const p of missingPartners) {
        let prov = p.province?.trim() || '';
        if (!prov && provinceOverrides[p.shopName]) {
            prov = provinceOverrides[p.shopName];
        }
        if (!prov && p.coverageArea) {
            const cov = p.coverageArea.toLowerCase();
            if (cov.includes('como')) prov = 'CO';
            else if (cov.includes('siderno') || cov.includes('reggio')) prov = 'RC';
        }

        const newCode = await generatePartnerCode(prov || 'XX');
        updatesToApply.push({
            partnerId: p.id,
            shopName: p.shopName,
            ownerName: p.ownerName,
            newCode,
        });
        console.info(`  • ${p.shopName} (${p.ownerName || '—'}) -> Codice Assegnato: ${newCode}`);
    }

    if (!isExecuteMode) {
        console.info('\n💡 Per confermare ed applicare l\'aggiornamento nel DB Neon PG, esegui:');
        console.info('npx tsx scripts/assign-missing-partner-codes.ts --execute');
        process.exit(0);
    }

    console.info('\n🚀 Aggiornamento codici partner nel DB in corso...');
    for (const item of updatesToApply) {
        await prisma.partner.update({
            where: { id: item.partnerId },
            data: { uniqueCode: item.newCode },
        });
        console.info(`✅ Aggiornato: ${item.shopName} -> uniqueCode = ${item.newCode}`);
    }

    console.info('\n🔍 Verifica finale anti-duplicati...');
    const updatedPartners = await prisma.partner.findMany({
        select: { id: true, shopName: true, uniqueCode: true },
    });

    const codeCounts = new Map<string, number>();
    let duplicatesFound = false;

    for (const p of updatedPartners) {
        if (!p.uniqueCode) continue;
        const count = (codeCounts.get(p.uniqueCode) || 0) + 1;
        codeCounts.set(p.uniqueCode, count);
        if (count > 1) {
            console.error(`❌ DUPLICATO RILEVATO: codice "${p.uniqueCode}" su partner ${p.shopName}`);
            duplicatesFound = true;
        }
    }

    if (!duplicatesFound) {
        console.info('🎉 PERFETTO: 0 duplicati trovati nel DB. Tutti i partner hanno un uniqueCode univoco e valido!');
    }

    process.exit(0);
}

runAssignMissingPartnerCodes().catch((err) => {
    console.error('Errore fatale nello script di assegnazione codici partner:', err);
    process.exit(1);
});

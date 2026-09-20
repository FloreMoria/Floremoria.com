/**
 * Build-breaker privacy export commercialista (F1+F2).
 * Controlla gli header: nessun campo PII in F2.
 * Eseguito da `prebuild` insieme a florist-privacy.
 */
import ExcelJS from 'exceljs';
import {
    assertCommercialistaCorrispettiviPrivacy,
    COMMERCIALISTA_CORRISPETTIVI_FORBIDDEN_HEADERS,
    commercialistaCorrispettiviFilename,
} from '@/lib/financial/commercialistaCorrispettiviXlsx';

function fail(msg: string): never {
    console.error(`[commercialista-corrispettivi-privacy] FAIL: ${msg}`);
    process.exit(1);
}

function ok(msg: string) {
    console.log(`[commercialista-corrispettivi-privacy] OK: ${msg}`);
}

async function main() {
    // Smoke: workbook sintetico con soli header ammessi
    const wb = new ExcelJS.Workbook();
    const f1 = wb.addWorksheet('F1 — Riepilogo');
    f1.addRow(['Voce', 'N. vendite', 'Imponibile EUR', 'Aliquota %', 'IVA a debito EUR', 'Totale lordo EUR']);
    const f2 = wb.addWorksheet('F2 — Registro corrispettivi');
    f2.addRow([
        'Data ordine',
        'Riferimento ordine',
        'Canale di incasso',
        'Imponibile EUR',
        'Aliquota %',
        'IVA EUR',
        'Totale lordo EUR',
    ]);
    f2.addRow(['2026-05-03', 'FT-MC-26-007', 'Stripe', 259, 10, 25.9, 284.9]);
    f2.addRow(['2026-05-19', 'DA_COLLEGARE', 'Stripe', 31.81, 10, 3.18, 34.99]);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await assertCommercialistaCorrispettiviPrivacy(buffer);
    ok('header F1/F2 senza PII');

    // Guard: lista forbidden non vuota
    if (COMMERCIALISTA_CORRISPETTIVI_FORBIDDEN_HEADERS.length < 5) {
        fail('lista forbidden headers troppo corta');
    }
    ok(`forbidden headers: ${COMMERCIALISTA_CORRISPETTIVI_FORBIDDEN_HEADERS.length}`);

    // Filename convention
    const qName = commercialistaCorrispettiviFilename({
        kind: 'quarter',
        year: 2026,
        quarter: 2,
    });
    if (qName !== 'FloreMoria_2026_T2_Corrispettivi.xlsx') {
        fail(`filename quarter inatteso: ${qName}`);
    }
    const yName = commercialistaCorrispettiviFilename({ kind: 'year', year: 2026 });
    if (yName !== 'FloreMoria_2026_ANNO_Corrispettivi.xlsx') {
        fail(`filename year inatteso: ${yName}`);
    }
    ok('convenzione nome file');

    // Negativo: header con email deve fallire
    const bad = new ExcelJS.Workbook();
    const badWs = bad.addWorksheet('F2 — Registro corrispettivi');
    badWs.addRow(['Data ordine', 'Email cliente', 'Totale lordo EUR']);
    const badBuf = Buffer.from(await bad.xlsx.writeBuffer());
    let threw = false;
    try {
        await assertCommercialistaCorrispettiviPrivacy(badBuf);
    } catch {
        threw = true;
    }
    if (!threw) fail('doveva rifiutare header Email cliente');
    ok('rifiuta header PII');

    console.log('[commercialista-corrispettivi-privacy] tutti i controlli superati');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

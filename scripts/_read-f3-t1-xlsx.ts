import ExcelJS from 'exceljs';

async function main() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile('docs/verbali/FloreMoria_2026_T1_Corrispettivi.xlsx');
    const ws = wb.getWorksheet('F3 — Costi senza documento');
    if (!ws) throw new Error('no F3');
    const rows: unknown[] = [];
    ws.eachRow((row, n) => {
        if (n === 1) return;
        const vals = [1, 2, 3, 4, 5, 6].map((c) => row.getCell(c).value);
        if (String(vals[0]).startsWith('TOTALE') || String(vals[0]).startsWith('nessun')) return;
        rows.push({
            ordine: vals[0],
            fiorista: vals[1],
            importo: vals[2],
            data: vals[3] instanceof Date ? vals[3].toISOString().slice(0, 10) : vals[3],
            prepaid: vals[4],
            parent: vals[5],
        });
    });
    console.log(JSON.stringify({ n: rows.length, rows }, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

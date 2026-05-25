import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

// Helper to escape values for CSV
function escapeCsv(val: string | null | undefined): string {
    if (val === null || val === undefined) return '';
    const clean = val.toString().replace(/"/g, '""');
    return `"${clean}"`;
}

function run() {
    const projectRoot = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria';
    const sourcePath = path.join(projectRoot, 'GOOGLE_MERCHANT_FEED.csv');
    const targetPath = path.join(projectRoot, 'GOOGLE_MERCHANT_OFFICIAL_FEED.csv');

    console.log('--- Generazione Feed Ufficiale Google Merchant Center ---');
    console.log('File sorgente:', sourcePath);
    console.log('File di destinazione:', targetPath);

    if (!fs.existsSync(sourcePath)) {
        console.error('Errore: Il file sorgente GOOGLE_MERCHANT_FEED.csv non esiste in questa directory.');
        process.exit(1);
    }

    const fileContent = fs.readFileSync(sourcePath, 'utf-8');
    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });

    if (parsed.errors.length > 0) {
        console.warn('Avviso: Rilevati alcuni errori durante il parsing del file sorgente:', parsed.errors);
    }

    const rows = parsed.data as any[];
    console.log(`Numero di prodotti caricati con successo: ${rows.length}`);

    // Exact 38 headers matching Google's official template column-by-column
    const officialHeaders = [
        'id',
        'title',
        'description',
        'availability',
        'availability date',
        'expiration date',
        'link',
        'mobile link',
        'image link',
        'price',
        'sale price',
        'sale price effective date',
        'identifier exists',
        'gtin',
        'mpn',
        'brand',
        'product highlight',
        'product detail',
        'additional image link',
        'condition',
        'adult',
        'color',
        'size',
        'size type',
        'size system',
        'gender',
        'material',
        'pattern',
        'age group',
        'multipack',
        'is bundle',
        'unit pricing measure',
        'unit pricing base measure',
        'energy efficiency class',
        'min energy efficiency class',
        'max energy efficiency class',
        'item group id',
        'sell on google quantity'
    ];

    const csvLines: string[] = [];
    
    // Add headers row
    csvLines.push(officialHeaders.join(','));

    // Process each product row
    for (const r of rows) {
        const item: Record<string, string> = {
            'id': r.id || '',
            'title': r.title || '',
            'description': r.description || '',
            'availability': r.availability || 'in_stock',
            'availability date': '',
            'expiration date': '',
            'link': r.link || '',
            'mobile link': '',
            'image link': r.image_link || '',
            'price': r.price || '',
            'sale price': '',
            'sale price effective date': '',
            'identifier exists': 'no', // Standard for hand-crafted artisan goods to avoid GTIN errors
            'gtin': '',
            'mpn': '',
            'brand': 'FloreMoria', // Brand matching the website
            'product highlight': '',
            'product detail': '',
            'additional image link': '',
            'condition': r.condition || 'new',
            'adult': 'no',
            'color': '',
            'size': '',
            'size type': '',
            'size system': '',
            'gender': '',
            'material': '',
            'pattern': '',
            'age group': '',
            'multipack': '',
            'is bundle': 'no',
            'unit pricing measure': '',
            'unit pricing base measure': '',
            'energy efficiency class': '',
            'min energy efficiency class': '',
            'max energy efficiency class': '',
            'item group id': '',
            'sell on google quantity': ''
        };

        // Align values to the exact headers order and escape them for safe CSV formatting
        const alignedRow = officialHeaders.map(h => escapeCsv(item[h]));
        csvLines.push(alignedRow.join(','));
    }

    // Write the output file
    fs.writeFileSync(targetPath, csvLines.join('\n'), 'utf-8');
    console.log('✅ FEED GENERATO CON SUCCESSO! File scritto in:', targetPath);
}

run();

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function getWebpImages(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) return [];
    try {
        const files = fs.readdirSync(dirPath);
        return files
            .filter(f => f.toLowerCase().endsWith('.webp'))
            .map(f => path.join(dirPath, f));
    } catch {
        return [];
    }
}

function getCleanWords(str: string): string[] {
    let normalized = str.toLowerCase();
    
    // Normalize synonyms
    if (normalized.includes('messaggio')) normalized += ' biglietto';
    if (normalized.includes('biglietto')) normalized += ' messaggio';
    if (normalized.includes('rose')) normalized += ' di rose';
    if (normalized.includes('ceri')) normalized += ' candele';
    if (normalized.includes('candele')) normalized += ' ceri';

    return normalized
              .replace(/[^a-z0-9\s]/g, ' ')
              .split(/\s+/)
              .filter(w => w && w !== 'di' && w !== 'per' && w !== 'e' && w !== 'da' && w !== 'della' && w !== 'del' && w !== 'la' && w !== 'in' && w !== 'vaso' && w !== 'pianta' && w !== 'bouquet' && w !== 'piccoli' && w !== 'amici');
}

async function run() {
    const products = await prisma.product.findMany({
        where: { deletedAt: null },
        include: { category: true },
        orderBy: [
            { category: { name: 'asc' } },
            { sortOrder: 'asc' }
        ]
    });

    const publicDir = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/public';
    const productsBaseDir = path.join(publicDir, 'images/products');

    const mappingRows: any[] = [];

    // Map categories to directory names (handle both database names 'Cimitero', 'Funerale' and standard names)
    const categoryDirs: Record<string, string> = {
        'Cimitero': 'fiori-sulle-tombe',
        'Fiori sulle Tombe': 'fiori-sulle-tombe',
        'Funerale': 'Fiori-per-Funerale',
        'Fiori per Funerali': 'Fiori-per-Funerale',
        'Piccoli Amici': 'Fiori-per-Piccoli-Amici'
    };

    for (const p of products) {
        const catDir = categoryDirs[p.category.name] || '';
        let matchedImages: string[] = [];
        let chosenFolder = 'N/A';

        if (catDir) {
            const catPath = path.join(productsBaseDir, catDir);
            if (fs.existsSync(catPath)) {
                const folders = fs.readdirSync(catPath);
                
                let bestFolder = '';
                let bestScore = -1;

                for (const f of folders) {
                    if (f.startsWith('.')) continue;
                    
                    const cleanFolder = getCleanWords(f);
                    const cleanProduct = getCleanWords(p.name);
                    
                    // Calculate intersection score
                    const intersection = cleanProduct.filter(w => cleanFolder.includes(w));
                    const score = intersection.length;

                    if (score > bestScore) {
                        bestScore = score;
                        bestFolder = f;
                    }
                }

                // Threshold of at least 1 matching specific word, or fallback to slug substring
                if (bestScore > 0 && bestFolder) {
                    chosenFolder = bestFolder;
                    matchedImages = getWebpImages(path.join(catPath, bestFolder));
                } else {
                    // Fallback to exact or partial slug substring matching
                    const fallbackFolder = folders.find(f => {
                        if (f.startsWith('.')) return false;
                        return f.toLowerCase().includes(p.slug.toLowerCase()) || 
                               p.slug.toLowerCase().includes(f.toLowerCase().replace(/:/g, '-'));
                    });

                    if (fallbackFolder) {
                        chosenFolder = fallbackFolder;
                        matchedImages = getWebpImages(path.join(catPath, fallbackFolder));
                    }
                }
            }
        }

        const relativePaths = matchedImages.map(img => '/' + path.relative(publicDir, img));

        mappingRows.push({
            id: p.id,
            name: p.name,
            price: (p.basePriceCents / 100).toFixed(2) + ' €',
            category: p.category.name === 'Cimitero' ? 'Fiori sulle Tombe' : (p.category.name === 'Funerale' ? 'Fiori per Funerali' : p.category.name),
            folder: chosenFolder,
            images: relativePaths
        });
    }

    // Build the Markdown content
    let md = '# Google Merchant Center - Inventario Visivo & Mappatura Immagini\\n\\n';
    md += 'Questo documento contiene la mappatura esatta tra il catalogo prodotti a database ed i file fisici `.webp` ottimizzati per la SEO presenti nella cartella `public/` del progetto, pronti per l\'esportazione verso il Google Merchant Center feed.\\n\\n';
    md += '## Tabella di Mappatura Catalogo\\n\\n';
    md += '| Categoria | Prodotto | Prezzo | Cartella Prodotto | Immagine Principale | Immagini Aggiuntive |\\n';
    md += '| :--- | :--- | :--- | :--- | :--- | :--- |\\n';

    for (const row of mappingRows) {
        const hasImages = row.images.length > 0;
        const mainImage = hasImages ? '`' + row.images[0] + '`' : '**[IMMAGINE MANCANTE]**';
        const additionalImages = row.images.length > 1 
            ? row.images.slice(1).map((img: string) => '`' + img + '`').join('<br>') 
            : '-';
        md += `| ${row.category} | **${row.name}** | ${row.price} | ${hasImages ? row.folder : 'N/A'} | ${mainImage} | ${additionalImages} |\\n`;
    }

    md += '\\n\\n---\\n*Generato automaticamente da Antigravity per FloreMoria.com il ' + new Date().toLocaleDateString('it-IT') + '*\\n';

    fs.writeFileSync('/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/GOOGLE_MERCHANT_MAPPING.md', md);
    console.log('MAPPING_GENERATED_SUCCESSFULLY');
}

run().finally(() => prisma.$disconnect());

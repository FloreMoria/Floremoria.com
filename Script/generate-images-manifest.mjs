import fs from 'fs';
import path from 'path';

const basePath = path.join(process.cwd(), 'public/images/products');
const outputPath = path.join(process.cwd(), 'public/images-manifest.json');

const validExtensions = new Set(['.webp', '.png', '.jpg', '.jpeg']);
const manifest = {};

if (fs.existsSync(basePath)) {
    // 1. Categorie (fiori-sulle-tombe, Fiori-per-Funerale, ecc.)
    const categories = fs.readdirSync(basePath, { withFileTypes: true });

    for (const cat of categories) {
        if (!cat.isDirectory() || cat.name.startsWith('.')) continue;
        
        const catPath = path.join(basePath, cat.name);
        
        // 2. Prodotti dentro la categoria (Bouquet Rose, Cuscino, ecc.)
        const products = fs.readdirSync(catPath, { withFileTypes: true });
        
        for (const prod of products) {
            if (!prod.isDirectory() || prod.name.startsWith('.') || prod.name === '_backup_originals') continue;
            
            const prodPath = path.join(catPath, prod.name);
            const folderName = prod.name; // Il nome della cartella finale (es. "Bouquet Rose")

            const allFiles = fs.readdirSync(prodPath, { withFileTypes: true })
                .filter(f => !f.isDirectory() && !f.name.startsWith('.'))
                .map(f => f.name);

            const validFiles = allFiles.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return validExtensions.has(ext);
            });

            const imageFiles = validFiles
                .sort((a, b) => {
                    const aLow = a.toLowerCase();
                    const bLow = b.toLowerCase();
                    const aCover = aLow.includes('copertina') || aLow.includes('main') || aLow.startsWith('1.');
                    const bCover = bLow.includes('copertina') || bLow.includes('main') || bLow.startsWith('1.');
                    if (aCover && !bCover) return -1;
                    if (!aCover && bCover) return 1;
                    return a.localeCompare(b);
                })
                .map(file => encodeURI(`/images/products/${cat.name}/${folderName}/${file}`));

            if (imageFiles.length > 0) {
                manifest[folderName] = {
                    images: imageFiles,
                    coverImage: imageFiles[0]
                };
            }
        }
    }
}

fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
console.log('✅ Generated granular images manifest');


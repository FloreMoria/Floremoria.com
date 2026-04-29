import fs from 'fs';
import path from 'path';

const basePath = path.join(process.cwd(), 'public/images/products');
const outputPath = path.join(process.cwd(), 'public/images-manifest.json');

const validExtensions = new Set(['.webp', '.png', '.jpg', '.jpeg']);

const manifest = {};

if (fs.existsSync(basePath)) {
    const folders = fs.readdirSync(basePath, { withFileTypes: true });

    for (const folder of folders) {
        if (folder.isDirectory()) {
            const folderName = folder.name;
            if (folderName === '_backup_originals' || folderName.startsWith('.')) {
                continue;
            }

            const folderPath = path.join(basePath, folderName);
            
            // Helper for recursive read
            function getFilesRecursively(dir, fileList = []) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        getFilesRecursively(fullPath, fileList);
                    } else {
                        // Salva il path relativo alla cartella base (es. public/images/products)
                        const relPath = path.relative(basePath, fullPath);
                        fileList.push(relPath);
                    }
                }
                return fileList;
            }

            const allFiles = getFilesRecursively(folderPath);

            const seenNames = new Set();
            const validFiles = allFiles.filter(file => {
                const lowerName = file.toLowerCase();
                const basename = path.parse(lowerName).name;

                if (validExtensions.has(path.extname(lowerName)) && !seenNames.has(basename)) {
                    seenNames.add(basename);
                    return true;
                }
                return false;
            });

            const imageFiles = validFiles
                .sort() // stable sort alphabetically
                .map(file => `/images/products/${file}`); // file è già il path relativo corretto

            manifest[folderName] = {
                images: imageFiles,
                coverImage: imageFiles.length > 0 ? imageFiles[0] : null
            };
        }
    }
}

fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

console.log('✅ Generated images manifest');

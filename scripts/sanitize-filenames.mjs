import fs from 'fs';
import path from 'path';

const basePath = path.join(process.cwd(), 'public/images/products');

function sanitize(filename) {
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);
    const safeStr = basename
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return safeStr + ext.toLowerCase();
}

if (fs.existsSync(basePath)) {
    const folders = fs.readdirSync(basePath, { withFileTypes: true });
    for (const folder of folders) {
        if (folder.isDirectory()) {
            const folderPath = path.join(basePath, folder.name);
            const files = fs.readdirSync(folderPath);
            for (const file of files) {
                const safeName = sanitize(file);
                if (file !== safeName && file !== '_backup_originals') {
                    fs.renameSync(path.join(folderPath, file), path.join(folderPath, safeName));
                    console.log(`Renamed: ${file} -> ${safeName}`);
                }
            }
        }
    }
}

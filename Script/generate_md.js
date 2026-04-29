const fs = require('fs');
const path = require('path');

const rootDir = 'public/images/products';

function getFilesRecursively(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFilesRecursively(filePath, fileList);
    } else if (filePath.endsWith('.webp')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allFiles = getFilesRecursively(rootDir);

const folderKeywords = {
  'fiori-sulle-tombe': 'fiori per tomba, consegna cimitero, fiorista online, cura loculo, fiori freschi cimitero',
  'Fiori per Funerale': 'fiori per funerale, composizione funebre, fiori lutto, condoglianze, consegna chiesa, camera ardente',
  'accessori': 'accessori cimitero, lumini votivi, nastro commemorativo, biglietto lutto, ceri',
};

let md = `# SEO/AEO Immagini - FloreMoria\n\n`;

md += `## 1. Dati AEO/EXIF Globali (Comuni a tutte le immagini)\n`;
md += `- **Copyright:** FloreMoria\n`;
md += `- **Author / Creator:** FloreMoria AI Studio\n`;
md += `- **Credit:** FloreMoria (www.floremoria.com)\n`;
md += `- **Location Created (AEO):** Italia (O un riferimento generale "Cimiteri Italiani")\n`;
md += `- **Usage Rights:** All Rights Reserved\n\n`;

md += `## 2. Set Keywords Dinamico per Categoria Madre\n`;
for (const [key, val] of Object.entries(folderKeywords)) {
  md += `- **${key}:** \`${val}\`\n`;
}
md += `*(Queste keyword verranno aggiunte automaticamente a tutte le immagini nella rispettiva categoria, oltre a quelle specifiche)*\n\n`;

md += `## 3. Tabella Immagini (Compila la colonna "Descrizione Visiva")\n`;
md += `In questa tabella trovi ogni singola immagine. Puoi scrivere la descrizione visiva nell'ultima colonna. Lo script prenderà poi questi dati per iniettarli nel WebP.\n\n`;

md += `| Categoria/Cartella | Nome File (Titolo Attuale) | Keywords Specifiche Proposte | Descrizione Visiva (DA COMPILARE) |\n`;
md += `|---|---|---|---|\n`;

for (const file of allFiles) {
  const relPath = path.relative(rootDir, file);
  const parts = relPath.split(path.sep);
  const fileName = parts.pop();
  const folderPath = parts.join('/');
  
  // Create specific keywords from filename
  const cleanName = fileName.replace('.webp', '').replace(/-\d{4}$/, '').replace(/-/g, ' ');
  const specificKw = cleanName.split(' ').filter(w => w.length > 3).join(', ');
  
  md += `| \`${folderPath}\` | **${fileName}** | \`${specificKw}\` |  |\n`;
}

fs.writeFileSync('SEO_AEO_Immagini.md', md);
console.log('Markdown generated at SEO_AEO_Immagini.md');

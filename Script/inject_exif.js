const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const csvPath = path.resolve('SEO_AEO_Immagini.csv');
const rootDir = path.resolve('public/images/products');

if (!fs.existsSync(csvPath)) {
  console.error("File CSV non trovato!");
  process.exit(1);
}

// Funzione basilare per fare il parsing del CSV
function parseCSV(content) {
  const lines = content.split('\n');
  const result = [];
  for (let i = 1; i < lines.length; i++) { // Salta l'header
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split tramite punto e virgola
    const row = line.split(';');
    // Rimuovi virgolette di contorno se presenti
    result.push(row.map(col => col.replace(/^"|"$/g, '').replace(/""/g, '"')));
  }
  return result;
}

const csvContent = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
const data = parseCSV(csvContent);

const categoryKeywords = {
  'fiori-sulle-tombe': 'fiori per tomba, consegna cimitero, fiorista online, cura loculo, fiori freschi cimitero',
  'Fiori per Funerale': 'fiori per funerale, composizione funebre, fiori lutto, condoglianze, consegna chiesa, camera ardente',
  'accessori': 'accessori cimitero, lumini votivi, nastro commemorativo, biglietto lutto, ceri',
};

console.log(`Inizio iniezione EXIF/XMP su ${data.length} immagini...`);

for (const row of data) {
  if (row.length < 4) continue;
  
  const [folderPath, fileName, specificKw, description] = row;
  const fullPath = path.join(rootDir, folderPath, fileName);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`[ATTENZIONE] File non trovato: ${fullPath}`);
    continue;
  }
  
  // 1. Costruisci il Titolo (dal nome del file senza .webp e trattini)
  const title = fileName.replace('.webp', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // 2. Costruisci la Descrizione (usa quella inserita a mano, se vuota usa il titolo)
  const finalDescription = description && description.trim() !== '' ? description : title;
  
  // 3. Costruisci le Keywords (Globali + Categoria + Specifiche)
  // Trova la macro-categoria dal path
  let catKw = '';
  if (folderPath.startsWith('fiori-sulle-tombe')) catKw = categoryKeywords['fiori-sulle-tombe'];
  else if (folderPath.startsWith('Fiori per Funerale')) catKw = categoryKeywords['Fiori per Funerale'];
  else if (folderPath.startsWith('accessori')) catKw = categoryKeywords['accessori'];
  
  const allKeywords = [
    'floremoria', 'italia', // Globali fisse
    ...(catKw ? catKw.split(',').map(s => s.trim()) : []),
    ...(specificKw ? specificKw.split(',').map(s => s.trim()) : [])
  ];
  
  // Rimuovi duplicati
  const uniqueKeywords = [...new Set(allKeywords)].filter(Boolean).join(', ');
  
  // 4. Esegui ExifTool
  // Usiamo -sep ", " per dire a exiftool di dividere le stringhe in tag separati per Subject/Keywords
  // -overwrite_original per non creare file _original
  const command = `exiftool -overwrite_original -sep ", " ` +
    `-XMP:Title="${title}" ` +
    `-EXIF:ImageDescription="${finalDescription}" ` +
    `-XMP:Description="${finalDescription}" ` +
    `-IPTC:Caption-Abstract="${finalDescription}" ` +
    `-XMP:Subject="${uniqueKeywords}" ` +
    `-IPTC:Keywords="${uniqueKeywords}" ` +
    `-XMP:Creator="FloreMoria AI Studio" ` +
    `-IPTC:By-line="FloreMoria AI Studio" ` +
    `-XMP:Rights="FloreMoria" ` +
    `-IPTC:CopyrightNotice="FloreMoria" ` +
    `-IPTC:Credit="FloreMoria (www.floremoria.com)" ` +
    `"${fullPath}"`;

  try {
    execSync(command, { stdio: 'ignore' });
    console.log(`✅ EXIF iniettati in: ${fileName}`);
  } catch (error) {
    console.error(`❌ Errore durante l'iniezione su ${fileName}: ${error.message}`);
  }
}

console.log("Processo di iniezione completato!");

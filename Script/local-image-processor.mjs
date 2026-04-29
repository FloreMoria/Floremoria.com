import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function main() {
  const rawArgs = process.argv.slice(2);
  const argString = rawArgs.join(' ').split('||').map(s => s.trim());
  const useSEO = rawArgs.length > 0 && argString.length >= 2;

  let seoKeywords = '';
  let altText = '';
  let slugBase = '';
  const dir = process.cwd();
  console.log(`🔍 Controllo foto nella cartella: ${dir}`);

  if (useSEO) {
    seoKeywords = argString[0];
    altText = argString[1];
    slugBase = seoKeywords.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    console.log(`🎯 1. Naming acquisito: "${seoKeywords}"`);
    console.log(`🎯 2. Alt Text acquisito: "${altText}"`);
  } else {
    console.log(`⚠️  Esecuzione in Modalità Semplice: Nessuna stringa SEO fornita. I file manterranno il nome originale e la rinomina andrà fatta in Finder.`);
  }

  const files = fs.readdirSync(dir);
  const imageFiles = files.filter(f => {
    const ext = f.toLowerCase();
    return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.webp');
  });

  if (imageFiles.length === 0) {
    console.log("Nessuna immagine (.png, .jpg) trovata qui.");
    return;
  }

  let index = 1;
  for (const file of imageFiles) {
    const filePath = path.join(dir, file);
    const origName = path.parse(file).name;
    const newFileName = useSEO ? `${slugBase}-${index}.webp` : `${origName}-cropped.webp`;
    const outputPath = path.join(dir, newFileName);

    console.log(`⏳ Sto processando: ${file}`);
    
    const image = sharp(filePath);
    const metadata = await image.metadata();

    let pipeline = image;

    // Taglio 3:4 per immagini quadrate (elimina watermark AI)
    if (metadata.width === metadata.height) {
      const targetWidth = Math.floor(metadata.height * 0.75);
      const leftOffset = Math.floor((metadata.width - targetWidth) / 2);
      
      pipeline = pipeline.extract({
        left: leftOffset,
        top: 0,
        width: targetWidth,
        height: metadata.height
      });
    }

    // Salva in WEBP ad alta efficienza
    await pipeline
      .webp({ quality: 85, effort: 6 })
      .toFile(outputPath);

    console.log(`✅ Fatto! Salvato come: ${newFileName}`);
    index++;
  }

  if (useSEO) {
    const metaReportPath = path.join(dir, 'SEO_META_REPORT.txt');
    const reportContent = `⭐ REGOLE AUREE SEO/AEO DI FLOREMORIA ⭐\n----------------------------------------\nNAMING: ${slugBase}-[1-${imageFiles.length}].webp\n- Perché: Indica a Google il contenuto prima di leggere la pagina.\n\nTESTO ALTERNATIVO (ALT): "${altText}"\n- Perché: Principale dato per le AI per consigliare il prodotto.\n\nMETADATI (COMMENTI O TITOLO): "${seoKeywords.replace(/-/g, ' ')}"\n- Perché: Rafforza l'identità del file condiviso.\n\n=> AZIONE: Copia questo Testo ALT nel tuo Database (Dashboard) per le tue ${imageFiles.length} foto!`;
    fs.writeFileSync(metaReportPath, reportContent);
    console.log(`\n📄 Generato il 'SEO_META_REPORT.txt' formattato esattamente secondo le tue regole AEO!`);
  }

}

main().catch(console.error);

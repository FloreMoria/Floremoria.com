import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(process.cwd());

const renameConfig = {
  'public/images/products/accessori/set-ceri-candele': [
    'set-ceri-candele-cimitero-lunga-durata',
    'lumini-votivi-per-tomba-cera',
    'candele-ricordo-per-defunti',
    'set-illuminazione-votiva-cimitero'
  ],
  'public/images/products/Fiori per Funerale/bouquet-cordoglio-sincero': [
    'bouquet-cordoglio-sincero-consegna-funerale',
    'fiori-bianchi-funerale-cordoglio-sincero',
    'composizione-floreale-funerale-cordoglio',
    'mazzo-fiori-condoglianze-sincere'
  ],
  'public/images/products/Fiori per Funerale/bouquet-memoria-eterna': [
    'bouquet-memoria-eterna-fiori-per-funerale',
    'mazzo-fiori-memoria-eterna-condoglianze',
    'composizione-funebre-memoria-eterna',
    'fiori-lutto-consegna-memoria-eterna'
  ],
  'public/images/products/Fiori per Funerale/bouquet-omaggio-solenne': [
    'bouquet-omaggio-solenne-funerale',
    'mazzo-fiori-omaggio-solenne-condoglianze',
    'fiori-per-funerale-omaggio-solenne',
    'composizione-elegante-funerale-omaggio'
  ],
  'public/images/products/Fiori per Funerale/bouquet-rispetto-vicinanza': [
    'bouquet-rispetto-vicinanza-funerale',
    'fiori-rispetto-e-vicinanza-condoglianze',
    'mazzo-fiori-per-lutto-rispetto-vicinanza',
    'composizione-floreale-condoglianze-vicinanza'
  ],
  'public/images/products/Fiori per Funerale/copribara': [
    'copribara-floreale-per-funerale',
    'cuscino-fiori-copribara-lutto',
    'composizione-copribara-elegante-funerale',
    'fiori-copribara-consegna-chiesa'
  ],
  'public/images/products/Fiori per Funerale/cuore-corona': [
    'corona-fiori-per-funerale-cuore',
    'cuore-floreale-per-lutto-condoglianze',
    'corona-funebre-cuore-fiori-freschi',
    'composizione-cuore-per-funerale'
  ],
  'public/images/products/Fiori per Funerale/cuscino': [
    'cuscino-fiori-per-funerale',
    'cuscino-floreale-lutto-condoglianze',
    'composizione-cuscino-funebre-fiori',
    'fiori-per-funerale-cuscino-elegante'
  ],
  'public/images/products/Fiori per Funerale/kalonche': [
    'pianta-kalanchoe-fiori-per-funerale',
    'composizione-pianta-kalanchoe-lutto',
    'pianta-kalanchoe-bianca-condoglianze',
    'piante-per-funerale-kalanchoe-consegna'
  ],
  'public/images/products/Fiori per Funerale/margherite-gerbere FF': [
    'composizione-margherite-gerbere-funerale',
    'mazzo-fiori-gerbere-margherite-lutto',
    'fiori-per-funerale-gerbere-chiesa',
    'bouquet-margherite-condoglianze'
  ],
  'public/images/products/Fiori per Funerale/piramide': [
    'composizione-floreale-piramide-funerale',
    'fiori-piramide-lutto-condoglianze',
    'piramide-fiori-freschi-per-funerale',
    'composizione-funebre-piramide-elegante'
  ]
};

async function renameImages() {
  for (const [dirRelPath, seoNames] of Object.entries(renameConfig)) {
    const dirPath = path.join(projectRoot, dirRelPath);
    if (!fs.existsSync(dirPath)) {
      console.warn(`Directory not found: ${dirPath}`);
      continue;
    }

    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.webp'))
      .sort(); // Sort to ensure consistent mapping

    if (files.length === 0) continue;

    console.log(`\nProcessing ${dirRelPath}...`);
    
    files.forEach((file, index) => {
      const oldPath = path.join(dirPath, file);
      
      // se è già un file con nome seo non lo tocco (es: non contiene spazi o "000")
      if (!file.includes(' ') && !file.match(/[0-9]{4}/)) {
        console.log(`  Skipping ${file}, seems already renamed.`);
        return;
      }

      const seoName = seoNames[index % seoNames.length]; // cycle if more files than names
      
      const newFileName = `${seoName}-${Date.now().toString().slice(-4)}.webp`;
      const newPath = path.join(dirPath, newFileName);
      
      fs.renameSync(oldPath, newPath);
      console.log(`  Renamed: ${file} -> ${newFileName}`);
    });
  }
}

renameImages().catch(console.error);

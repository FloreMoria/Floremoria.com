import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const basePath = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/public/images/products/Fiori-per-Piccoli-Amici';

const globalKeywords = "fiori animali domestici, lutto cane gatto, cimitero animali, ponte dell'arcobaleno, funerale animali, loculo animali";

const seoMapping = {
    'Abbraccio Verde': [
        { name: 'pianta-verde-resistente-per-tomba-animali.webp', keys: 'pianta, verde, resistente, tomba, animali' },
        { name: 'composizione-piante-cimitero-animali.webp', keys: 'composizione, piante, cimitero, animali' },
        { name: 'consegna-pianta-verde-loculo-cani-gatti.webp', keys: 'consegna, pianta, verde, loculo, cani, gatti' },
        { name: 'vaso-pianta-tomba-piccoli-amici.webp', keys: 'vaso, pianta, tomba, piccoli, amici' }
    ],
    'Anima Pura': [
        { name: 'anima-pura-fiori-bianchi-autunno-animali.webp', keys: 'anima, pura, fiori, bianchi, autunno, animali' },
        { name: 'fiori-invernali-bianchi-tomba-cane.webp', keys: 'fiori, invernali, bianchi, tomba, cane' },
        { name: 'bouquet-anima-pura-cimitero-animali.webp', keys: 'bouquet, anima, pura, cimitero, animali' },
        { name: 'fiori-estivi-bianchi-ricordo-gatto.webp', keys: 'fiori, estivi, bianchi, ricordo, gatto' }
    ],
    'Battito di Foglia': [
        { name: 'pianta-fiorita-autunno-tomba-animale.webp', keys: 'pianta, fiorita, autunno, tomba, animale' },
        { name: 'pianta-inverno-resistente-cimitero-animali.webp', keys: 'pianta, inverno, resistente, cimitero, animali' },
        { name: 'fiori-estivi-lapide-cani-gatti.webp', keys: 'fiori, estivi, lapide, cani, gatti' },
        { name: 'composizione-fiorita-naturale-animali.webp', keys: 'composizione, fiorita, naturale, animali' }
    ],
    'Biglietto Piccoli Amici': [
        { name: 'biglietto-condoglianze-animali-cuore.webp', keys: 'biglietto, condoglianze, animali, cuore' },
        { name: 'messaggio-ricordo-cane-gatto-tomba.webp', keys: 'messaggio, ricordo, cane, gatto, tomba' }
    ],
    'Ceri Piccoli Amici': [
        { name: 'ceri-funerale-eleganti-animali-domestici.webp', keys: 'ceri, funerale, eleganti, animali, domestici' },
        { name: 'candele-commemorative-lutto-animali-cani.webp', keys: 'candele, commemorative, lutto, animali, cani' }
    ],
    'Il Giardino del Ponte': [
        { name: 'giardino-del-ponte-fiori-bianco-blu.webp', keys: 'giardino, ponte, fiori, bianco, blu' },
        { name: 'mazzo-fiori-giallo-arancio-cimitero-animali.webp', keys: 'mazzo, fiori, giallo, arancio, cimitero, animali' },
        { name: 'composizione-fiori-freschi-rosso-bianco-animali.webp', keys: 'composizione, fiori, freschi, rosso, bianco, animali' },
        { name: 'consegna-fiori-tomba-ponte-arcobaleno.webp', keys: 'consegna, fiori, tomba, ponte, arcobaleno' }
    ],
    'Legame eterno': [
        { name: 'legame-eterno-rose-tomba-animali.webp', keys: 'legame, eterno, rose, tomba, animali' },
        { name: 'fiori-primavera-cimitero-cani.webp', keys: 'fiori, primavera, cimitero, cani' },
        { name: 'bouquet-rose-ricordo-gatto-consegna.webp', keys: 'bouquet, rose, ricordo, gatto, consegna' },
        { name: 'mazzo-fiori-legame-eterno-animali.webp', keys: 'mazzo, fiori, legame, eterno, animali' }
    ],
    'Lumino Piccoli Amici': [
        { name: 'lumino-per-tomba-cani-gatti-cimitero.webp', keys: 'lumino, tomba, cani, gatti, cimitero' },
        { name: 'candela-ricordo-animali-domestici-rosso.webp', keys: 'candela, ricordo, animali, domestici, rosso' }
    ],
    'Nastro Commemorativo Piccoli Amici': [
        { name: 'nastro-funebre-crema-animali-impronte.webp', keys: 'nastro, funebre, crema, animali, impronte' },
        { name: 'nastro-commemorativo-seta-viola-animali.webp', keys: 'nastro, commemorativo, seta, viola, animali' }
    ],
    'Un raggio di sole': [
        { name: 'raggio-di-sole-fiori-rosa-animali.webp', keys: 'raggio, sole, fiori, rosa, animali' },
        { name: 'composizione-luminosa-tomba-cani-gatti.webp', keys: 'composizione, luminosa, tomba, cani, gatti' },
        { name: 'consegna-fiori-girasoli-cimitero-animali.webp', keys: 'consegna, fiori, girasoli, cimitero, animali' },
        { name: 'mazzo-fiori-sole-ricordo-animale-domestico.webp', keys: 'mazzo, fiori, sole, ricordo, animale, domestico' }
    ]
};

function injectMetadata(filePath, title, keywords) {
    const fullKeywords = `${globalKeywords}, ${keywords}`;
    try {
        const cmd = `exiftool -overwrite_original \
            -Title="${title}" \
            -Description="FloreMoria - Luce e Memoria. ${title}" \
            -Subject="${fullKeywords}" \
            -Keywords="${fullKeywords}" \
            -Author="FloreMoria AI Studio" \
            -Creator="FloreMoria" \
            -Copyright="FloreMoria (www.floremoria.com)" \
            -Credit="FloreMoria" \
            "${filePath}"`;
        execSync(cmd, { stdio: 'ignore' });
        console.log(`✅ Iniettato: ${title}`);
    } catch (err) {
        console.error(`❌ Errore iniezione su ${filePath}:`, err.message);
    }
}

for (const [folderName, filesData] of Object.entries(seoMapping)) {
    const folderPath = path.join(basePath, folderName);
    if (!fs.existsSync(folderPath)) {
        console.warn(`Cartella non trovata: ${folderPath}`);
        continue;
    }

    const currentFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.webp') && !f.startsWith('.'));
    
    // Sort files just to be deterministic
    currentFiles.sort();

    for (let i = 0; i < currentFiles.length && i < filesData.length; i++) {
        const oldFile = currentFiles[i];
        const newFile = filesData[i].name;
        const keywords = filesData[i].keys;
        const title = newFile.replace(/-/g, ' ').replace('.webp', '');

        const oldPath = path.join(folderPath, oldFile);
        const newPath = path.join(folderPath, newFile);

        // Rename
        if (oldPath !== newPath) {
            fs.renameSync(oldPath, newPath);
        }

        // Inject
        injectMetadata(newPath, title, keywords);
    }
}
console.log('🎉 Processo di rinomina e iniezione metadata completato!');

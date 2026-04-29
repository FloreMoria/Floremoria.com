const fs = require('fs');
const path = require('path');

const rootDir = path.resolve('public/images/products');

const capoluoghi = [
  'roma', 'milano', 'napoli', 'torino', 'palermo', 'genova', 'bologna', 'firenze',
  'bari', 'catania', 'venezia', 'verona', 'messina', 'padova', 'trieste', 'brescia',
  'parma', 'taranto', 'prato', 'modena', 'reggio-calabria', 'reggio-emilia', 'perugia',
  'ravenna', 'livorno', 'cagliari', 'foggia', 'rimini', 'salerno', 'ferrara', 'sassari',
  'latina', 'monza', 'siracusa', 'pescara', 'bergamo', 'forli', 'trento', 'vicenza',
  'terni', 'bolzano', 'novara', 'piacenza', 'ancona', 'arezzo', 'udine', 'lecce'
];

// Helper per mischiare array (Fisher-Yates)
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const cities = shuffleArray(capoluoghi);
let cityIndex = 0;

function getNextCity() {
  const city = cities[cityIndex];
  cityIndex = (cityIndex + 1) % cities.length;
  return city;
}

function getFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
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

// Iniziamo con l'intestazione CSV e il BOM per Excel (UTF-8)
let csvContent = '\uFEFF'; 
csvContent += '\"Categoria/Cartella\",\"Nome File (Titolo Attuale)\",\"Keywords Specifiche Proposte\",\"Descrizione Visiva (DA COMPILARE)\"\n';

for (const file of allFiles) {
  const relPath = path.relative(rootDir, file);
  const parts = relPath.split(path.sep);
  const fileName = parts.pop();
  const folderPath = parts.join('/');
  
  // Rimuovi estensione e numeri finali (es. -0870) o estrai le parole pulite
  let cleanName = fileName.replace('.webp', '').replace(/-\d{4}$/, '').replace(/-/g, ' ');
  // Converti in array di parole uniche e filtra parole troppo brevi o comuni se vogliamo (ma teniamo per leggibilità se serve)
  let words = cleanName.split(' ').filter(w => w.length > 2);
  
  // Aggiungiamo sempre una città (capoluogo)
  const city = getNextCity();
  
  // Pool di keyword extra tematiche in caso manchino parole per arrivare a 7
  let extraPool = ['consegna', 'cimitero', 'tomba', 'loculo', 'defunti', 'funerale', 'lutto', 'floremoria', 'chiesa', 'fiori', 'freschi'];
  // Mischia pool extra
  extraPool = shuffleArray(extraPool);
  
  // Rimuovi eventuali doppioni
  words = [...new Set(words)];

  // Se abbiamo già la parola italia, magari la teniamo o togliamo, teniamo tutto per ora
  words = words.filter(w => w !== city); // Assicurati che la città non sia già dentro
  
  // Vogliamo ESATTAMENTE 7 parole (se possibile, magari 1 è la città, 6 sono le altre)
  // Mettiamo la città alla fine.
  let targetWords = [];
  
  for (let w of words) {
    if (targetWords.length < 6) {
      if (!['per', 'con', 'sulla'].includes(w.toLowerCase())) { // Rimuovi piccole preposizioni se le consideri sprecate
         targetWords.push(w.toLowerCase());
      }
    }
  }
  
  // Se non arriviamo a 6, peschiamo dal pool extra
  let extraIndex = 0;
  while (targetWords.length < 6 && extraIndex < extraPool.length) {
    let ew = extraPool[extraIndex];
    if (!targetWords.includes(ew)) {
      targetWords.push(ew);
    }
    extraIndex++;
  }
  
  // Aggiungi la città come 7a parola
  targetWords.push(city);
  
  // Ricostruisci il nuovo nome file
  const newFileName = targetWords.join('-') + '.webp';
  const newPath = path.join(path.dirname(file), newFileName);
  
  // Rinominare il file (solo se il nome cambia)
  if (file !== newPath) {
    // Evita sovrascritture in caso rarissimo di collisione
    if (!fs.existsSync(newPath)) {
      fs.renameSync(file, newPath);
      console.log(`Rinominato: ${fileName} -> ${newFileName}`);
    } else {
      // Se esiste aggiungiamo un char extra per sicurezza, ma con 47 capoluoghi è raro
      const safeName = targetWords.join('-') + '-bis.webp';
      fs.renameSync(file, path.join(path.dirname(file), safeName));
      console.log(`Rinominato (collisione risolta): ${fileName} -> ${safeName}`);
    }
  } else {
    console.log(`Nome già ok: ${fileName}`);
  }

  // Prepara la riga per il CSV
  const specificKw = targetWords.join(', ');
  const finalFileName = fs.existsSync(newPath) ? newFileName : newFileName.replace('.webp', '-bis.webp');
  
  const row = [folderPath, finalFileName, specificKw, ''];
  const csvRow = row.map(c => '\"' + String(c).replace(/\"/g, '\"\"') + '\"').join(',');
  
  csvContent += csvRow + '\n';
}

fs.writeFileSync('SEO_AEO_Immagini.csv', csvContent, 'utf-8');
console.log('File CSV rigenerato con successo con i nuovi nomi.');

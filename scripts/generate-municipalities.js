const fs = require('fs');
const path = require('path');

const inputFilePath = path.join(__dirname, '../data/raw_municipalities.json');
const outputFilePath = path.join(__dirname, '../data/municipalities.json');

// Creiamo un file di input dummy se non esiste per iniziare
if (!fs.existsSync(inputFilePath)) {
    console.log(`Creazione di un file di esempio in ${inputFilePath}`);
    const sample = [
        { name: "Como", province: "CO", description: "Servizio di consegna fiori al cimitero in tutta la zona di Como e provincia." },
        { name: "Milano", province: "MI", description: "Prendersi cura del ricordo a Milano. Consegne tempestive nei cimiteri del territorio meneghino." },
        { name: "Roma", province: "RM", description: "Onora la memoria dei tuoi cari con il nostro servizio nei cimiteri romani." }
    ];
    fs.mkdirSync(path.dirname(inputFilePath), { recursive: true });
    fs.writeFileSync(inputFilePath, JSON.stringify(sample, null, 2));
}

const rawData = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));
const processedData = [];
const seenSlugs = new Set();

rawData.forEach(item => {
    if (!item.name || !item.province) {
        console.warn('Skipping item missing name or province:', item);
        return;
    }

    // Genera lo slug: {municipality}-{provinceLowercase}
    const cleanName = item.name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // rimuovi accenti
        .replace(/[^a-z0-9\s-]/g, "") // rimuovi caratteri speciali
        .trim()
        .replace(/\s+/g, "-"); // sostituisci gli spazi con trattini

    const cleanProvince = item.province.toLowerCase().trim();
    const slug = `${cleanName}-${cleanProvince}`;

    if (seenSlugs.has(slug)) {
        console.error(`Errore di validazione: Slug duplicato rilevato -> ${slug}`);
        process.exit(1);
    }

    seenSlugs.add(slug);

    processedData.push({
        ...item,
        slug
    });
});

fs.writeFileSync(outputFilePath, JSON.stringify(processedData, null, 2));
console.log(`Generazione completata. Creati ${processedData.length} comuni con slug unici in ${outputFilePath}.`);

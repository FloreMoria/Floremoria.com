const fs = require('fs');
const path = require('path');

const srcPath = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/docs/whatsapp/knowledge_base_whatsapp.txt';
const outputProjPath = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/scratch/FLOREM_NET_Catalogo_Prezzi_e_Link.txt';
const outputObsidianPath = '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/30_RISORSE_ESTERNE/FLOREM_NET_Catalogo_Prezzi_e_Link.txt';

async function extractCatalog() {
    try {
        console.log('Reading whatsapp knowledge base source...');
        if (!fs.existsSync(srcPath)) {
            console.error(`Source file not found at: ${srcPath}`);
            return;
        }

        const rawText = fs.readFileSync(srcPath, 'utf-8');
        
        // Trova l'inizio del capitolo delle conversazioni storiche per tagliare il file
        const keyword = '==================================================';
        const index = rawText.indexOf(keyword);
        
        if (index === -1) {
            console.error(`Separator "${keyword}" not found in source file.`);
            return;
        }
        
        // Estrae solo la prima parte (il catalogo con prezzi e link)
        let catalogText = rawText.slice(0, index).trim();
        
        // Pulisce eventuali form feed
        catalogText = catalogText.replace(/[\f\u000c]/g, '');
        
        // Aggiunge un'intestazione pulita
        const header = [
            '# FLOREM_NET: CATALOGO PRODOTTI, LISTINO PREZZI E LINK DIRETTI',
            'Questo documento contiene il catalogo ufficiale dei prodotti FloreMoria divisi per categorie, con i rispettivi prezzi di vendita, le regole commerciali degli accessori e i link diretti per ciascuna pagina prodotto.',
            'Da utilizzare come base di conoscenza su Futuria CRM per consentire a VERA di rispondere agli utenti citando i prezzi esatti e i link diretti per completare l\'acquisto.',
            '\n==================================================\n\n'
        ].join('\n');
        
        const finalOutput = header + catalogText;
        
        // Scrive su cartella scratch del progetto
        const projDir = path.dirname(outputProjPath);
        if (!fs.existsSync(projDir)) {
            fs.mkdirSync(projDir, { recursive: true });
        }
        fs.writeFileSync(outputProjPath, finalOutput, 'utf-8');
        console.log(`Catalog data saved to project scratch: ${outputProjPath}`);
        
        // Scrive su Obsidian
        const obsidianDir = path.dirname(outputObsidianPath);
        if (!fs.existsSync(obsidianDir)) {
            fs.mkdirSync(obsidianDir, { recursive: true });
        }
        fs.writeFileSync(outputObsidianPath, finalOutput, 'utf-8');
        console.log(`Catalog data saved to Obsidian: ${outputObsidianPath}`);
        
        console.log('Extraction completed successfully!');
    } catch (e) {
        console.error('Extraction failed:', e);
    }
}

extractCatalog();

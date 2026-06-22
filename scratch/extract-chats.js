const fs = require('fs');
const path = require('path');

const srcPath = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/docs/whatsapp/knowledge_base_whatsapp.txt';
const outputProjPath = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/scratch/FLOREM_NET_Storico_Conversazioni_WhatsApp.txt';
const outputObsidianPath = '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/30_RISORSE_ESTERNE/FLOREM_NET_Storico_Conversazioni_WhatsApp.txt';

async function extractChats() {
    try {
        console.log('Reading whatsapp knowledge base source...');
        if (!fs.existsSync(srcPath)) {
            console.error(`Source file not found at: ${srcPath}`);
            return;
        }

        const rawText = fs.readFileSync(srcPath, 'utf-8');
        
        // Cerca l'inizio del capitolo delle conversazioni storiche
        const keyword = 'CAPITOLO 1: CONVERSAZIONI STORICHE';
        const index = rawText.indexOf(keyword);
        
        if (index === -1) {
            console.error(`Keyword "${keyword}" not found in source file.`);
            return;
        }
        
        // Estrae la parte delle chat
        let chatsText = rawText.slice(index);
        
        // Pulisce eventuali form feed
        chatsText = chatsText.replace(/[\f\u000c]/g, '');
        
        // Aggiunge un'intestazione pulita
        const header = [
            '# FLOREM_NET: STORICO DELLE CONVERSAZIONI WHATSAPP',
            'Questo documento raccoglie la cronologia delle conversazioni reali scambiate con gli utenti.',
            'Da utilizzare come memoria storica e base di conoscenza su Futuria CRM per allineare il modello di linguaggio all\'esatto tono di voce (rispettoso, empatico, sobrio, pragmatico) e alle casistiche operative di FloreMoria.',
            '\n==================================================\n\n'
        ].join('\n');
        
        const finalOutput = header + chatsText;
        
        // Scrive su cartella scratch del progetto
        const projDir = path.dirname(outputProjPath);
        if (!fs.existsSync(projDir)) {
            fs.mkdirSync(projDir, { recursive: true });
        }
        fs.writeFileSync(outputProjPath, finalOutput, 'utf-8');
        console.log(`Historical chats saved to project scratch: ${outputProjPath}`);
        
        // Scrive su Obsidian
        const obsidianDir = path.dirname(outputObsidianPath);
        if (!fs.existsSync(obsidianDir)) {
            fs.mkdirSync(obsidianDir, { recursive: true });
        }
        fs.writeFileSync(outputObsidianPath, finalOutput, 'utf-8');
        console.log(`Historical chats saved to Obsidian: ${outputObsidianPath}`);
        
        console.log('Extraction completed successfully!');
    } catch (e) {
        console.error('Extraction failed:', e);
    }
}

extractChats();

const fs = require('fs');
const path = require('path');

const agentsDir = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/agents';
const outputProjPath = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/scratch/FLOREM_NET_Competenze_Agenti.txt';
const outputObsidianPath = '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/30_RISORSE_ESTERNE/FLOREM_NET_Competenze_Agenti.txt';

// Pattern regex per trovare le varie forme di intestazione
const headerRegex = /Floremoria\s+s\.r\.l\.\s+Sede\s+centrale:\s*[\r\n]*\s*Via\s+Bellinzona,?\s*[\r\n]*\s*82\/B\s*-\s*22100\s+Como\s*(?:\\\||\|)?\s*www\.floremoria\.com\s*[\r\n]*\s*assistenza@floremoria\.com\s*(?:\\\||\|)?\s*\+39\s*[\r\n]*\s*3204105305\s*(?:\\\||\|)?\s*floremoria@pec\.it\s*[\f\u000c]?/gi;
const pivaRegex = /FloreMoria\s+s\.r\.l\.\s+(?:\|\s*)?Via\s+Bellinzona,?\s*82\/b\s*(?:\|\s*)?22100\s+Como\s*(?:\|\s*)?CF,?\s*R\.I\.\s+e\s+P\.\s+Iva\s*:\s*IT\s*04188260139/gi;
const simpleHeaderRegex = /Floremoria\s+s\.r\.l\.\s+Sede\s+centrale:\s*[\r\n]*\s*Via\s+Bellinzona,?\s*[\r\n]*\s*82\/B\s*-\s*22100\s+Como\s*(?:\\\||\|)?\s*www\.floremoria\.com\s*/gi;
const contactDetailsRegex = /assistenza@floremoria\.com\s*(?:\\\||\|)?\s*\+39\s*3204105305\s*(?:\\\||\|)?\s*floremoria@pec\.it/gi;
const extraPivaRegex = /FloreMoria\s+s\.r\.l\.\s*\|\s*Via\s+Bellinzona,\s*82\/b\s*\|\s*22100\s+Como\s*\|\s*CF,\s*R\.I\.\s+e\s+P\.\s+Iva:\s*IT\s*04188260139/gi;

function cleanContent(content) {
    let cleaned = content;
    
    // 1. Rimuove le intestazioni complesse
    cleaned = cleaned.replace(headerRegex, '');
    cleaned = cleaned.replace(pivaRegex, '');
    cleaned = cleaned.replace(extraPivaRegex, '');
    cleaned = cleaned.replace(simpleHeaderRegex, '');
    cleaned = cleaned.replace(contactDetailsRegex, '');
    
    // 2. Rimuove i form feed residui
    cleaned = cleaned.replace(/[\f\u000c]/g, '');
    
    // 3. Risolve la sillabazione delle parole troncate (es: "comuni- cazione" o "comuni-cazione" -> "comunicazione")
    // Questa regex trova lettere seguite da un trattino, spazi opzionali, newlines opzionali e lettere, e le unisce.
    cleaned = cleaned.replace(/(\b[a-zA-ZÀ-ÿ]+)-\s*[\r\n]*\s*([a-zA-ZÀ-ÿ]+\b)/g, '$1$2');
    
    // 4. Pulisce spazi multipli e newlines eccessive (lasciando al massimo due newline di fila)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    return cleaned;
}

async function cleanAndRecompile() {
    try {
        console.log('Cleaning source agent files in agents/ directory...');
        const files = fs.readdirSync(agentsDir);
        const agentFiles = files.filter(f => f.endsWith('_master.md'));
        
        let compiledContent = [];
        compiledContent.push('# FLOREM_NET: MANUALI DELLE COMPETENZE DEGLI AGENTI AI');
        compiledContent.push('');
        compiledContent.push('## DATI AZIENDALI UFFICIALI FLOREMORIA');
        compiledContent.push('* **Ragione Sociale:** FloreMoria s.r.l.');
        compiledContent.push('* **Sede Centrale:** Via Bellinzona, 82/B - 22100 Como');
        compiledContent.push('* **Codice Fiscale / Partita IVA / Registro Imprese Como:** IT 04188260139');
        compiledContent.push('* **Sito Web Ufficiale:** https://www.floremoria.com');
        compiledContent.push('* **Email di Assistenza:** assistenza@floremoria.com');
        compiledContent.push('* **Email PEC:** floremoria@pec.it');
        compiledContent.push('* **WhatsApp di Assistenza:** +39 3204105305');
        compiledContent.push('');
        compiledContent.push('Questo documento raccoglie le istruzioni operative, i toni di voce, le regole etiche, di brand e commerciali dei singoli agenti AI di FloreMoria. Da utilizzare come base di conoscenza (Knowledge Base) per addestrare il bot di conversazione.');
        compiledContent.push('\n==================================================\n');

        for (const file of agentFiles) {
            const agentName = file.replace('_master.md', '');
            const filePath = path.join(agentsDir, file);
            console.log(`Processing & cleaning: ${file}...`);
            
            const rawContent = fs.readFileSync(filePath, 'utf-8');
            const cleaned = cleanContent(rawContent);
            
            // Sovrascrive il file sorgente pulito
            fs.writeFileSync(filePath, cleaned, 'utf-8');
            
            compiledContent.push(`## AGENTE: ${agentName}`);
            compiledContent.push('---');
            compiledContent.push(cleaned);
            compiledContent.push('\n==================================================\n');
        }

        const finalOutput = compiledContent.join('\n');
        
        // Scrive il file compilato pulito nel progetto
        fs.writeFileSync(outputProjPath, finalOutput, 'utf-8');
        console.log(`Cleaned compiled file written to: ${outputProjPath}`);
        
        // Scrive il file compilato pulito in Obsidian
        const obsidianDir = path.dirname(outputObsidianPath);
        if (!fs.existsSync(obsidianDir)) {
            fs.mkdirSync(obsidianDir, { recursive: true });
        }
        fs.writeFileSync(outputObsidianPath, finalOutput, 'utf-8');
        console.log(`Cleaned compiled file written to Obsidian: ${outputObsidianPath}`);
        
        console.log('Cleanup and Recompilation completed successfully!');
    } catch (e) {
        console.error('Error during cleanup:', e);
    }
}

cleanAndRecompile();

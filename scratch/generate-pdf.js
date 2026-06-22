const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outputProjPath = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/scratch/FLOREM_NET_FAQ_Sito_Ufficiale.pdf';
const outputObsidianPath = '/Users/floremoria/Documents/Second Brain/10_FLOREMORIA/30_RISORSE_ESTERNE/FLOREM_NET_FAQ_Sito_Ufficiale.pdf';

const faqs = [
    {
        q: "Non conosco le date esatte di nascita o di morte del mio caro.",
        a: "Non preoccuparti. Grazie alla nostra rete e alla collaborazione con i servizi cimiteriali, siamo in grado di individuare la posizione esatta del tuo caro anche senza le date precise. Ci occupiamo noi della ricerca."
    },
    {
        q: "Cosa succede se la tomba o il loculo non vengono individuati?",
        a: "Verifichiamo sempre la posizione corretta prima della consegna. Nel caso remoto in cui fosse impossibile identificare il luogo del riposo, provvederemo immediatamente al rimborso integrale del tuo ordine."
    },
    {
        q: "Come gestite i casi di omonimia nello stesso cimitero?",
        a: "Se riscontriamo più persone con lo stesso nome e cognome, ti contatteremo prontamente con una lista dettagliata per identificare insieme la persona corretta prima di procedere."
    },
    {
        q: "Da dove provengono i fiori e come garantite la freschezza?",
        a: "Selezioniamo i migliori fioristi locali situati nelle immediate vicinanze del cimitero. Questo ci permette di consegnare a piedi, riducendo lo stress per i fiori e garantendo la massima freschezza appena usciti dal laboratorio."
    },
    {
        q: "Cosa succede in caso di problemi con la composizione scelta?",
        a: "La tua soddisfazione è la nostra missione. Se per qualsiasi motivo i fiori consegnati non rispecchiassero lo standard di qualità o la tipologia scelta, procederemo al rimborso totale dell'ordine senza esitazioni."
    },
    {
        q: "Come riceverò la conferma dell'avvenuta consegna?",
        a: "La nostra piattaforma ti invierà in tempo reale la testimonianza fotografica del tuo omaggio floreale direttamente su WhatsApp, non appena deposto sulla tomba o nel luogo della cerimonia."
    },
    {
        q: "Posso personalizzare il nastro o il biglietto?",
        a: "Sì, assolutamente. Ogni prodotto dispone di uno spazio dedicato in fase di checkout per scrivere il tuo messaggio personalizzato o richiedere un nastro commemorativo stampato."
    },
    {
        q: "Posso consegnare in chiesa o durante il funerale?",
        a: "Sì, offriamo un servizio dedicato e coordiniamo la consegna direttamente con i responsabili o con gli orari delle cerimonie per garantire la presenza puntuale dei fiori."
    },
    {
        q: "Cosa scrivo sul biglietto se non trovo le parole?",
        a: "Sappiamo quanto sia difficile esprimersi in questi momenti. Per supportarti, offriamo dei suggerimenti di testo delicati e appropriati durante il checkout."
    },
    {
        q: "Quali sono i metodi di pagamento accettati?",
        a: "Accettiamo tutte le principali Carte di Credito, di Debito e PayPal per offrirti sistemi di pagamento crittografati e protetti al 100%."
    },
    {
        q: "I fiori scelti sono stagionali?",
        a: "Le composizioni e i bouquet sono creati dai fioristi locali e utilizzano fiori freschissimi. Garantiamo sempre la migliore scelta disponibile di stagione nel rispetto della gamma cromatica e dello stile scelto."
    },
    {
        q: "Offrite abbonamenti per la cura costante?",
        a: "Sì, non sarai lasciato solo dopo la prima consegna. Attraverso il nostro 'Calendario della Memoria', offriamo promemoria per le ricorrenze e la possibilità di rinnovare i tuoi omaggi con facilità."
    }
];

const htmlContent = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>FAQ Ufficiali FloreMoria</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
        @page {
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
        }
        body {
            font-family: 'Inter', sans-serif;
            color: #2C2C2C;
            background-color: #FDFDFB;
            margin: 0;
            padding: 0;
            line-height: 1.6;
            -webkit-print-color-adjust: exact;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            border-bottom: 1px solid #EAE6DF;
            padding-bottom: 25px;
            margin-bottom: 35px;
        }
        .brand-logo {
            font-family: 'Playfair Display', serif;
            font-size: 28px;
            font-weight: 600;
            color: #1A1A1A;
            letter-spacing: 2px;
            margin-bottom: 5px;
        }
        .brand-sub {
            font-family: 'Inter', sans-serif;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 3px;
            color: #B89C72;
            margin-bottom: 15px;
        }
        h1 {
            font-family: 'Playfair Display', serif;
            font-size: 24px;
            font-weight: 500;
            color: #1A1A1A;
            margin: 0;
        }
        .description {
            font-size: 13px;
            color: #6E6E6E;
            font-style: italic;
            margin-top: 5px;
        }
        .faq-list {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .faq-item {
            page-break-inside: avoid;
            background-color: #FAF9F6;
            border-left: 3px solid #B89C72;
            padding: 15px 20px;
            border-radius: 4px;
        }
        .faq-question {
            font-family: 'Playfair Display', serif;
            font-size: 16px;
            font-weight: 600;
            color: #1A1A1A;
            margin: 0 0 8px 0;
        }
        .faq-answer {
            font-size: 14px;
            color: #4A4A4A;
            margin: 0;
            font-weight: 300;
            text-align: justify;
        }
        .footer {
            margin-top: 40px;
            border-top: 1px solid #EAE6DF;
            padding-top: 15px;
            text-align: center;
            font-size: 11px;
            color: #8E8E8E;
            page-break-inside: avoid;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="brand-logo">FloreMoria</div>
            <div class="brand-sub">Consegna Fiori Cimiteriali</div>
            <h1>DOMANDE FREQUENTI (FAQ)</h1>
            <div class="description">Documento ufficiale delle FAQ utilizzate sul sito web per la bacheca di Futuria CRM.</div>
        </div>
        
        <div class="faq-list">
            ${faqs.map((faq, i) => `
                <div class="faq-item">
                    <div class="faq-question">${i + 1}. ${faq.q}</div>
                    <div class="faq-answer">${faq.a}</div>
                </div>
            `).join('\n')}
        </div>
        
        <div class="footer">
            FloreMoria s.r.l. — Via Bellinzona, 82/B - 22100 Como — P.IVA: IT 04188260139 — www.floremoria.com
        </div>
    </div>
</body>
</html>
`;

async function generatePdf() {
    try {
        const tempHtmlPath = path.join(__dirname, 'temp_faq.html');
        fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');
        console.log('Temporary HTML file generated.');

        console.log('Launching Playwright headless browser...');
        const browser = await chromium.launch();
        const page = await browser.newPage();
        
        console.log('Loading HTML content...');
        await page.goto(`file://${tempHtmlPath}`);
        await page.waitForLoadState('networkidle');

        // Genera il PDF
        console.log('Generating A4 PDF...');
        await page.pdf({
            path: outputProjPath,
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20mm',
                bottom: '20mm',
                left: '15mm',
                right: '15mm'
            }
        });
        console.log(`PDF successfully saved to project scratch: ${outputProjPath}`);

        // Copia in Obsidian
        const obsidianDir = path.dirname(outputObsidianPath);
        if (!fs.existsSync(obsidianDir)) {
            fs.mkdirSync(obsidianDir, { recursive: true });
        }
        fs.copyFileSync(outputProjPath, outputObsidianPath);
        console.log(`PDF successfully copied to Obsidian: ${outputObsidianPath}`);

        await browser.close();
        
        // Elimina HTML temporaneo
        fs.unlinkSync(tempHtmlPath);
        console.log('Cleaned up temporary HTML file.');
        console.log('PDF Generation completed successfully!');
    } catch (e) {
        console.error('Error generating PDF:', e);
    }
}

generatePdf();

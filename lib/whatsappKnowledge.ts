import fs from 'node:fs';
import path from 'node:path';

type CoreKb = {
    supportEmail: string;
    supportWhatsapp: string;
    supportHours: string;
    siteUrl: string;
    catalogTombsUrl: string;
    funeralUrl: string;
    petsUrl: string;
};

let kbCache: CoreKb | null = null;

function extractLineValue(content: string, label: string, fallback: string): string {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`^-\\s*${escaped}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim() || fallback;
}

export function loadWhatsAppCoreKb(): CoreKb {
    if (kbCache) return kbCache;

    const kbPath = path.join(process.cwd(), 'docs', 'whatsapp', 'knowledge_base_whatsapp_core.txt');
    let content = '';
    try {
        content = fs.readFileSync(kbPath, 'utf-8');
    } catch {
        kbCache = {
            supportEmail: 'assistenza@floremoria.com',
            supportWhatsapp: '+39 3204105305',
            supportHours: '08:00-22:00',
            siteUrl: 'https://www.floremoria.com',
            catalogTombsUrl: 'https://www.floremoria.com/fiori-sulle-tombe',
            funeralUrl: 'https://www.floremoria.com/per-il-funerale',
            petsUrl: 'https://www.floremoria.com/per-animali-domestici',
        };
        return kbCache;
    }

    kbCache = {
        supportEmail: extractLineValue(content, 'Email assistenza', 'assistenza@floremoria.com'),
        supportWhatsapp: extractLineValue(content, 'WhatsApp assistenza', '+39 3204105305'),
        supportHours: extractLineValue(content, 'Orario assistenza', '08:00-22:00'),
        siteUrl: extractLineValue(content, 'Home', 'https://www.floremoria.com'),
        catalogTombsUrl: extractLineValue(content, 'Fiori sulle tombe', 'https://www.floremoria.com/fiori-sulle-tombe'),
        funeralUrl: extractLineValue(content, 'Fiori per il funerale', 'https://www.floremoria.com/per-il-funerale'),
        petsUrl: extractLineValue(content, 'Piccoli amici', 'https://www.floremoria.com/per-animali-domestici'),
    };
    return kbCache;
}

export function buildWhatsAppAiReply(params: {
    message: string;
    userName: string;
    userType: 'CLIENT' | 'FLORIST' | 'UNKNOWN';
    mediaUrl?: string | null;
}): string {
    const { message, userName, userType, mediaUrl } = params;
    const kb = loadWhatsAppCoreKb();
    const m = message.toLowerCase();

    if (userType === 'FLORIST') {
        if (mediaUrl) {
            return `Grazie, foto ricevuta correttamente. La sto registrando nel flusso consegna FloreMoria. Se puoi, indica anche il numero ordine nel formato FT-XX-YY-001 per associare la prova in modo preciso.`;
        }
        return `Ciao ${userName}, per favore inviami la foto della posa e il numero ordine (es. FT-XX-YY-001). Appena arriva, la registriamo subito in dashboard.`;
    }

    if (m.includes('prezzo') || m.includes('costo') || m.includes('quanto')) {
        return `Ti aiuto subito. Per fiori sulle tombe partiamo da EUR 29.99. Puoi vedere il catalogo qui: ${kb.catalogTombsUrl}`;
    }

    if (m.includes('ordine') || m.includes('stato') || m.includes('consegna')) {
        return `Ti aggiorniamo volentieri sullo stato ordine. Le consegne vengono gestite con fioristi partner locali e, a esecuzione completata, ricevi la foto di conferma su WhatsApp.`;
    }

    if (m.includes('foto') || m.includes('prova')) {
        return `Sì, inviamo la foto di conferma consegna su WhatsApp. Se manca una foto attesa, la verifichiamo subito con priorita alta.`;
    }

    if (m.includes('funerale')) {
        return `Per i servizi funerale trovi tutto qui: ${kb.funeralUrl}`;
    }

    if (m.includes('animali') || m.includes('piccoli amici')) {
        return `Per i piccoli amici puoi vedere il catalogo qui: ${kb.petsUrl}`;
    }

    if (m.includes('abbonamento') || m.includes('ricorrente')) {
        return `Possiamo attivare una consegna ricorrente mensile, con foto a ogni consegna. Se vuoi, ti guido io passo passo.`;
    }

    return `Gentile ${userName}, sono VERA, assistente FloreMoria. Posso aiutarti con ordini, consegne, foto e catalogo. Se desideri un operatore umano, scrivi UMANO. Assistenza ${kb.supportHours}.`;
}

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function getWebpImages(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) return [];
    try {
        const files = fs.readdirSync(dirPath);
        return files
            .filter(f => f.toLowerCase().endsWith('.webp'))
            .map(f => path.join(dirPath, f));
    } catch {
        return [];
    }
}

function getCleanWords(str: string): string[] {
    let normalized = str.toLowerCase();
    if (normalized.includes('messaggio')) normalized += ' biglietto';
    if (normalized.includes('biglietto')) normalized += ' messaggio';
    if (normalized.includes('rose')) normalized += ' di rose';
    if (normalized.includes('ceri')) normalized += ' candele';
    if (normalized.includes('candele')) normalized += ' ceri';

    return normalized
              .replace(/[^a-z0-9\s]/g, ' ')
              .split(/\s+/)
              .filter(w => w && w !== 'di' && w !== 'per' && w !== 'e' && w !== 'da' && w !== 'della' && w !== 'del' && w !== 'la' && w !== 'in' && w !== 'vaso' && w !== 'pianta' && w !== 'bouquet' && w !== 'piccoli' && w !== 'amici');
}

function escapeCsv(val: string): string {
    if (val === null || val === undefined) return '""';
    const clean = val.toString().replace(/"/g, '""');
    return `"${clean}"`;
}

// Custom curated SEO-optimized premium descriptions (used if database field is empty or short)
const seoDescriptions: Record<string, string> = {
    // Fiori sulle Tombe
    'bouquet-di-rose': 'Pregiato bouquet di rose fresche selezionate con cura, confezionato a mano dai nostri fioristi partner e posato con rispetto sulla tomba del tuo caro. Foto prova inclusa.',
    'omaggio-speciale': 'Delicata composizione di fiori misti freschi di stagione, ideale per far sentire la propria presenza ed omaggiare con grazia e colore la memoria del caro estinto.',
    'tributo-eterno': 'Tributo floreale di grande prestigio ed eleganza realizzato con fiori nobili selezionati. Consegna professionale al cimitero e posa sul loculo o tomba monumentale.',
    'ricordo-affettuoso': 'Un bouquet classico e composto nei toni tenui per esprimere affetto e vicinanza spirituale. Fiori freschi di prima scelta con consegna garantita al cimitero.',
    'lumino': 'Tradizionale lumino votivo per tomba o loculo, simbolo di memoria costante. Servizio professionale di posa, accensione al cimitero e invio foto dello stato di fatto.',
    'messaggio': 'Dedica commemorativa personalizzata trascritta a mano su cartoncino pregiato abbinato all\'omaggio floreale, posata con cura per esprimere i tuoi sentimenti più profondi.',
    'foto-stato-di-fatto-prima-della-consegna': 'Servizio fotografico esclusivo dello stato attuale della tomba o loculo prima della posa dei fiori, per darti la massima trasparenza e tranquillità sulla cura.',

    // Fiori per Funerali
    'bouquet-cordoglio-sincero': 'Elegante mazzo di fiori freschi nei toni candidi del lutto, ideale per esprimere sincere condoglianze alla famiglia durante il rito delle esequie in chiesa o cappella.',
    'bouquet-rispetto-vicinanza': 'Composizione floreale composta ed espressiva progettata per porgere le condoglianze ed esprimere vicinanza. Realizzata a mano con fiori freschi di prima scelta.',
    'kalonche': 'Resistente pianta fiorita di Kalanchoe confezionata con cura, ideale per una presenza duratura sul loculo o in cappella per onorare il ricordo del caro defunto.',
    'set-ceri-candele': 'Set completo di ceri e candele votive professionali per cappella o tomba, ideali per la commemorazione speciale dei defunti durante le ricorrenze più solenni.',
    'nastro-commemorativo': 'Accessorio commemorativo in nastro di raso con dedica personalizzata in lettere oro, perfetto per decorare corone, cuscini o bouquet funebri con parole di affetto.',
    'margherite-gerbere-pianta-in-vaso': 'Composizione in vaso di margherite e gerbere fresche dai toni sereni, ideale come omaggio durevole e fiorito per il cimitero o la chiesa.',
    'cuore-corona': 'Imponente corona o composizione a forma di cuore realizzata con fiori freschi pregiati, massima espressione di amore, dolore e memoria eterna per la cerimonia funebre.',
    'copribara': 'Solenne composizione floreale copribara progettata su misura con fiori freschi di qualità superiore, per decorare con dignità e grazia il feretro del caro estinto.',
    'piramide': 'Composizione floreale a sviluppo piramidale di grande impatto visivo, adatta all\'altare in chiesa, alla camera ardente o alla posa monumentale in cappella.',
    'cuscino': 'Classico cuscino funebre realizzato con una fitta trama di fiori freschi scelti, simbolo di riposo sereno ed eterno, ideale per la cerimonia di commiato.',
    'bouquet-memoria-eterna': 'Bouquet funebre di eccezionale pregio artistico, realizzato con fiori nobili dai toni solenni per onorare per sempre una memoria preziosa e indimenticabile.',
    'bouquet-omaggio-solenne': 'Mazzo di fiori freschi funebri dai colori eleganti ed equilibrati, per testimoniare solennemente la propria partecipazione al cordoglio della famiglia.',

    // Piccoli Amici
    'messaggio-piccoli-amici': 'Biglietto di condoglianze e dedica personalizzata scritto a mano con grafiche delicate a tema impronte, per accompagnare il fiore dedicato al tuo piccolo amico fedele.',
    'lumino-piccoli-amici': 'Lumino rosso o bianco con grafiche dedicate agli animali domestici, posato e acceso sulla tomba o nel giardino del ponte per tenere sempre accesa la sua luce.',
    'nastro-piccoli-amici': 'Elegante nastro commemorativo in raso con dedica stampata in lettere oro, per personalizzare le piante o i mazzi dedicati al ricordo del tuo cane o gatto.',
    'set-ceri-piccoli-amici': 'Set speciale di candele e ceri dedicati al ricordo dei piccoli amici animali, per creare un angolo di luce e preghiera dedicato a chi ha riempito d\'amore la tua vita.',
    'un-raggio-di-sole': 'Mazzo fiorito luminoso a base di girasoli e fiori freschi dai toni caldi, simbolo di gioia e calore rimasti nel cuore dopo la scomparsa del fedele animale domestico.',
    'abbraccio-verde': 'Vaso di piante verdi resistenti e selezionate per esterno, simbolo di vita continua, pensato per adornare con grazia e naturalezza la tomba del tuo piccolo compagno.',
    'legame-eterno': 'Elegante bouquet di rose fresche e fiori primaverili confezionato a mano, per testimoniare il legame indissolubile d\'amore che ti unirà per sempre al tuo fedele amico.',
    'battito-di-foglia': 'Composizione naturale e fiorita con piante perenni adatta a tutte le stagioni, pensata per portare un tocco di natura spontanea sulla lapide del tuo piccolo compagno.',
    'il-giardino-del-ponte': 'Meravigliosa e imponente composizione fiorita nei toni dell\'arcobaleno, simbolo del passaggio sereno del tuo animale verso il giardino del ponte.',
    'anima-pura': 'Composizione floreale candida e pura realizzata interamente con fiori bianchi freschi, per ricordare con infinita dolcezza la purezza d\'animo del tuo cane o gatto.'
};

async function run() {
    const products = await prisma.product.findMany({
        where: { deletedAt: null },
        include: { category: true },
        orderBy: [
            { category: { name: 'asc' } },
            { sortOrder: 'asc' }
        ]
    });

    const publicDir = '/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/public';
    const productsBaseDir = path.join(publicDir, 'images/products');
    const domain = 'https://www.floremoria.com';

    const categoryDirs: Record<string, string> = {
        'Cimitero': 'fiori-sulle-tombe',
        'Fiori sulle Tombe': 'fiori-sulle-tombe',
        'Funerale': 'Fiori-per-Funerale',
        'Fiori per Funerali': 'Fiori-per-Funerale',
        'Piccoli Amici': 'Fiori-per-Piccoli-Amici'
    };

    // Google web page landing path mapping
    const landingPaths: Record<string, string> = {
        'Cimitero': '/fiori-sulle-tombe',
        'Fiori sulle Tombe': '/fiori-sulle-tombe',
        'Funerale': '/per-il-funerale',
        'Fiori per Funerali': '/per-il-funerale',
        'Piccoli Amici': '/per-animali-domestici'
    };

    // CSV Header row
    let csvLines = ['id,title,description,link,image_link,price,availability,condition'];

    for (const p of products) {
        const catDir = categoryDirs[p.category.name] || '';
        let matchedImages: string[] = [];

        if (catDir) {
            const catPath = path.join(productsBaseDir, catDir);
            if (fs.existsSync(catPath)) {
                const folders = fs.readdirSync(catPath);
                
                let bestFolder = '';
                let bestScore = -1;

                for (const f of folders) {
                    if (f.startsWith('.')) continue;
                    
                    const cleanFolder = getCleanWords(f);
                    const cleanProduct = getCleanWords(p.name);
                    
                    const intersection = cleanProduct.filter(w => cleanFolder.includes(w));
                    const score = intersection.length;

                    if (score > bestScore) {
                        bestScore = score;
                        bestFolder = f;
                    }
                }

                if (bestScore > 0 && bestFolder) {
                    matchedImages = getWebpImages(path.join(catPath, bestFolder));
                } else {
                    const fallbackFolder = folders.find(f => {
                        if (f.startsWith('.')) return false;
                        return f.toLowerCase().includes(p.slug.toLowerCase()) || 
                               p.slug.toLowerCase().includes(f.toLowerCase().replace(/:/g, '-'));
                    });

                    if (fallbackFolder) {
                        matchedImages = getWebpImages(path.join(catPath, fallbackFolder));
                    }
                }
            }
        }

        // Build absolute image link
        let imgUrl = `${domain}/Watermark.webp`; // Elegant default fallback
        if (matchedImages.length > 0) {
            imgUrl = `${domain}/${path.relative(publicDir, matchedImages[0])}`;
        }

        // Build absolute product dynamic page landing link
        const baseRoute = landingPaths[p.category.name] || '/fiori-sulle-tombe';
        const landingUrl = `${domain}${baseRoute}/${p.slug}`;

        // Category code prefix
        const catCodePrefix = p.category.name === 'Cimitero' || p.category.name === 'Fiori sulle Tombe' 
            ? 'ft' 
            : (p.category.name === 'Funerale' || p.category.name === 'Fiori per Funerali' ? 'ff' : 'pa');
        
        const feedId = `${catCodePrefix}-${p.slug}`;

        // Get curated SEO description or fallback to DB description/name
        const descriptionText = seoDescriptions[p.slug] || p.description || p.shortDescription || `${p.name} - Omaggio floreale premium di altissima qualità firmato FloreMoria. Consegna garantita a domicilio o al cimitero.`;

        // Format price (ex: 29.99 EUR)
        const priceText = `${(p.basePriceCents / 100).toFixed(2)} EUR`;

        // Compose row
        const row = [
            escapeCsv(feedId),
            escapeCsv(p.name),
            escapeCsv(descriptionText),
            escapeCsv(landingUrl),
            escapeCsv(imgUrl),
            escapeCsv(priceText),
            escapeCsv('in_stock'),
            escapeCsv('new')
        ];

        csvLines.push(row.join(','));
    }

    // Write file to project root
    fs.writeFileSync('/Users/floremoria/Downloads/Floremoria_dot_com/floremoria/GOOGLE_MERCHANT_FEED.csv', csvLines.join('\n'));
    console.log('FEED_GENERATED_SUCCESSFULLY');
}

run().finally(() => prisma.$disconnect());

/**
 * DRY-RUN ONLY — import storico ordini floremoria.eu 2026 non ancora su .com.
 * Nessuna scrittura DB / ledger / notifiche.
 *
 * Uso: npx tsx scripts/dry-run-import-eu-orders-2026.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

import prisma from '@/lib/prisma';

type Line = { qty: number; name: string; lineTotalEuro: number };
type EuOrder = {
    dateIso: string; // YYYY-MM-DD
    totalEuro: number;
    customerName: string;
    email: string;
    phone: string;
    products: Line[];
    deceased?: string;
    alreadyOnCom: boolean;
};

/** Elenco titolare: fino a Rosetta 16/06 = da importare; dal 02/07 = già su .com. */
const EU_ORDERS_2026: EuOrder[] = [
    {
        dateIso: '2026-01-16',
        totalEuro: 39.99,
        customerName: 'Giulia Grappone',
        email: 'giulia-grappone@hotmail.it',
        phone: '3450218710',
        products: [{ qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 39.99 }],
        deceased: 'Mario Grappone',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-01-20',
        totalEuro: 39.99,
        customerName: '',
        email: 'amministrazione@neosgroup.pn.it',
        phone: '0434923236',
        products: [{ qty: 1, name: 'Bouquet Vicinanza', lineTotalEuro: 39.99 }],
        deceased: 'Lanfranco Sartor',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-01-21',
        totalEuro: 29.99,
        customerName: 'Luciano Mammì',
        email: 'lucmammi@gmail.com',
        phone: '3714218889',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Ermelinda Mammì',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-01-22',
        totalEuro: 40.97,
        customerName: 'Rosetta Paladino',
        email: 'rosellinapaladino@hotmail.it',
        phone: '3208487232',
        products: [
            { qty: 1, name: 'Bouquet Di Rose', lineTotalEuro: 34.99 },
            { qty: 1, name: 'Biglietto del Ricordo', lineTotalEuro: 2.49 },
            { qty: 1, name: 'Lumino Commemorativo', lineTotalEuro: 3.49 },
        ],
        deceased: 'Teresa Tropea',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-01-22',
        totalEuro: 29.99,
        customerName: 'Luciano Mammì',
        email: 'lucmammi@gmail.com',
        phone: '3714218889',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Salvatore Tusa',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-02-10',
        totalEuro: 39.99,
        customerName: 'Ester Irace',
        email: 'ester.irace@hotmail.it',
        phone: '3498314502',
        products: [{ qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 39.99 }],
        deceased: 'Rita Gatto',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-02-16',
        totalEuro: 29.99,
        customerName: "LUCIANO MAMMI'",
        email: 'luciano.mammi.57@gmail.com',
        phone: '3714218889',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'SALVATORE TUSA',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-02-19',
        totalEuro: 39.99,
        customerName: 'Luigina Dereani',
        email: 'ldereani@yahoo.it',
        phone: '3492103282',
        products: [{ qty: 1, name: 'Bouquet Vicinanza', lineTotalEuro: 39.99 }],
        deceased: 'Leonildo Cattaruzza',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-02-22',
        totalEuro: 29.99,
        customerName: "LUCIANO MAMMI'",
        email: 'luciano.mammi.57@gmail.com',
        phone: '3714218889',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Ermelinda Mammì',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-02-25',
        totalEuro: 29.99,
        customerName: 'Moreno Venturino',
        email: 'morenoventurino@libero.it',
        phone: '3312258877',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Annalisa Piras',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-02-26',
        totalEuro: 39.99,
        customerName: 'Norm Marchi',
        email: 'norm.marchi@shaw.ca',
        phone: '250-231-0793',
        products: [
            {
                qty: 1,
                name: 'Margherite/Gerbere – Vaso fiorito per il ricordo',
                lineTotalEuro: 39.99,
            },
        ],
        deceased: 'Evelina Fabbro',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-01',
        totalEuro: 144.98,
        customerName: 'Mimma Congedo',
        email: 'mimma.congedo@gmail.com',
        phone: '3394846648',
        products: [
            { qty: 1, name: 'Cuscino', lineTotalEuro: 129.99 },
            { qty: 1, name: 'Nastro Commemorativo', lineTotalEuro: 14.99 },
        ],
        deceased: 'Lidia Bogde',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-13',
        totalEuro: 49.99,
        customerName: 'Maria Puliafico',
        email: 'mariapuliafico@hotmail.it',
        phone: '3204910428',
        products: [{ qty: 1, name: 'Bouquet Tributo Eterno', lineTotalEuro: 49.99 }],
        deceased: 'Carmelo Puliafico',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-14',
        totalEuro: 69.98,
        customerName: 'Rosetta Paladino',
        email: 'rosellinapaladino@hotmail.it',
        phone: '3208487232',
        products: [
            { qty: 1, name: 'Bouquet Di Rose', lineTotalEuro: 34.99 },
            { qty: 1, name: 'Bouquet Di Rose', lineTotalEuro: 34.99 },
        ],
        deceased: 'Nicola Piraino / Antonia Brando',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-14',
        totalEuro: 72.48,
        customerName: 'Chiara Durì',
        email: 'chiara@asaemea.it',
        phone: '3481321645',
        products: [
            { qty: 1, name: 'Biglietto del Ricordo', lineTotalEuro: 2.49 },
            { qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 69.99 },
        ],
        deceased: 'Sergio Salamon',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-18',
        totalEuro: 39.99,
        customerName: "L'alternativa srl",
        email: 'info@alternativasrl.it',
        phone: '3473899925',
        products: [{ qty: 1, name: 'Bouquet Vicinanza', lineTotalEuro: 39.99 }],
        deceased: 'Maurizio Visintin',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-19',
        totalEuro: 34.99,
        customerName: 'Silvia Tregnaghi',
        email: 'silviatregnaghi.it@gmail.com',
        phone: '3283912589',
        products: [{ qty: 1, name: 'Bouquet Di Rose', lineTotalEuro: 34.99 }],
        deceased: 'Santina Stevanin ved. Barbirato',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-22',
        totalEuro: 29.99,
        customerName: "LUCIANO MAMMI'",
        email: 'luciano.mammi.57@gmail.com',
        phone: '3714218889',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Salvatore Tusa',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-24',
        totalEuro: 29.99,
        customerName: "LUCIANO MAMMI'",
        email: 'luciano.mammi.57@gmail.com',
        phone: '3714218889',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: "ERMELINDA MAMMI'",
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-29',
        totalEuro: 29.99,
        customerName: 'Agostino Buttignol',
        email: 'fredbuttignol@gmail.com',
        phone: '61 402826475',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Tea Buttignol',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-03-31',
        totalEuro: 144.98,
        customerName: 'FRANCESCO REDIVO',
        email: 'FRANZ1185@HOTMAIL.COM',
        phone: '3332275015',
        products: [
            { qty: 1, name: 'Cuscino', lineTotalEuro: 129.99 },
            { qty: 1, name: 'Nastro Commemorativo', lineTotalEuro: 14.99 },
        ],
        deceased: 'Rosetta Cavalsi',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-04-01',
        totalEuro: 29.99,
        customerName: 'Cristiano Mariani',
        email: 'crismariani@gmail.com',
        phone: '+34695727454',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Donata Mariani',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-04-16',
        totalEuro: 29.99,
        customerName: 'Rosaria Di Pasquale',
        email: 'rosaria.dipasquale@gmail.com',
        phone: '3389262922',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Maria Panico',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-04-20',
        totalEuro: 39.99,
        customerName: 'Elena Lombardi',
        email: 'elena_lo@libero.it',
        phone: '3391992294',
        products: [{ qty: 1, name: 'Bouquet Vicinanza', lineTotalEuro: 39.99 }],
        deceased: 'Giuliana Santoni in Vielmini',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-04-20',
        totalEuro: 59.98,
        customerName: "LUCIANO MAMMI'",
        email: 'luciano.mammi.57@gmail.com',
        phone: '3714218889',
        products: [
            { qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 },
            { qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 },
        ],
        deceased: "ERMELINDA MAMMI' / SALVATORE TUSA",
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-04-27',
        totalEuro: 39.99,
        customerName: 'Famiglia Deotti-Buzzi',
        email: 'valentino.deotti@gmail.com',
        phone: '3713458049',
        products: [
            {
                qty: 1,
                name: 'Margherite/Gerbere – Vaso fiorito per il ricordo',
                lineTotalEuro: 39.99,
            },
        ],
        deceased: 'Severino Di Marco',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-04-28',
        totalEuro: 54.98,
        customerName: 'Silvia Tregnaghi',
        email: 'silviatregnaghi.it@gmail.com',
        phone: '3283912589',
        products: [
            { qty: 1, name: 'Nastro Commemorativo', lineTotalEuro: 14.99 },
            { qty: 1, name: 'Bouquet Vicinanza', lineTotalEuro: 39.99 },
        ],
        deceased: 'Lucia Pasquina Guerra',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-04-29',
        totalEuro: 45.97,
        customerName: 'Rosetta Paladino',
        email: 'rosellinapaladino@hotmail.it',
        phone: '3208487232',
        products: [
            { qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 39.99 },
            { qty: 1, name: 'Biglietto del Ricordo', lineTotalEuro: 2.49 },
            { qty: 1, name: 'Lumino Commemorativo', lineTotalEuro: 3.49 },
        ],
        deceased: 'Teresa Tropea',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-05-03',
        totalEuro: 284.9,
        customerName: 'Isabella Cesaroni',
        email: 'isa.cesaroni@gmail.com',
        phone: '+4915775944828',
        // Carnet €299,90 − sconto €15,00 = incassato €284,90. Già a libro: NON importare.
        products: [{ qty: 1, name: 'Carnet Ricordo Affettuoso', lineTotalEuro: 299.9 }],
        deceased: '',
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-05-03',
        totalEuro: 53.48,
        customerName: 'Maria ANTONIA Pozzi',
        email: 'mariaantoniapozzi@virgilio.it',
        phone: '331 8607910',
        products: [
            { qty: 1, name: 'Lumino Commemorativo', lineTotalEuro: 3.49 },
            { qty: 1, name: 'Bouquet Tributo Eterno', lineTotalEuro: 49.99 },
        ],
        deceased: 'PETRUCCI DANIELE',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-05-16',
        totalEuro: 49.99,
        customerName: 'Maria Puliafico',
        email: 'mariapuliafico@hotmail.it',
        phone: '3204910428',
        products: [{ qty: 1, name: 'Bouquet Tributo Eterno', lineTotalEuro: 49.99 }],
        deceased: 'Carmelo Puliafico',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-05-25',
        totalEuro: 84.98,
        customerName: 'Petra Manakova',
        email: 'petramanakova@gmail.com',
        phone: '3336579533',
        products: [
            { qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 69.99 },
            { qty: 1, name: 'Nastro Commemorativo', lineTotalEuro: 14.99 },
        ],
        deceased: 'Fidelma Daniotti',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-06-05',
        totalEuro: 89.99,
        customerName: 'cyrille magali Maman-Sernaglia',
        email: 'cyrilmaman@hotmail.fr',
        phone: '0033616450351',
        products: [{ qty: 1, name: 'Bouquet Tributo Eterno', lineTotalEuro: 89.99 }],
        deceased: 'Renato Bettin',
        alreadyOnCom: false,
    },
    {
        dateIso: '2026-06-16',
        totalEuro: 49.46,
        customerName: 'Rosetta Paladino',
        email: 'rosellinapaladino@hotmail.it',
        phone: '3208487232',
        products: [
            { qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 39.99 },
            { qty: 2, name: 'Lumino Commemorativo', lineTotalEuro: 6.98 },
            { qty: 1, name: 'Biglietto del Ricordo', lineTotalEuro: 2.49 },
        ],
        deceased: 'Teresa Tropea',
        alreadyOnCom: false,
    },
    // —— già riportati su .com (non importare) ——
    {
        dateIso: '2026-07-02',
        totalEuro: 104.98,
        customerName: 'Nicolato Francesco',
        email: 'pavnico@yahoo.it',
        phone: '3406885628',
        products: [
            { qty: 1, name: 'Bouquet Tributo Eterno', lineTotalEuro: 89.99 },
            { qty: 1, name: 'Nastro Commemorativo', lineTotalEuro: 14.99 },
        ],
        deceased: 'Maria Stecca',
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-07-03',
        totalEuro: 69.99,
        customerName: '',
        email: 'DIREZIONE@CONFARTIGIANATO.PORDENONE.IT',
        phone: '328 47407420',
        products: [{ qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 69.99 }],
        deceased: 'Lucia Rossi',
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-07-09',
        totalEuro: 39.99,
        customerName: 'Giulio Rosace',
        email: 'GIULIOROSACE@GMAIL.COM',
        phone: '3921041814',
        products: [{ qty: 1, name: 'Bouquet Vicinanza', lineTotalEuro: 39.99 }],
        deceased: 'Guido Tomasi',
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-07-16',
        totalEuro: 37.99,
        customerName: 'Filomena Maiorano',
        email: 'menamaiorano68@gmail.com',
        phone: '3297790989',
        products: [
            {
                qty: 1,
                name: 'Kalonche (Kalanchoe) – Pianta fiorita per il ricordo',
                lineTotalEuro: 37.99,
            },
        ],
        deceased: 'Claudio Spadotto',
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-08-01',
        totalEuro: 29.99,
        customerName: 'valentina cecchini',
        email: 'valentina.cecchini@libero.it',
        phone: '3478419867',
        products: [{ qty: 1, name: 'Bouquet Ricordo Affettuoso', lineTotalEuro: 29.99 }],
        deceased: 'Maria Pullano',
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-08-06',
        totalEuro: 39.99,
        customerName: 'Daniela Barilari',
        email: 'superdalldan@gmail.com',
        phone: '3335218681',
        products: [{ qty: 1, name: 'Bouquet Vicinanza', lineTotalEuro: 39.99 }],
        deceased: "Antonietta D'Ambrosio",
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-08-10',
        totalEuro: 69.99,
        customerName: 'Edy, Lori and Dana Moras',
        email: 'gillabunny@yahoo.com',
        phone: '519-919-0712',
        products: [{ qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 69.99 }],
        deceased: 'Antonio Moras',
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-08-17',
        totalEuro: 39.99,
        customerName: 'Amanda Favot',
        email: 'afavot@rogers.com',
        phone: '0014166626157',
        products: [
            { qty: 1, name: 'Bouquet Omaggio Speciale', lineTotalEuro: 39.99 },
        ],
        deceased: 'Sabina Favot',
        alreadyOnCom: true,
    },
    {
        dateIso: '2026-08-21',
        totalEuro: 89.99,
        customerName: 'Oreste Poverello',
        email: 'oreste.poverello@gmail.com',
        phone: '3492218937',
        products: [{ qty: 1, name: 'Bouquet Tributo Eterno', lineTotalEuro: 89.99 }],
        deceased: 'Giacomo Poverello',
        alreadyOnCom: true,
    },
];

function norm(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/['’`]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function euro(cents: number): string {
    return (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function toCents(euroVal: number): number {
    return Math.round(euroVal * 100);
}

function dayBounds(iso: string): { start: Date; end: Date } {
    const [y, m, d] = iso.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    return { start, end };
}

/** ±2 giorni calendariali UTC intorno alla data ordine. */
function windowBounds(iso: string, days = 2): { start: Date; end: Date } {
    const [y, m, d] = iso.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d - days, 0, 0, 0));
    const end = new Date(Date.UTC(y, m - 1, d + days, 23, 59, 59, 999));
    return { start, end };
}

type CatalogHit = {
    id: string;
    name: string;
    basePriceCents: number;
    vatRatePercent: number | null;
    score: 'exact' | 'fuzzy' | 'price_only';
};

/**
 * Nomi Wix/.eu → nomi catalogo .com (Quiet Luxury).
 * Omaggio Speciale / Tributo Eterno: disambiguazione per prezzo di riga.
 */
const NAME_ALIASES: { match: RegExp; resolve: (unitCents: number) => string | null }[] = [
    // Carnet prima di «Ricordo Affettuoso»: non esiste SKU carnet a catalogo
    { match: /carnet/i, resolve: () => null },
    {
        match: /omaggio\s+speciale/i,
        resolve: (c) => (c === 6999 ? 'Bouquet Omaggio Solenne' : c === 3999 ? 'Omaggio Speciale' : null),
    },
    { match: /vicinanza/i, resolve: () => 'Bouquet Rispetto e Vicinanza' },
    { match: /(?<!carnet\s)ricordo\s+affettuoso/i, resolve: () => 'Ricordo Affettuoso' },
    { match: /tributo\s+eterno/i, resolve: (c) => (c === 8999 ? 'Bouquet Memoria Eterna' : 'Tributo Eterno') },
    { match: /biglietto/i, resolve: () => 'Messaggio' },
    { match: /lumino/i, resolve: () => 'Lumino' },
    { match: /margherit|gerber/i, resolve: () => 'Margherite/Gerbere (pianta in vaso)' },
    { match: /kalonch|kalanchoe/i, resolve: () => 'Kalonche (pianta in vaso)' },
    { match: /^cuscino$/i, resolve: () => 'Cuscino' },
    { match: /nastro\s+commemorativo/i, resolve: () => 'Nastro commemorativo' },
    { match: /bouquet\s+di\s+rose/i, resolve: () => 'Bouquet di Rose' },
];

function matchProduct(
    line: Line,
    catalog: { id: string; name: string; basePriceCents: number; vatRatePercent: number | null }[]
): CatalogHit | null {
    const n = norm(line.name);
    const priceCents = toCents(line.lineTotalEuro / line.qty);

    const exact = catalog.find((p) => norm(p.name) === n);
    if (exact) {
        return { ...exact, score: 'exact' };
    }

    for (const alias of NAME_ALIASES) {
        if (alias.match.test(line.name)) {
            const target = alias.resolve(priceCents);
            if (!target) return null;
            const hit = catalog.find((p) => norm(p.name) === norm(target));
            if (hit) return { ...hit, score: 'fuzzy' };
            return null;
        }
    }

    // Carnet non ha SKU: non fare fallback fuzzy su «Ricordo Affettuoso»
    if (/carnet/i.test(line.name)) return null;

    // fuzzy: token coverage
    const tokens = n.split(' ').filter((t) => t.length > 2);
    let best: (typeof catalog)[0] | null = null;
    let bestScore = 0;
    for (const p of catalog) {
        const pn = norm(p.name);
        const hit = tokens.filter((t) => pn.includes(t)).length;
        const ratio = tokens.length ? hit / tokens.length : 0;
        if (ratio >= 0.85 && ratio > bestScore) {
            bestScore = ratio;
            best = p;
        }
    }
    if (best) return { ...best, score: 'fuzzy' };

    const byPrice = catalog.filter((p) => p.basePriceCents === priceCents);
    if (byPrice.length === 1) return { ...byPrice[0], score: 'price_only' };

    return null;
}

async function main() {
    const toImport = EU_ORDERS_2026.filter((o) => !o.alreadyOnCom);
    const alreadyListed = EU_ORDERS_2026.filter((o) => o.alreadyOnCom);

    const products = await prisma.product.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, basePriceCents: true, vatRatePercent: true, isActive: true },
    });

    // Alias comuni elenco .eu ↔ catalogo (gestiti in matchProduct / NAME_ALIASES)

    const catalogForMatch = products;

    // Product name inventory from list
    const uniqueProductNames = new Map<string, { qtyLines: number; samples: number[] }>();
    for (const o of EU_ORDERS_2026) {
        for (const line of o.products) {
            const k = line.name;
            const cur = uniqueProductNames.get(k) || { qtyLines: 0, samples: [] };
            cur.qtyLines += 1;
            cur.samples.push(toCents(line.lineTotalEuro / line.qty));
            uniqueProductNames.set(k, cur);
        }
    }

    const productReport: {
        listName: string;
        match: string;
        catalogName: string | null;
        vat: number | null | string;
        score: string;
    }[] = [];

    const missingProducts = new Set<string>();
    const noVatProducts = new Set<string>();

    for (const [listName] of uniqueProductNames) {
        const samples = uniqueProductNames.get(listName)!.samples;
        const probeLine: Line = {
            qty: 1,
            name: listName,
            lineTotalEuro: samples[0] / 100,
        };
        const hit = matchProduct(probeLine, catalogForMatch);
        // also try other sample prices (e.g. Omaggio 39.99 vs 69.99)
        const hits = new Set<string>();
        for (const s of [...new Set(samples)]) {
            const h = matchProduct(
                { qty: 1, name: listName, lineTotalEuro: s / 100 },
                catalogForMatch
            );
            if (h) hits.add(`${h.name} (IVA ${h.vatRatePercent})`);
            else missingProducts.add(`${listName} @${(s / 100).toFixed(2)}`);
        }

        if (hits.size === 0) {
            productReport.push({
                listName,
                match: 'MISSING',
                catalogName: null,
                vat: '—',
                score: 'none',
            });
        } else {
            productReport.push({
                listName,
                match: 'OK',
                catalogName: [...hits].join(' | '),
                vat: hit?.vatRatePercent ?? '—',
                score: hit?.score || 'alias',
            });
        }
    }

    // clean missing: only names with no resolution for any price
    missingProducts.clear();
    for (const [listName, meta] of uniqueProductNames) {
        const resolved = [...new Set(meta.samples)].some(
            (s) => matchProduct({ qty: 1, name: listName, lineTotalEuro: s / 100 }, catalogForMatch) != null
        );
        if (!resolved) missingProducts.add(listName);
    }

    // Gateway movements 2026 (Stripe EU preferred + all charge/payment; PayPal positive)
    const yearStart = new Date(Date.UTC(2026, 0, 1));
    const yearEnd = new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999));

    const stripeMovs = await prisma.stripeFinanceMovement.findMany({
        where: {
            createdAtStripe: { gte: yearStart, lte: yearEnd },
            type: { in: ['charge', 'payment'] },
            amountCents: { gt: 0 },
        },
        select: {
            id: true,
            stripeId: true,
            amountCents: true,
            createdAtStripe: true,
            orderId: true,
            description: true,
            metadataJson: true,
        },
    });

    // PayPal: ledger Neon (non esiste tabella PaypalFinanceMovement)
    const paypalLedger = await prisma.financialLedgerEntry.findMany({
        where: {
            reversedAt: null,
            sourceKey: { startsWith: 'PAYPAL_' },
            accountingDate: { gte: yearStart, lte: yearEnd },
            direction: 'ENTRATA',
            totalCents: { gt: 0 },
        },
        select: {
            sourceKey: true,
            orderId: true,
            accountingDate: true,
            totalCents: true,
            metadataJson: true,
            description: true,
        },
    });

    type GwHit = {
        gateway: 'Stripe' | 'PayPal';
        id: string;
        amountCents: number;
        at: Date;
        orderId: string | null;
        isEu: boolean;
    };

    const gatewayPool: GwHit[] = [
        ...stripeMovs.map((m) => ({
            gateway: 'Stripe' as const,
            id: m.stripeId,
            amountCents: m.amountCents,
            at: m.createdAtStripe,
            orderId: m.orderId,
            isEu: m.stripeId.startsWith('stripe_eu_'),
        })),
        ...paypalLedger.map((m) => {
            const meta = (m.metadataJson || {}) as Record<string, unknown>;
            const metaGross =
                typeof meta.grossCents === 'number'
                    ? meta.grossCents
                    : typeof meta.amountCents === 'number'
                      ? meta.amountCents
                      : null;
            const gross =
                metaGross != null && Number.isFinite(metaGross)
                    ? Math.round(metaGross)
                    : Math.abs(m.totalCents || 0);
            const txId =
                (typeof meta.transactionId === 'string' && meta.transactionId) ||
                m.sourceKey.replace(/^PAYPAL_/, '');
            return {
                gateway: 'PayPal' as const,
                id: txId,
                amountCents: gross,
                at: m.accountingDate,
                orderId: m.orderId,
                isEu: false,
            };
        }),
    ];

    // Existing PAID orders 2026 for duplicate check
    const existingOrders = await prisma.order.findMany({
        where: {
            deletedAt: null,
            isTest: false,
            partnerPaymentStatus: 'PAID',
            createdAt: { gte: yearStart, lte: yearEnd },
        },
        select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            totalPriceCents: true,
            buyerEmail: true,
            buyerFullName: true,
            stripeTransactionId: true,
            additionalInstructions: true,
        },
    });

    type RowResult = {
        date: string;
        email: string;
        name: string;
        totalEuro: number;
        wouldCreate: boolean;
        skipReason?: string;
        duplicateOf?: string;
        gateway?: string;
        gatewayId?: string;
        gatewayLinkedAlready?: boolean;
        productIssues: string[];
    };

    const usedGatewayIds = new Set<string>();
    const rows: RowResult[] = [];

    for (const o of toImport) {
        const totalCents = toCents(o.totalEuro);
        const email = o.email.trim().toLowerCase();
        const { start: dayStart, end: dayEnd } = dayBounds(o.dateIso);
        const { start: wStart, end: wEnd } = windowBounds(o.dateIso, 2);

        // Duplicate: stesso email (o nome), stesso giorno calendariale, stesso importo
        const dup = existingOrders.find((ex) => {
            if (ex.totalPriceCents !== totalCents) return false;
            const exDay = ex.createdAt.toISOString().slice(0, 10);
            if (exDay !== o.dateIso) {
                // allow ±0 day strict first; also check local Rome? Use UTC date from createdAt
                // also try ±1 day for timezone skew
                const t = ex.createdAt.getTime();
                if (t < dayStart.getTime() - 86400000 || t > dayEnd.getTime() + 86400000) return false;
            }
            const exEmail = (ex.buyerEmail || '').toLowerCase();
            if (email && exEmail && email === exEmail) return true;
            if (o.customerName && ex.buyerFullName) {
                if (norm(o.customerName) === norm(ex.buyerFullName) && exDay === o.dateIso) return true;
            }
            return false;
        });

        // Stricter dup: email+date+amount exact day
        const dupStrict = existingOrders.find((ex) => {
            if (ex.totalPriceCents !== totalCents) return false;
            const exEmail = (ex.buyerEmail || '').toLowerCase();
            if (!email || !exEmail || email !== exEmail) return false;
            const t = ex.createdAt.getTime();
            return t >= dayStart.getTime() - 12 * 3600000 && t <= dayEnd.getTime() + 12 * 3600000;
        });

        const duplicate = dupStrict || dup;

        // Gateway match: prefer Stripe EU, exact amount, ±2 days, unused
        let candidates = gatewayPool
            .filter((g) => g.amountCents === totalCents)
            .filter((g) => g.at >= wStart && g.at <= wEnd)
            .filter((g) => !usedGatewayIds.has(g.id))
            .sort((a, b) => {
                const score = (g: GwHit) =>
                    (g.isEu ? 100 : 0) + (g.orderId ? 0 : 50) + (g.gateway === 'Stripe' ? 10 : 0);
                return score(b) - score(a);
            });

        let nearMiss: GwHit | null = null;
        if (!candidates.length) {
            const near = gatewayPool
                .filter((g) => Math.abs(g.amountCents - totalCents) <= 10)
                .filter((g) => g.at >= wStart && g.at <= wEnd)
                .filter((g) => !usedGatewayIds.has(g.id));
            nearMiss = near[0] || null;
        }

        const gw = candidates[0] || null;
        if (gw) usedGatewayIds.add(gw.id);

        const productIssues: string[] = [];
        for (const line of o.products) {
            const resolved = matchProduct(line, catalogForMatch);
            if (!resolved) {
                productIssues.push(`MISSING:${line.name}`);
            } else if (resolved.vatRatePercent == null) {
                productIssues.push(`NO_VAT:${resolved.name}`);
                noVatProducts.add(resolved.name);
            }
        }

        // Line sum vs total
        const linesSum = Math.round(o.products.reduce((s, l) => s + l.lineTotalEuro * 100, 0));
        if (Math.abs(linesSum - totalCents) > 1) {
            productIssues.push(`LINE_SUM_MISMATCH:${linesSum}vs${totalCents}`);
        }
        if (nearMiss) {
            productIssues.push(
                `GATEWAY_NEAR:${nearMiss.gateway} ${nearMiss.id} €${(nearMiss.amountCents / 100).toFixed(2)}`
            );
        }

        let wouldCreate = true;
        let skipReason: string | undefined;
        if (duplicate) {
            wouldCreate = false;
            skipReason = 'DUPLICATE_ON_COM';
        }

        rows.push({
            date: o.dateIso,
            email: o.email,
            name: o.customerName || '(email only)',
            totalEuro: o.totalEuro,
            wouldCreate,
            skipReason,
            duplicateOf: duplicate
                ? `${duplicate.orderNumber || duplicate.id} ${duplicate.buyerEmail}`
                : undefined,
            gateway: gw ? gw.gateway + (gw.isEu ? '/EU' : '') : undefined,
            gatewayId: gw?.id,
            gatewayLinkedAlready: gw?.orderId ? true : false,
            productIssues,
        });
    }

    // Already-on-com verification
    const alreadyVerify = [];
    for (const o of alreadyListed) {
        const totalCents = toCents(o.totalEuro);
        const email = o.email.trim().toLowerCase();
        const { start: dayStart, end: dayEnd } = dayBounds(o.dateIso);
        const found = existingOrders.filter((ex) => {
            if (ex.totalPriceCents !== totalCents) return false;
            const exEmail = (ex.buyerEmail || '').toLowerCase();
            const emailOk = email && exEmail && email === exEmail;
            const nameOk =
                o.customerName &&
                ex.buyerFullName &&
                norm(o.customerName) === norm(ex.buyerFullName);
            const t = ex.createdAt.getTime();
            const dateOk =
                t >= dayStart.getTime() - 36 * 3600000 && t <= dayEnd.getTime() + 36 * 3600000;
            return dateOk && (emailOk || nameOk);
        });
        alreadyVerify.push({
            date: o.dateIso,
            email: o.email,
            totalEuro: o.totalEuro,
            foundOnCom: found.length,
            orders: found.map((f) => f.orderNumber || f.id).join(', ') || '—',
        });
    }

    const wouldCreate = rows.filter((r) => r.wouldCreate);
    const skippedDup = rows.filter((r) => !r.wouldCreate);
    const withGw = wouldCreate.filter((r) => r.gatewayId);
    const withoutGw = wouldCreate.filter((r) => !r.gatewayId);
    const sumWould = wouldCreate.reduce((s, r) => s + toCents(r.totalEuro), 0);
    const sumAllCandidates = toImport.reduce((s, o) => s + toCents(o.totalEuro), 0);

    const missingList = [...missingProducts];

    console.log('\n=== DRY-RUN import storico .eu 2026 (sola lettura) ===\n');
    console.log(`Elenco totale titolare: ${EU_ORDERS_2026.length}`);
    console.log(`  già su .com (skip): ${alreadyListed.length}`);
    console.log(`  candidati import: ${toImport.length} · somma elenco ${euro(sumAllCandidates)}`);
    console.log('');
    console.log('--- Risultato dry-run (solo candidati) ---');
    console.log(`Ordini che verrebbero creati: ${wouldCreate.length}`);
    console.log(`Importo totale creato:        ${euro(sumWould)}`);
    console.log(`Skip duplicato su .com:       ${skippedDup.length}`);
    console.log(`Con match incasso gateway:    ${withGw.length}`);
    console.log(`Senza match gateway:          ${withoutGw.length}`);
    console.log(`Prodotti elenco senza catalogo (nomi unici): ${missingList.length}`);
    if (missingList.length) {
        for (const m of missingList) console.log(`  - ${m}`);
    }
    console.log(`Prodotti catalogo matchati senza vatRatePercent: ${noVatProducts.size}`);
    if (noVatProducts.size) {
        for (const m of noVatProducts) console.log(`  - ${m}`);
    }

    console.log('\n--- Mapping prodotti (unici) ---');
    for (const p of productReport) {
        console.log(
            `  [${p.match}] "${p.listName}" → ${p.catalogName || '—'} · IVA ${p.vat ?? 'null'} · ${p.score}`
        );
    }

    console.log('\n--- Candidati riga per riga ---');
    for (const r of rows) {
        const flag = r.wouldCreate ? 'CREATE' : 'SKIP';
        const gw = r.gatewayId
            ? `${r.gateway} ${r.gatewayId}${r.gatewayLinkedAlready ? ' (già orderId)' : ''}`
            : 'NO_GATEWAY';
        const issues = r.productIssues.length ? ` · ${r.productIssues.join('; ')}` : '';
        const dup = r.duplicateOf ? ` · dup→ ${r.duplicateOf}` : '';
        console.log(
            `  ${flag} ${r.date} €${r.totalEuro.toFixed(2)} ${r.email} · ${gw}${dup}${issues}`
        );
    }

    console.log('\n--- Verifica già riportati su .com (non creare) ---');
    for (const v of alreadyVerify) {
        console.log(
            `  ${v.date} €${v.totalEuro.toFixed(2)} ${v.email} · found=${v.foundOnCom} · ${v.orders}`
        );
    }

    const doApply = process.argv.includes('--apply');
    if (!doApply) {
        console.log('\n(STOP) Nessuna scrittura eseguita. Per applicare: --apply\n');
        await prisma.$disconnect();
        return;
    }

    if (wouldCreate.length !== 33) {
        throw new Error(
            `Attesi 33 candidati (esclusa Isabella + 9 già su .com); trovati ${wouldCreate.length}. Abort.`
        );
    }
    if (withoutGw.length > 0) {
        throw new Error(`Gateway mancante su ${withoutGw.length} candidati. Abort.`);
    }
    if (missingList.length > 0) {
        // Carnet solo su Isabella (già skip): se compare qui tra i 33 → abort
        const blocking = missingList.filter((m) => !/carnet/i.test(m));
        if (blocking.length) throw new Error(`Prodotti mancanti: ${blocking.join(', ')}`);
    }

    const { importEuHistoricalOrder } = await import('@/lib/orders/importEuHistoricalOrder');
    const { buildGatewayCorrispettivi } = await import('@/lib/financial/dossierCorrispettiviBuild');

    const BATCH_ID = `EU_HIST_20260910_A`;
    console.log(`\n=== APPLY batch ${BATCH_ID} ===\n`);

    // Rimappa candidati → payload create (stesso ordine di toImport / matching)
    usedGatewayIds.clear();
    let createdN = 0;
    let itemN = 0;
    let skippedN = 0;
    const createdIds: string[] = [];

    for (const o of toImport) {
        const totalCents = toCents(o.totalEuro);
        const { start: wStart, end: wEnd } = windowBounds(o.dateIso, 2);
        const candidates = gatewayPool
            .filter((g) => g.amountCents === totalCents)
            .filter((g) => g.at >= wStart && g.at <= wEnd)
            .filter((g) => !usedGatewayIds.has(g.id))
            .sort((a, b) => {
                const score = (g: GwHit) =>
                    (g.isEu ? 100 : 0) + (g.orderId ? 0 : 50) + (g.gateway === 'Stripe' ? 10 : 0);
                return score(b) - score(a);
            });
        const gw = candidates[0];
        if (!gw) throw new Error(`No gateway for ${o.email} ${o.dateIso}`);
        usedGatewayIds.add(gw.id);

        const lines = [];
        for (const line of o.products) {
            const resolved = matchProduct(line, catalogForMatch);
            if (!resolved) throw new Error(`Product missing: ${line.name}`);
            const unitCents = toCents(line.lineTotalEuro / line.qty);
            lines.push({
                productId: resolved.id,
                quantity: line.qty,
                priceCents: unitCents,
            });
        }

        const result = await importEuHistoricalOrder({
            batchId: BATCH_ID,
            orderDateIso: o.dateIso,
            totalPriceCents: totalCents,
            buyerFullName: o.customerName || null,
            buyerEmail: o.email || null,
            buyerPhone: o.phone || null,
            deceasedName: o.deceased || 'n.c.',
            cemeteryName: 'Import storico floremoria.eu',
            cemeteryCity: 'Italia',
            deliveryProvince: 'XX',
            additionalNote: o.deceased ? `defunto=${o.deceased}` : null,
            gatewayTransactionId: gw.id.replace(/^TX:/i, ''),
            paymentMethodLabel:
                gw.gateway === 'PayPal' ? 'paypal' : gw.isEu ? 'stripe_eu' : 'stripe',
            stripeMovementStripeId: gw.gateway === 'Stripe' ? gw.id : null,
            lines,
        });

        if (result.created) {
            createdN += 1;
            itemN += lines.reduce((s, l) => s + l.quantity, 0);
            createdIds.push(result.orderId);
            console.log(`  OK ${o.dateIso} ${o.email} → ${result.orderId} · ${gw.gateway} ${gw.id}`);
        } else {
            skippedN += 1;
            console.log(`  SKIP ${o.dateIso} ${o.email} · ${result.skipped}`);
        }
    }

    console.log(`\nCreati: ${createdN} · skip: ${skippedN} · righe prodotto (qty): ${itemN}`);

    const quarters = [
        { q: 1 as const, start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2026, 2, 31, 23, 59, 59, 999)) },
        { q: 2 as const, start: new Date(Date.UTC(2026, 3, 1)), end: new Date(Date.UTC(2026, 5, 30, 23, 59, 59, 999)) },
        { q: 3 as const, start: new Date(Date.UTC(2026, 6, 1)), end: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)) },
    ];

    console.log('\n--- MANCANTE post-apply (buildGatewayCorrispettivi) ---');
    for (const { q, start, end } of quarters) {
        const built = await buildGatewayCorrispettivi({ start, end });
        const share = built.totals.mancanteShare;
        const pct = (share * 100).toFixed(1);
        const gate = share > 0.3 ? 'BLOCCA (>30%)' : 'OK (≤30%)';
        console.log(
            `T${q}: mancante ${pct}% · lordo ${euro(built.totals.grossAllCents)} · det ${euro(built.totals.determinataGrossCents)} · pres ${euro(built.totals.presuntaGrossCents)} · manc ${euro(built.totals.mancanteGrossCents)} · ${gate}`
        );
    }

    console.log(`\nBatch ${BATCH_ID} · order ids: ${createdIds.length}`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});

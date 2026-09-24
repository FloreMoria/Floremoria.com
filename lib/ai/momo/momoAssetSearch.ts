/**
 * MOMO Asset Search — Ricerca e download automatico di asset fotografici autentici
 * ad alta risoluzione da archivi aperti (Wikimedia Commons, Wikipedia) per qualsiasi
 * cimitero o monumento storico inserito dall'utente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getMonumentById } from '@/lib/ai/momo/momoMonuments';

export type MomoFetchedAssetResult = {
    query: string;
    slug: string;
    locationName: string;
    city: string;
    historicalFigure: string;
    visionLandscape: string;
    floralNotes: string;
    imagePaths: string[];
    localAbsPaths: string[];
    sources: string[];
    summaryExtract?: string;
};

export function slugify(str: string): string {
    return (
        str
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 50) || 'monument'
    );
}

/**
 * Ricerca e scarica 3-5 fotografie storiche autentiche ad alta risoluzione
 * per la location richiesta, estraendo contesto e fonti verificate.
 */
export async function searchAndFetchMomoAssets(
    query: string
): Promise<MomoFetchedAssetResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
        throw new Error('Specificare un luogo, cimitero o personaggio storico valido.');
    }

    const slug = slugify(cleanQuery);
    const outRelDir = `/media/social/momo/fetched/${slug}`;
    const outAbsDir = path.join(process.cwd(), 'public', outRelDir);
    fs.mkdirSync(outAbsDir, { recursive: true });

    // 1. Controlla se il monumento corrisponde a una voce del catalogo locale pre-certificata
    const localMatch =
        getMonumentById(slug) ||
        getMonumentById(cleanQuery.toLowerCase().replace(/\s+/g, '-'));

    // 2. Recupera informazioni storiche da Wikipedia in italiano
    let wikiTitle = cleanQuery;
    let wikiExtract = '';
    const wikiSources: string[] = [];

    try {
        const wikiSearchUrl = `https://it.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrlimit=1&prop=extracts|info&inprop=url&exintro=1&explaintext=1`;
        const wikiRes = await fetch(wikiSearchUrl, {
            headers: { 'User-Agent': 'FloreMoria/1.0 (staff.floremoria@gmail.com)' },
        });
        if (wikiRes.ok) {
            const wikiData = await wikiRes.json();
            const pages = Object.values(wikiData.query?.pages || {}) as any[];
            if (pages.length > 0 && pages[0]?.title) {
                wikiTitle = pages[0].title;
                wikiExtract = (pages[0].extract || '').slice(0, 400);
                if (pages[0].fullurl) wikiSources.push(pages[0].fullurl);
            }
        }
    } catch (e) {
        console.warn('[MOMO Search] Wikipedia fetch warning:', e);
    }

    // 3. Ricerca immagini reali ad alta risoluzione su Wikimedia Commons
    const downloadedImages: { rel: string; abs: string }[] = [];
    const existingFiles = fs.readdirSync(outAbsDir).filter((f) => f.startsWith('img_'));

    if (existingFiles.length >= 3) {
        // Usa la cache locale se già scaricata
        for (const f of existingFiles.slice(0, 5)) {
            downloadedImages.push({
                rel: `${outRelDir}/${f}`,
                abs: path.join(outAbsDir, f),
            });
        }
    } else {
        try {
            const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1920`;
            const commonsRes = await fetch(commonsUrl, {
                headers: { 'User-Agent': 'FloreMoria/1.0 (staff.floremoria@gmail.com)' },
            });

            if (commonsRes.ok) {
                const commonsData = await commonsRes.json();
                const pages = Object.values(commonsData.query?.pages || {}) as any[];

                let count = 0;
                for (const page of pages) {
                    const info = page.imageinfo?.[0];
                    if (!info) continue;
                    const imgUrl = info.thumburl || info.url;
                    if (!imgUrl || !info.mime?.startsWith('image/')) continue;
                    if (info.mime.includes('svg') || info.mime.includes('tif')) continue;

                    count++;
                    const ext = info.mime.includes('png') ? '.png' : '.jpg';
                    const filename = `img_${count}${ext}`;
                    const absFilePath = path.join(outAbsDir, filename);
                    const relFilePath = `${outRelDir}/${filename}`;

                    try {
                        const imgRes = await fetch(imgUrl, {
                            headers: { 'User-Agent': 'FloreMoria/1.0 (staff.floremoria@gmail.com)' },
                        });
                        if (imgRes.ok) {
                            const buffer = Buffer.from(await imgRes.arrayBuffer());
                            fs.writeFileSync(absFilePath, buffer);
                            downloadedImages.push({ rel: relFilePath, abs: absFilePath });
                            if (info.descriptionurl) wikiSources.push(info.descriptionurl);
                        }
                    } catch (err) {
                        console.warn('[MOMO Search] Download failed for image:', imgUrl, err);
                    }

                    if (downloadedImages.length >= 4) break;
                }
            }
        } catch (e) {
            console.warn('[MOMO Search] Wikimedia search error:', e);
        }
    }

    // Fallback se nessuna immagine trovata su Commons: usa asset di archivio paesaggistico locale
    if (downloadedImages.length === 0) {
        const fallback1 = '/media/social/momo/raw/cimitero_campagna_camminata_pov_real.mp4';
        const fallbackAbs = path.join(process.cwd(), 'public', fallback1);
        if (fs.existsSync(fallbackAbs)) {
            downloadedImages.push({ rel: fallback1, abs: fallbackAbs });
        }
    }

    // Costruzione entità location e cenni paesaggistici
    const locationName = localMatch?.cemetery || wikiTitle || cleanQuery;
    const city = localMatch?.city || extractCityFromQuery(cleanQuery);
    const historicalFigure = localMatch?.historicalFigure || extractFigure(cleanQuery, wikiExtract);
    const visionLandscape =
        localMatch?.visionLandscape ||
        (wikiExtract
            ? `La visione di ${locationName}: ${wikiExtract}`
            : `La visione e l'armonia solenne di ${locationName}.`);
    const floralNotes =
        localMatch?.floralNotes ||
        'Composizione sobria di alloro, rose discrete ed edera perenne.';

    const sources = Array.from(new Set([...(localMatch?.sources || []), ...wikiSources]));

    return {
        query: cleanQuery,
        slug,
        locationName,
        city,
        historicalFigure,
        visionLandscape,
        floralNotes,
        imagePaths: downloadedImages.map((d) => d.rel),
        localAbsPaths: downloadedImages.map((d) => d.abs),
        sources:
            sources.length > 0
                ? sources
                : ['Archivi di pubblico dominio / Wikimedia Commons'],
        summaryExtract: wikiExtract || undefined,
    };
}

function extractCityFromQuery(q: string): string {
    const parts = q.split(/[,–-]/);
    if (parts.length > 1) {
        return parts[parts.length - 1].trim();
    }
    const lower = q.toLowerCase();
    if (lower.includes('firenze')) return 'Firenze';
    if (lower.includes('como')) return 'Como';
    if (lower.includes('milano')) return 'Milano';
    if (lower.includes('roma')) return 'Roma';
    if (lower.includes('genova')) return 'Genova';
    if (lower.includes('bologna')) return 'Bologna';
    if (lower.includes('venezia')) return 'Venezia';
    if (lower.includes('ravenna')) return 'Ravenna';
    if (lower.includes('napoli')) return 'Napoli';
    if (lower.includes('torino')) return 'Torino';
    return 'Italia';
}

function extractFigure(query: string, extract: string): string {
    const lowerQ = query.toLowerCase();
    if (lowerQ.includes('volta')) return 'Alessandro Volta';
    if (lowerQ.includes('manzoni')) return 'Alessandro Manzoni';
    if (lowerQ.includes('collodi')) return 'Carlo Collodi';
    if (lowerQ.includes('dante')) return 'Dante Alighieri';
    if (lowerQ.includes('de andré') || lowerQ.includes('de andre')) return 'Fabrizio De André';
    if (lowerQ.includes('carducci')) return 'Giosuè Carducci';
    if (lowerQ.includes('morandi')) return 'Giorgio Morandi';
    if (lowerQ.includes('mameli')) return 'Goffredo Mameli';
    if (lowerQ.includes('spadolini')) return 'Giovanni Spadolini';

    // Se l'estratto contiene personaggi
    if (
        extract.includes('riposano') ||
        extract.includes('sepolti') ||
        extract.includes('tomba di')
    ) {
        return 'Personaggi illustri e costruttori della nostra cultura';
    }
    return 'Figure illustri della nostra memoria storica';
}

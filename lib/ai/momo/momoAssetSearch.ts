/**
 * MOMO Asset Search — Ricerca di asset fotografici autentici ad alta risoluzione
 * da archivi aperti (Wikimedia Commons, Wikipedia) per qualsiasi cimitero o monumento storico.
 * Compatibile al 100% con ambienti Serverless (zero scritture su filesystem).
 */
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
    sources: string[];
    summaryExtract?: string;
    fallbackUsed?: boolean;
    searchTier?: string;
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
 * Genera una lista ordinata di query di ricerca a specificità decrescente.
 */
function buildSearchCandidates(rawQuery: string): string[] {
    const cleaned = rawQuery.trim();
    const candidates: string[] = [cleaned];

    // Rimuovi parole di riempimento
    const simplified = cleaned
        .replace(/^(cimitero\s+(comunale|monumentale|acattolico|civico|militare|storico)?\s+di\s+)/i, '')
        .replace(/^(tomba\s+di\s+|mausoleo\s+di\s+|monumento\s+a\s+|sepolcro\s+di\s+)/i, '')
        .trim();

    if (simplified && simplified.toLowerCase() !== cleaned.toLowerCase()) {
        candidates.push(`Cimitero ${simplified}`);
        candidates.push(`${simplified} cimitero`);
        candidates.push(simplified);
        candidates.push(`${simplified} monumento`);
        candidates.push(`${simplified} chiesa`);
    }

    // Estrai comune o città se presente dopo la virgola o trattino
    const parts = cleaned.split(/[,–-]/);
    if (parts.length > 1) {
        const cityPart = parts[parts.length - 1].trim();
        const mainPart = parts[0].trim();
        if (cityPart) {
            candidates.push(`${mainPart} ${cityPart}`);
            candidates.push(cityPart);
        }
    }

    return Array.from(new Set(candidates)).filter((c) => c.length >= 2);
}

/**
 * Ricerca fotografie storiche autentiche ad alta risoluzione (JPG/PNG)
 * restituendo direttamente gli URL HTTPS remoti da Wikimedia Commons e Wikipedia.
 */
export async function searchAndFetchMomoAssets(
    query: string
): Promise<MomoFetchedAssetResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
        throw new Error('Specificare un luogo, cimitero o personaggio storico valido.');
    }

    const slug = slugify(cleanQuery);

    // 1. Controlla catalogo locale pre-certificato
    const localMatch =
        getMonumentById(slug) ||
        getMonumentById(cleanQuery.toLowerCase().replace(/\s+/g, '-'));

    const searchCandidates = buildSearchCandidates(cleanQuery);
    const remoteImageUrls: string[] = [];
    let wikiTitle = cleanQuery;
    let wikiExtract = '';
    const wikiSources: string[] = [];
    let matchedTier = 'exact';

    // 2. Esegui ricerca a cascata
    for (const candidate of searchCandidates) {
        if (remoteImageUrls.length >= 4) break;

        // A) Cerca contesto e immagini da Wikipedia
        try {
            const wikiSearchUrl = `https://it.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(candidate)}&gsrlimit=2&prop=pageimages|extracts|info&inprop=url&piprop=original|thumbnail&pithumbsize=1920&exintro=1&explaintext=1`;
            const wikiRes = await fetch(wikiSearchUrl, {
                headers: { 'User-Agent': 'FloreMoria/1.0 (staff.floremoria@gmail.com)' },
            });
            if (wikiRes.ok) {
                const wikiData = await wikiRes.json();
                const pages = Object.values(wikiData.query?.pages || {}) as any[];
                for (const page of pages) {
                    if (!wikiExtract && page.extract) {
                        wikiTitle = page.title || wikiTitle;
                        wikiExtract = (page.extract || '').slice(0, 450);
                        if (page.fullurl) wikiSources.push(page.fullurl);
                    }

                    // Prendi l'immagine ad alta risoluzione della pagina Wikipedia
                    const wikiImgUrl = page.original?.source || page.thumbnail?.source;
                    if (
                        wikiImgUrl &&
                        !wikiImgUrl.includes('.svg') &&
                        !wikiImgUrl.includes('.tif') &&
                        !remoteImageUrls.includes(wikiImgUrl)
                    ) {
                        remoteImageUrls.push(wikiImgUrl);
                        if (page.fullurl) wikiSources.push(page.fullurl);
                    }
                }
            }
        } catch (e) {
            console.warn('[MOMO Search] Wikipedia fetch error for candidate:', candidate, e);
        }

        // B) Cerca fotografie ad alta risoluzione su Wikimedia Commons
        try {
            const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(candidate)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1920`;
            const commonsRes = await fetch(commonsUrl, {
                headers: { 'User-Agent': 'FloreMoria/1.0 (staff.floremoria@gmail.com)' },
            });

            if (commonsRes.ok) {
                const commonsData = await commonsRes.json();
                const pages = Object.values(commonsData.query?.pages || {}) as any[];

                for (const page of pages) {
                    if (remoteImageUrls.length >= 4) break;
                    const info = page.imageinfo?.[0];
                    if (!info) continue;
                    const imgUrl = info.thumburl || info.url;
                    if (!imgUrl) continue;

                    const titleLow = (page.title || '').toLowerCase();
                    if (
                        titleLow.includes('.svg') ||
                        titleLow.includes('map') ||
                        titleLow.includes('mappa') ||
                        titleLow.includes('planimetria') ||
                        titleLow.includes('icon') ||
                        titleLow.includes('flag')
                    ) {
                        continue;
                    }

                    if (!remoteImageUrls.includes(imgUrl)) {
                        remoteImageUrls.push(imgUrl);
                        if (info.descriptionurl) wikiSources.push(info.descriptionurl);
                        matchedTier = candidate;
                    }
                }
            }
        } catch (e) {
            console.warn('[MOMO Search] Wikimedia search error for candidate:', candidate, e);
        }
    }

    // 3. Fallback se ancora nessuna foto trovata: usa filmato/foto paesaggistica locale
    let fallbackUsed = false;
    if (remoteImageUrls.length === 0) {
        fallbackUsed = true;
        remoteImageUrls.push('/media/social/momo/raw/cimitero_campagna_camminata_pov_real.mp4');
    }

    // 4. Costruzione metadati location, figura e paesaggio
    const locationName = localMatch?.cemetery || wikiTitle || cleanQuery;
    const city = localMatch?.city || extractCityFromQuery(cleanQuery);
    const historicalFigure = localMatch?.historicalFigure || extractFigure(cleanQuery, wikiExtract);
    const visionLandscape =
        localMatch?.visionLandscape ||
        (wikiExtract
            ? `La visione di ${locationName}: ${wikiExtract}`
            : `La visione solenne e la bellezza silenziosa di ${locationName}.`);
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
        imagePaths: remoteImageUrls,
        sources:
            sources.length > 0
                ? sources
                : ['Archivi di pubblico dominio / Wikimedia Commons'],
        summaryExtract: wikiExtract || undefined,
        fallbackUsed,
        searchTier: matchedTier,
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
    if (lower.includes('torremaggiore')) return 'Torremaggiore (Foggia)';
    if (lower.includes('foggia')) return 'Foggia';
    if (lower.includes('bari')) return 'Bari';
    if (lower.includes('palermo')) return 'Palermo';
    if (lower.includes('catania')) return 'Catania';
    if (lower.includes('verona')) return 'Verona';
    if (lower.includes('padova')) return 'Padova';
    if (lower.includes('pisa')) return 'Pisa';
    if (lower.includes('lucca')) return 'Lucca';
    if (lower.includes('siena')) return 'Siena';
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
    if (lowerQ.includes('sacco') || lowerQ.includes('vanzetti')) return 'Nicola Sacco e Bartolomeo Vanzetti';

    if (
        extract.includes('riposano') ||
        extract.includes('sepolti') ||
        extract.includes('tomba di')
    ) {
        return 'Personaggi illustri e costruttori della nostra cultura';
    }
    return 'Figure illustri della nostra memoria storica';
}

export { searchAndFetchMomoAssets as searchMonumentAssets };

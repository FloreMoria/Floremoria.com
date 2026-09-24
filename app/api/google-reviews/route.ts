import { NextResponse } from 'next/server';

/**
 * Recensioni Google Places — solo server-side.
 * Perché: la chiave Places non deve mai finire nel browser; fallback onesto
 * (solo URL) se Google non risponde — niente numeri/testi inventati.
 */

interface GooglePlacesResponse {
    status?: string;
    error_message?: string;
    result?: {
        name: string;
        rating: number;
        user_ratings_total: number;
        url: string;
        reviews?: Array<{
            author_name: string;
            author_url: string;
            profile_photo_url: string;
            rating: number;
            text: string;
            time: number;
            relative_time_description?: string;
        }>;
    };
}

let cachedData: {
    ok: true;
    name?: string;
    rating: number;
    user_ratings_total: number;
    url: string;
    reviews: NonNullable<GooglePlacesResponse['result']>['reviews'];
} | null = null;
let cacheExpiration = 0;

/** Scheda / recensioni FloreMoria su Google (fallback se Places non dà `url`). */
const FLOREMORIA_GOOGLE_REVIEWS_URL =
    'https://www.google.com/maps/place/?q=place_id:ChIJeUohbcWdhkcRi0cg4AHrlM4';

/** @deprecated Legacy g.page “scrivi recensione” — tenuto solo come riferimento storico. */
const _LEGACY_GBP_WRITE_REVIEW_URL = 'https://g.page/r/CYtHIOAB65TOEB0/review';
void _LEGACY_GBP_WRITE_REVIEW_URL;

function honestFailure(url: string, error?: string) {
    return NextResponse.json(
        {
            ok: false as const,
            url,
            ...(error ? { error } : {}),
        },
        { status: 200 }
    );
}

export async function GET() {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    const placeId = process.env.GOOGLE_PLACE_ID?.trim();
    const fallbackUrl =
        placeId && placeId.length > 0
            ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
            : FLOREMORIA_GOOGLE_REVIEWS_URL;

    if (!apiKey || !placeId) {
        return honestFailure(
            fallbackUrl,
            'GOOGLE_PLACES_API_KEY o GOOGLE_PLACE_ID assenti — nessun dato inventato'
        );
    }

    if (cachedData && Date.now() < cacheExpiration) {
        return NextResponse.json(cachedData);
    }

    try {
        const url =
            `https://maps.googleapis.com/maps/api/place/details/json` +
            `?place_id=${encodeURIComponent(placeId)}` +
            `&fields=name,rating,user_ratings_total,url,reviews` +
            `&language=it` +
            `&key=${encodeURIComponent(apiKey)}`;

        const response = await fetch(url, { next: { revalidate: 0 } });

        if (!response.ok) {
            throw new Error(`Google Places HTTP ${response.status}`);
        }

        const data = (await response.json()) as GooglePlacesResponse;

        if (data.status && data.status !== 'OK') {
            throw new Error(data.error_message || `Places status ${data.status}`);
        }

        if (!data.result || typeof data.result.rating !== 'number') {
            throw new Error('Places: result senza rating');
        }

        const total =
            typeof data.result.user_ratings_total === 'number'
                ? data.result.user_ratings_total
                : null;
        if (total === null) {
            throw new Error('Places: user_ratings_total assente');
        }

        cachedData = {
            ok: true,
            name: data.result.name,
            rating: data.result.rating,
            user_ratings_total: total,
            url: data.result.url || fallbackUrl,
            reviews: Array.isArray(data.result.reviews) ? data.result.reviews : [],
        };
        cacheExpiration = Date.now() + 6 * 60 * 60 * 1000;
        return NextResponse.json(cachedData);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error fetching Google reviews';
        console.error('[google-reviews]', msg);
        return honestFailure(fallbackUrl, msg);
    }
}

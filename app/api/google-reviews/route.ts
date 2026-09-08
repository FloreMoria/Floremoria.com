import { NextResponse } from 'next/server';

interface GooglePlacesResponse {
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
        }>;
    }
}

let cachedData: any = null;
let cacheExpiration = 0;

/** URL diretto per recensioni su Google Business Profile di FloreMoria. */
const FLOREMORIA_GBP_DIRECT_URL =
    'https://g.page/r/CYtHIOAB65TOEB0/review';

export async function GET() {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    const placeId = process.env.GOOGLE_PLACE_ID?.trim();

    const fallbackUrl = FLOREMORIA_GBP_DIRECT_URL;

    if (!apiKey || !placeId) {
        return NextResponse.json({
            rating: 5.0,
            user_ratings_total: 34,
            url: fallbackUrl
        }, { status: 200 }); // Return 200 so the client can read stats and direct URL
    }

    // Check in-memory cache
    if (cachedData && Date.now() < cacheExpiration) {
        return NextResponse.json(cachedData);
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,url,reviews&key=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Google Places API responded with status: ${response.status}`);
        }

        const data = (await response.json()) as GooglePlacesResponse;

        if (data.result) {
            cachedData = {
                name: data.result.name,
                rating: data.result.rating,
                user_ratings_total: data.result.user_ratings_total,
                url: data.result.url || fallbackUrl,
                reviews: data.result.reviews || []
            };
            // 6 hours in milliseconds
            cacheExpiration = Date.now() + 6 * 60 * 60 * 1000;
            return NextResponse.json(cachedData);
        } else {
            throw new Error('No result found in Google Places response');
        }

    } catch (e: any) {
        return NextResponse.json({
            error: e.message || 'Error fetching Google reviews',
            url: fallbackUrl
        }, { status: 200 }); // Status 200 to allow client read
    }
}

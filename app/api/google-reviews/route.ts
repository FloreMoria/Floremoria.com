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

export async function GET() {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    const placeId = process.env.GOOGLE_PLACE_ID;

    if (!placeId) {
        console.warn('Warning: GOOGLE_PLACE_ID environment variable is missing.');
    }

    const fallbackUrl = placeId
        ? `https://www.google.com/maps/search/?api=1&query_place_id=${placeId}`
        : undefined;

    if (!apiKey || !placeId) {
        return NextResponse.json({
            error: 'Missing Google Places configuration',
            url: fallbackUrl
        }, { status: 200 }); // Return 200 so the client can still read the fallback URL
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

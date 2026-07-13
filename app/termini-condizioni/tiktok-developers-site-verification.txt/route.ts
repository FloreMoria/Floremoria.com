const TIKTOK_VERIFICATION_CODE = 'hn9zw4SN50YfX9FTNwvbXtKINd8Blpzm';

export function GET() {
    return new Response(TIKTOK_VERIFICATION_CODE, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}

import { TIKTOK_SITE_VERIFICATION_LINE } from '../layout';

export function GET() {
    return new Response(TIKTOK_SITE_VERIFICATION_LINE, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}

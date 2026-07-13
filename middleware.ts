import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * TikTok verifica l'URL esatto con trailing slash e non segue redirect 308.
 * Rewrite interno: /termini-condizioni/ → stessa pagina senza redirect.
 */
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname === '/termini-condizioni/') {
        const rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = '/termini-condizioni';
        return NextResponse.rewrite(rewriteUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/termini-condizioni/'],
};

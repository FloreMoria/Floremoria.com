import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSiteBaseUrl } from '@/lib/site/config';
import { isLinkPreviewOrBot } from '@/lib/floristNetwork/isLinkPreviewOrBot';
import {
    PARTNER_REF_COOKIE,
    getPartnerRefCookieOptions,
} from '@/lib/floristNetwork/partnerRefConstants';
import {
    clientIpFromRequest,
    createFloristScanEvent,
} from '@/lib/floristNetwork/scanEvent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vetrina QR Partner (Art. 2.3): una scansione → cookie sessione → al più una fee.
 * GET /fioristi/[slug] → FloristScanEvent + cookie → redirect 302 home.
 * Redirect sullo stesso origin della richiesta (preview Vercel inclusa), così il cookie resta valido.
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ slug: string }> }
) {
    const requestOrigin = (() => {
        try {
            return new URL(request.url).origin;
        } catch {
            return getSiteBaseUrl() || 'https://www.floremoria.com';
        }
    })();
    const home = `${requestOrigin}/`;
    const redirectHome = () => NextResponse.redirect(home, 302);

    const { slug: rawSlug } = await context.params;
    const slug = (rawSlug || '').trim().toLowerCase();
    if (!slug || slug.length > 80) {
        return redirectHome();
    }

    const partner = await prisma.partner.findFirst({
        where: {
            slug,
            isActive: true,
            deletedAt: null,
            networkStatus: 'ACTIVE',
        },
        select: { id: true },
    });

    if (!partner) {
        return redirectHome();
    }

    const ua = request.headers.get('user-agent');
    if (isLinkPreviewOrBot(ua)) {
        // Anteprima/crawler: nessuna fee, nessun cookie, nessun evento.
        return redirectHome();
    }

    try {
        const { sessionToken } = await createFloristScanEvent({
            floristId: partner.id,
            ip: clientIpFromRequest(request),
            userAgent: ua,
        });

        const res = NextResponse.redirect(home, 302);
        res.cookies.set(
            PARTNER_REF_COOKIE,
            sessionToken,
            getPartnerRefCookieOptions(request)
        );
        return res;
    } catch (err) {
        console.error('[fioristi/slug] createFloristScanEvent fallito:', err);
        return redirectHome();
    }
}

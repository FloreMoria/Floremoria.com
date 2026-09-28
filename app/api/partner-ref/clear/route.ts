import { NextResponse } from 'next/server';
import {
    PARTNER_REF_COOKIE,
    getPartnerRefCookieOptions,
} from '@/lib/floristNetwork/partnerRefConstants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cancella cookie QR Partner dopo conferma ordine (Art. 2.3):
 * ordini successivi senza nuova scansione non generano fee.
 */
export async function POST(request: Request) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PARTNER_REF_COOKIE, '', {
        ...getPartnerRefCookieOptions(request),
        maxAge: 0,
    });
    return res;
}

export async function GET(request: Request) {
    return POST(request);
}

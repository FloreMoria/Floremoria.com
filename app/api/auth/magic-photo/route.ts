import { NextRequest, NextResponse } from 'next/server';
import { handleMagicPhotoAccess } from '@/lib/auth/magicPhotoRoute';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token')?.trim();
    if (!token) {
        return NextResponse.redirect(new URL('/auth/magic-photo?invalid=1', request.url));
    }
    return handleMagicPhotoAccess(request, token);
}

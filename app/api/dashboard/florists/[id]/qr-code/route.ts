import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import prisma from '@/lib/prisma';
import { floristPublicQrUrl } from '@/lib/floristNetwork/qrAdminViews';

export const runtime = 'nodejs';

/** Solo Admin / Super Admin (Operazione 3 — vista rete QR). */
function isQrAdminRole(role: string): boolean {
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;
    if (!isQrAdminRole(auth.role)) {
        return NextResponse.json({ ok: false, error: 'Solo Admin / Super Admin.' }, { status: 403 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'png').toLowerCase();

    const partner = await prisma.partner.findFirst({
        where: { id, deletedAt: null },
        select: { slug: true, shopName: true },
    });
    if (!partner?.slug) {
        return NextResponse.json({ ok: false, error: 'Partner senza slug QR.' }, { status: 404 });
    }

    const url = floristPublicQrUrl(partner.slug);
    const safeName = partner.slug.replace(/[^a-z0-9_-]+/gi, '-');

    if (format === 'svg') {
        const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 512 });
        return new NextResponse(svg, {
            headers: {
                'Content-Type': 'image/svg+xml; charset=utf-8',
                'Content-Disposition': `attachment; filename="floremoria-qr-${safeName}.svg"`,
                'Cache-Control': 'private, max-age=300',
            },
        });
    }

    const png = await QRCode.toBuffer(url, { type: 'png', margin: 1, width: 1024 });
    return new NextResponse(new Uint8Array(png), {
        headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="floremoria-qr-${safeName}.png"`,
            'Cache-Control': 'private, max-age=300',
        },
    });
}

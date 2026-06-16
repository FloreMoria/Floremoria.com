import { NextResponse } from 'next/server';
import { evaluateFloristDeliveryAccess } from '@/lib/deliveryProof/floristAccess';
import { submitFloristDeliveryProof } from '@/lib/deliveryProof/submitFloristProof';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const form = await request.formData();
        const orderId = String(form.get('orderId') || '').trim();
        if (!orderId) {
            return NextResponse.json({ ok: false, error: 'orderId mancante.' }, { status: 400 });
        }

        const order = await prisma.order.findFirst({
            where: { id: orderId, deletedAt: null },
            select: {
                id: true,
                status: true,
                updatedAt: true,
                deletedAt: true,
                partnerPaymentStatus: true,
            },
        });

        const access = evaluateFloristDeliveryAccess(order);
        if (!access.allowed) {
            return NextResponse.json({ ok: false, error: 'Ordine non accessibile per upload.' }, { status: 403 });
        }

        const beforeFiles = form.getAll('beforePhotos').filter((v): v is File => v instanceof File && v.size > 0);
        const afterFiles = form.getAll('afterPhotos').filter((v): v is File => v instanceof File && v.size > 0);

        const latRaw = form.get('gpsLatitude');
        const lngRaw = form.get('gpsLongitude');
        const gpsLatitude = latRaw != null ? parseFloat(String(latRaw)) : null;
        const gpsLongitude = lngRaw != null ? parseFloat(String(lngRaw)) : null;

        const result = await submitFloristDeliveryProof({
            orderId,
            beforeFiles,
            afterFiles,
            gpsLatitude: Number.isFinite(gpsLatitude!) ? gpsLatitude : null,
            gpsLongitude: Number.isFinite(gpsLongitude!) ? gpsLongitude : null,
        });

        if (!result.ok) {
            return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
        }

        return NextResponse.json({
            ok: true,
            orderId: result.orderId,
            magicLinkUrl: result.magicLinkUrl,
        });
    } catch (error) {
        console.error('[upload-proof]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}

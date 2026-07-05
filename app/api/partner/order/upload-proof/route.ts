import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { evaluateFloristDeliveryAccess } from '@/lib/deliveryProof/floristAccess';
import { parseGpsPair } from '@/lib/deliveryProof/parseGps';
import { submitFloristDeliveryProof } from '@/lib/deliveryProof/submitFloristProof';
import { resolveOrderByPublicRef } from '@/lib/orders/resolveOrderIdentifier';
import { isDashboardAdminRole } from '@/lib/superAdmin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        const form = await request.formData();
        const orderRef = String(form.get('orderId') || '').trim();
        if (!orderRef) {
            return NextResponse.json({ ok: false, error: 'orderId mancante.' }, { status: 400 });
        }

        const adminBypassRequested = form.get('adminBypass') === '1';
        const cookieStore = await cookies();
        const cookieRole = cookieStore.get('fm_user_role')?.value;

        const order = await resolveOrderByPublicRef(orderRef, {
            id: true,
            orderNumber: true,
            status: true,
            updatedAt: true,
            deletedAt: true,
            partnerPaymentStatus: true,
        });

        if (!order) {
            return NextResponse.json({ ok: false, error: 'Ordine non trovato.' }, { status: 404 });
        }

        if (adminBypassRequested) {
            if (!isDashboardAdminRole(cookieRole)) {
                return NextResponse.json({ ok: false, error: 'Upload admin non autorizzato.' }, { status: 403 });
            }
        } else {
            const access = evaluateFloristDeliveryAccess(order, orderRef);
            if (!access.allowed) {
                return NextResponse.json({ ok: false, error: 'Ordine non accessibile per upload.' }, { status: 403 });
            }
        }

        const beforeFiles = form.getAll('beforePhotos').filter((v): v is File => v instanceof File && v.size > 0);
        const afterFiles = form.getAll('afterPhotos').filter((v): v is File => v instanceof File && v.size > 0);

        const { gpsLatitude, gpsLongitude } = parseGpsPair(form.get('gpsLatitude'), form.get('gpsLongitude'));

        const result = await submitFloristDeliveryProof({
            orderId: order.id,
            beforeFiles,
            afterFiles,
            gpsLatitude,
            gpsLongitude,
        });

        if (!result.ok) {
            return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
        }

        return NextResponse.json({
            ok: true,
            orderId: result.orderId,
            giardinoUrl: result.giardinoUrl,
            /** @deprecated usare giardinoUrl */
            magicLinkUrl: result.giardinoUrl,
        });
    } catch (error) {
        console.error('[upload-proof]', error);
        const message = error instanceof Error ? error.message : 'Errore interno.';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}

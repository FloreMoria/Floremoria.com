/**
 * Futuria: upsert contatto + custom field Magic Link + tag workflow foto consegna.
 * Pattern doppio passaggio: upsert dati → tag `floremoria-invia-foto-consegna`.
 */
import { isFuturiaConfigured, normalizeFuturiaPhone, upsertFuturiaContact } from './client';
import { getFuturiaMagicPhotoLinkFieldKey } from './config';

export interface MagicPhotoDeliveryNotifyInput {
    orderId: string;
    orderNumber?: string | null;
    buyerFullName?: string | null;
    buyerEmail?: string | null;
    customerPhone?: string | null;
    deceasedName?: string | null;
    magicLinkUrl: string;
    photoAfterUrl?: string | null;
}

export async function sendMagicPhotoDeliveryToFuturia(
    input: MagicPhotoDeliveryNotifyInput
): Promise<{ ok: boolean; skipped?: string; contactId?: string }> {
    if (!isFuturiaConfigured()) {
        return { ok: false, skipped: 'futuria_not_configured' };
    }

    const phone = normalizeFuturiaPhone(input.customerPhone);
    if (!phone) {
        return { ok: false, skipped: 'invalid_phone' };
    }

    const magicFieldKey = getFuturiaMagicPhotoLinkFieldKey();
    const buyerName = (input.buyerFullName || 'Utente').trim();

    const contactId = await upsertFuturiaContact({
        phone,
        name: buyerName,
        ...(input.buyerEmail ? { email: input.buyerEmail } : {}),
        deceasedName: input.deceasedName,
        orderNumber: input.orderNumber,
        additionalCustomFields: {
            [magicFieldKey]: input.magicLinkUrl,
        },
    });

    await upsertFuturiaContact({
        phone,
        name: buyerName,
        tags: ['floremoria-invia-foto-consegna'],
    });

    console.info(
        `[magic-photo-delivery] Futuria upsert OK contact=${contactId} order=${input.orderNumber || input.orderId}`
    );

    return { ok: true, contactId };
}

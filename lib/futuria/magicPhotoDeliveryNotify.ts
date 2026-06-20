/**
 * Futuria: upsert contatto post-consegna con custom field dinamici + tag workflow.
 * Caso B — chiave canonica: email utente Prisma (`order.user.email`).
 */
import {
    findFuturiaDuplicateContact,
    isFuturiaConfigured,
    normalizeFuturiaPhone,
    upsertFuturiaContact,
    type FuturiaContactRecord,
} from './client';
import {
    getFuturiaDeliveryCompletedTag,
    getFuturiaDeliveryCompletionFieldConfig,
} from './config';
import { resolveDeliveryFollowupContactAuth } from './contactGate';
import { resolvePartnerCity } from './proofOfDelivery';
import { buildMagicLoginUrl, normalizeMagicLinkEmail } from '@/lib/auth/magicLink';

export interface MagicPhotoDeliveryNotifyInput {
    orderId: string;
    orderNumber?: string | null;
    /** Email canonica: `order.user.email` dopo ensureUserForOrder. */
    userEmail: string;
    buyerFullName?: string | null;
    customerPhone?: string | null;
    deceasedName?: string | null;
    cemeteryCity?: string | null;
    cemeteryName?: string | null;
    deliveryProvince?: string | null;
    deliveredProductsSummary: string;
    photoAfterUrl?: string | null;
}

function buildDeliveryCompletionCustomFields(
    input: MagicPhotoDeliveryNotifyInput,
    magicLinkUrl: string
): Record<string, string> {
    const fields = getFuturiaDeliveryCompletionFieldConfig();
    const deceasedName = (input.deceasedName || 'chi ama').trim();
    const cemeteryCity = resolvePartnerCity({
        cemeteryCity: input.cemeteryCity,
        cemeteryName: input.cemeteryName,
        deliveryProvince: input.deliveryProvince,
    });

    return {
        [fields.ultimoProdottoConsegnatoKey]: input.deliveredProductsSummary.trim(),
        [fields.ultimoDefuntoAssociatoKey]: deceasedName,
        [fields.ultimoCimiteroComuneKey]: cemeteryCity,
        [fields.ultimoMagicLinkKey]: magicLinkUrl,
    };
}

function contactEmailMatches(contact: FuturiaContactRecord, expectedEmail: string): boolean {
    const expected = normalizeMagicLinkEmail(expectedEmail);
    const onRecord = contact.email?.trim().toLowerCase();
    if (!onRecord) {
        // Trovato via duplicate search per email: consideriamo affidabile.
        return true;
    }
    return onRecord === expected;
}

export async function sendMagicPhotoDeliveryToFuturia(
    input: MagicPhotoDeliveryNotifyInput
): Promise<{ ok: boolean; skipped?: string; contactId?: string; magicLinkUrl?: string }> {
    if (!isFuturiaConfigured()) {
        return { ok: false, skipped: 'futuria_not_configured' };
    }

    const canonicalEmail = normalizeMagicLinkEmail(input.userEmail);
    if (!canonicalEmail) {
        return { ok: false, skipped: 'missing_user_email' };
    }

    const existingContact = await findFuturiaDuplicateContact({ email: canonicalEmail });
    const emailVerified = existingContact ? contactEmailMatches(existingContact, canonicalEmail) : true;

    if (existingContact && !emailVerified) {
        console.error(
            `[magic-photo-delivery] Email mismatch Futuria contact=${existingContact.id} expected=${canonicalEmail} got=${existingContact.email}`
        );
        return { ok: false, skipped: 'email_mismatch' };
    }

    const magicLinkUrl = buildMagicLoginUrl(canonicalEmail);
    const buyerName = (input.buyerFullName || 'Utente').trim();
    const deliveryTag = getFuturiaDeliveryCompletedTag();
    const customFields = buildDeliveryCompletionCustomFields(input, magicLinkUrl);
    const phone = normalizeFuturiaPhone(input.customerPhone);

    const auth = await resolveDeliveryFollowupContactAuth({
        orderId: input.orderId,
        email: canonicalEmail,
    });

    const contactId = await upsertFuturiaContact(
        {
            email: canonicalEmail,
            ...(phone ? { phone } : {}),
            name: buyerName,
            deceasedName: input.deceasedName,
            orderNumber: input.orderNumber,
            ...(emailVerified ? { tags: [deliveryTag] } : {}),
            additionalCustomFields: customFields,
        },
        auth
    );

    console.info(
        `[magic-photo-delivery] Futuria upsert OK contact=${contactId} email=${canonicalEmail} order=${input.orderNumber || input.orderId} tag=${emailVerified ? deliveryTag : 'skipped'} auth=${auth.source}`
    );

    return { ok: true, contactId, magicLinkUrl };
}

/** Solo per test: verifica presenza contatto prima dell'upsert (chiave email). */
export async function findFuturiaContactForDeliveryNotify(params: { email: string }) {
    return findFuturiaDuplicateContact({
        email: normalizeMagicLinkEmail(params.email),
    });
}

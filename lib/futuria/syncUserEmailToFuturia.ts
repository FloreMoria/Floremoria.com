/**
 * Sincronizza cambio email utente su Futuria (Caso B — chiave canonica email).
 * Aggiorna solo contatti già presenti; nessuna creazione (contactGate).
 */
import { normalizeMagicLinkEmail } from '@/lib/auth/magicLink';
import {
    findFuturiaDuplicateContact,
    isFuturiaConfigured,
    normalizeFuturiaPhone,
    updateFuturiaContactById,
} from './client';

export async function syncUserEmailChangeToFuturia(params: {
    previousEmail: string;
    newEmail: string;
    name?: string | null;
    phone?: string | null;
}): Promise<{ ok: boolean; contactId?: string; skipped?: string }> {
    if (!isFuturiaConfigured()) {
        return { ok: false, skipped: 'futuria_not_configured' };
    }

    const previousEmail = normalizeMagicLinkEmail(params.previousEmail);
    const newEmail = normalizeMagicLinkEmail(params.newEmail);

    if (!previousEmail || !newEmail || previousEmail === newEmail) {
        return { ok: true, skipped: 'unchanged' };
    }

    let existing = await findFuturiaDuplicateContact({ email: previousEmail });
    if (!existing?.id) {
        const phone = normalizeFuturiaPhone(params.phone);
        if (phone) {
            existing = await findFuturiaDuplicateContact({ phone });
        }
    }

    if (!existing?.id) {
        console.warn(
            `[futuria] sync email change: contatto assente per ${previousEmail} (skip CRM update).`
        );
        return { ok: false, skipped: 'contact_not_found' };
    }

    const onRecord = existing.email?.trim().toLowerCase();
    if (onRecord && onRecord !== previousEmail) {
        console.warn(
            `[futuria] sync email change: mismatch contact=${existing.id} expected=${previousEmail} got=${onRecord}`
        );
        return { ok: false, skipped: 'email_mismatch' };
    }

    await updateFuturiaContactById(existing.id, {
        email: newEmail,
        phone: normalizeFuturiaPhone(params.phone) ?? undefined,
        name: params.name ?? undefined,
    });

    console.info(
        `[futuria] sync email change OK contact=${existing.id} ${previousEmail} → ${newEmail}`
    );

    return { ok: true, contactId: existing.id };
}

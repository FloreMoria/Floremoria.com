const PHONE_LOCAL_EMAIL_SUFFIX = '@phone.floremoria.local';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isDeliverableEmail(raw?: string | null): string | null {
    const email = raw?.trim().toLowerCase();
    if (!email || email.includes(PHONE_LOCAL_EMAIL_SUFFIX)) return null;
    return EMAIL_RE.test(email) ? email : null;
}

/** Email cliente reale (ordine o profilo utente), esclusi placeholder telefono-only. */
export function resolveOrderBuyerEmail(order: {
    buyerEmail?: string | null;
    user?: { email?: string | null } | null;
}): string | null {
    return isDeliverableEmail(order.buyerEmail) ?? isDeliverableEmail(order.user?.email);
}

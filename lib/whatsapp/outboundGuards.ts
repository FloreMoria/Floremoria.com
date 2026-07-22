/**
 * Guardrail outbound WhatsApp.
 * Perché: senza kill-switch i loop Punto A/B e i test `isTest` arrivano su Meta reale.
 */

/** Blocca TUTTI gli invii Meta (operator + automatici). Emergenza. */
export function isWhatsAppOutboundDisabled(): boolean {
    return process.env.WHATSAPP_OUTBOUND_DISABLED === '1';
}

/**
 * Blocca notifiche automatiche ordine (Punto A/B/E/F/G, flush, cron).
 * Default SPENTO dopo spam 2026-07-22: riattiva solo con WHATSAPP_AUTO_NOTIFY_DISABLED=0.
 * Communications operator resta attiva se OUTBOUND non è disabilitato.
 */
export function isWhatsAppAutoNotifyDisabled(): boolean {
    if (isWhatsAppOutboundDisabled()) return true;
    const flag = process.env.WHATSAPP_AUTO_NOTIFY_DISABLED?.trim().toLowerCase();
    if (flag === '0' || flag === 'false' || flag === 'off') return false;
    return true;
}

/**
 * Ordini sandbox non devono toccare WhatsApp reale salvo opt-in esplicito.
 * Perché: `isTest` bypassava solo scheduling, non Meta → Carlo e simili ricevevano messaggi veri.
 */
export function shouldSkipTestOrderMetaSend(isTest: boolean | null | undefined): boolean {
    if (!isTest) return false;
    return process.env.WHATSAPP_ALLOW_TEST_SENDS !== '1';
}

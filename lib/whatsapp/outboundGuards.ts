/**
 * Guardrail outbound WhatsApp.
 *
 * WHATSAPP_OUTBOUND_DISABLED=1
 *   → blocca TUTTI gli invii Meta (operator + automatici). Emergenza totale.
 *
 * WHATSAPP_AUTO_NOTIFY_DISABLED
 *   → "1" | "true" | "on"  = automatici ordine OFF (Punto A/B/E/F/G, flush, cron)
 *   → "0" | "false" | "off" = automatici ordine ON
 *   → unset / vuoto         = automatici ordine ON (default esplicito post P0/P1)
 *     Communications operator resta attiva salvo OUTBOUND_DISABLED.
 *
 * Sandbox (`isTest: true`):
 *   - Fascia oraria fioristi / delay Punto B: sempre bypassati a valle.
 *   - Kill-switch AUTO_NOTIFY: non si applica agli ordini isTest (serve E2E sandbox).
 *   - Meta su numeri reali dell'ordine test: solo se WHATSAPP_ALLOW_TEST_SENDS=1
 *     (default: bloccato, per evitare spam tipo Carlo su WABA produzione).
 */

/** Blocca TUTTI gli invii Meta (operator + automatici). Emergenza. */
export function isWhatsAppOutboundDisabled(): boolean {
    return process.env.WHATSAPP_OUTBOUND_DISABLED === '1';
}

/**
 * Kill-switch automatici ordine (produzione).
 * Default se variabile assente: automatici ATTIVI (`false`).
 */
export function isWhatsAppAutoNotifyDisabled(): boolean {
    if (isWhatsAppOutboundDisabled()) return true;
    const flag = process.env.WHATSAPP_AUTO_NOTIFY_DISABLED?.trim().toLowerCase();
    if (!flag) return false; // unset → ON
    if (flag === '1' || flag === 'true' || flag === 'on') return true;
    if (flag === '0' || flag === 'false' || flag === 'off') return false;
    // Valore non riconosciuto: fail-safe OFF automatici
    console.warn(
        `[outbound-guards] WHATSAPP_AUTO_NOTIFY_DISABLED valore non valido "${flag}": tratto come disabled.`
    );
    return true;
}

/**
 * Automatici bloccati per questo ordine?
 * Sandbox (`isTest`): ignora AUTO_NOTIFY (test E2E), rispetta solo OUTBOUND_DISABLED.
 */
export function isWhatsAppAutoNotifyDisabledForOrder(
    isTest?: boolean | null
): boolean {
    if (isWhatsAppOutboundDisabled()) return true;
    if (isTest) return false;
    return isWhatsAppAutoNotifyDisabled();
}

/**
 * Ordini sandbox → Meta solo con opt-in esplicito.
 * Default (variabile assente): SKIP send Meta su isTest.
 */
export function shouldSkipTestOrderMetaSend(isTest: boolean | null | undefined): boolean {
    if (!isTest) return false;
    return process.env.WHATSAPP_ALLOW_TEST_SENDS !== '1';
}

/** Diagnostica env (niente segreti) per log/test readiness. */
export function getWhatsAppNotifyEnvDiagnostics(): {
    outboundDisabled: boolean;
    autoNotifyDisabled: boolean;
    autoNotifyRaw: string | null;
    allowTestSends: boolean;
    sandboxAutoNotifyBypass: true;
} {
    return {
        outboundDisabled: isWhatsAppOutboundDisabled(),
        autoNotifyDisabled: isWhatsAppAutoNotifyDisabled(),
        autoNotifyRaw: process.env.WHATSAPP_AUTO_NOTIFY_DISABLED?.trim() || null,
        allowTestSends: process.env.WHATSAPP_ALLOW_TEST_SENDS === '1',
        sandboxAutoNotifyBypass: true,
    };
}

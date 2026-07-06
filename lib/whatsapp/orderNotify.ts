/**
 * Notifica WhatsApp post-ordine — template Meta `floremoria_conferma_ordine_utente` (Punto B).
 * Invocata alla prima transizione a pagato (webhook Stripe). Set-and-Forget.
 */
import { runPuntoBCustomerOrderConfirm } from '@/lib/vera/orderWorkflow/puntoBCustomerConfirm';
import { isMetaCloudConfigured } from '@/lib/whatsapp/metaCloudApiClient';

export interface OrderWelcomeInput {
    id: string;
    orderNumber?: string | null;
    buyerFullName?: string | null;
    customerPhone?: string | null;
    deceasedName?: string | null;
    buyerEmail?: string | null;
}

export interface OrderWelcomeResult {
    ok: boolean;
    skipped?: string;
    channel?: 'meta_template' | 'skipped';
}

/** Testo anteprima dashboard / email (non inviato a Meta). */
export function renderOrderWelcomeText(name: string, deceased: string): string {
    const safeName = name || 'Utente';
    const safeDeceased = deceased || 'del Suo caro';
    return `Gentile ${safeName}, la ringraziamo per aver scelto di affidare a FloreMoria il ricordo di ${safeDeceased}. Da questo momento, ci prendiamo cura noi di ogni dettaglio con la massima dedizione.\nRiceverà la testimonianza fotografica non appena i fiori saranno posati.\nRestiamo a sua completa disposizione,\nLo Staff di FloreMoria 🌹`;
}

export async function sendOrderWelcomeWhatsApp(order: OrderWelcomeInput): Promise<OrderWelcomeResult> {
    if (!isMetaCloudConfigured()) {
        console.warn('[order-welcome] Meta Cloud API non configurata: Punto B saltato.');
        return { ok: false, skipped: 'meta_not_configured', channel: 'skipped' };
    }

    const result = await runPuntoBCustomerOrderConfirm(order.id);
    if (!result.ok) {
        return { ok: false, skipped: result.error ?? result.skipped, channel: 'skipped' };
    }

    return { ok: true, channel: 'meta_template' };
}

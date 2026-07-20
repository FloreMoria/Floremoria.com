/**
 * Notifica WhatsApp post-ordine.
 * La conferma presa in carico (Punto B / customer_order_confirm) NON parte al pagamento
 * né alla creazione manuale: solo quando lo stato passa a IN_PROGRESS
 * (vedi orderStatusFilter.onOrderStatusChanged).
 */
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

/**
 * @deprecated Il welcome cliente (Punto B) è spostato su IN_PROGRESS.
 * Mantenuto come no-op per compatibilità chiamanti legacy.
 */
export async function sendOrderWelcomeWhatsApp(order: OrderWelcomeInput): Promise<OrderWelcomeResult> {
    if (!isMetaCloudConfigured()) {
        return { ok: false, skipped: 'meta_not_configured', channel: 'skipped' };
    }
    console.info(
        `[order-welcome] Punto B non inviato al pagamento (ordine ${order.orderNumber || order.id}): deferred fino a IN_PROGRESS`
    );
    return { ok: true, skipped: 'puntoB_deferred_until_IN_PROGRESS', channel: 'skipped' };
}

/**
 * Notifica WhatsApp di benvenuto post-ordine (VERA su Twilio).
 *
 * Inviata UNA volta, alla prima transizione a "pagato" dell'ordine (gestita dal webhook Stripe).
 * È un messaggio business-initiated: in produzione WhatsApp obbliga a un Template approvato da Meta
 * (categoria Utility). Su Twilio = Content Template referenziato da un Content SID (HX...), inviato con
 * `contentSid` + `contentVariables`. Se il SID non è configurato, ricade su testo libero (utile solo per
 * i test in Sandbox: fuori dalla finestra 24h Twilio rifiuterà il testo libero).
 *
 * Principio Set-and-Forget: questa funzione NON lancia mai eccezioni verso il chiamante e non deve mai
 * bloccare il webhook Stripe né farlo ritentare.
 */
import twilio from 'twilio';
import { addMessage, updateSessionProfile } from '@/lib/chatStore';
import {
    isFuturiaConfigured,
    normalizeFuturiaPhone,
} from '@/lib/futuria/client';

/** Sottoinsieme strutturale dei campi Order necessari: disaccoppia dal tipo Prisma completo. */
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
    sid?: string;
    channel?: 'template' | 'freetext' | 'futuria_webhook';
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

/**
 * Normalizza un numero italiano (best-effort) in indirizzo WhatsApp Twilio: "whatsapp:+39XXXXXXXXXX".
 * Ritorna null se il numero non è plausibile.
 */
export function toWhatsAppAddress(raw: string | null | undefined): string | null {
    let p = (raw || '').replace(/[^\d+]/g, '').trim();
    if (!p) return null;
    if (p.startsWith('00')) p = `+${p.slice(2)}`;
    if (!p.startsWith('+')) {
        if (p.startsWith('39')) p = `+${p}`;
        else p = `+39${p}`; // default Italia
    }
    if (!/^\+\d{8,15}$/.test(p)) return null;
    return `whatsapp:${p}`;
}

/** Testo umano del benvenuto: usato come fallback (Sandbox) e per la registrazione in dashboard. */
export function renderOrderWelcomeText(name: string, deceased: string): string {
    const safeName = name || 'Utente';
    const safeDeceased = deceased || 'del Suo caro';
    return `Gentile ${safeName}, la ringraziamo per aver scelto di affidare a FloreMoria il ricordo di ${safeDeceased}. Da questo momento, ci prendiamo cura noi di ogni dettaglio con la massima dedizione.\nRiceverà la testimonianza fotografica non appena i fiori saranno posati.\nRestiamo a sua completa disposizione,\nLo Staff di FloreMoria 🌹`;
}

/** Registra in dashboard (chatStore) il messaggio inviato, senza mai bloccare l'invio. */
async function logToDashboard(toAddress: string, name: string, text: string, order: OrderWelcomeInput): Promise<void> {
    try {
        await addMessage(toAddress, 'OUTBOUND', text, undefined, {
            eventType: 'ORDER_WELCOME',
            orderId: order.id,
            ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
        });
        await updateSessionProfile(toAddress, {
            userType: 'UTENTE',
            ...(name ? { name } : {}),
        });
    } catch (e) {
        console.warn('[order-welcome] Registrazione in dashboard non riuscita (non bloccante):', e);
    }
}

/**
 * Invia il messaggio di benvenuto post-ordine. Idempotenza garantita dal chiamante
 * (webhook Stripe, solo alla prima transizione a PAID).
 * 
 * Se Futuria è configurato, il contatto è già sincronizzato dal webhook Stripe
 * (`syncPaidCustomerToFuturia`); qui si registra solo lo storico dashboard locale.
 */
export async function sendOrderWelcomeWhatsApp(order: OrderWelcomeInput): Promise<OrderWelcomeResult> {
    const name = (order.buyerFullName || '').trim();
    const deceased = (order.deceasedName || '').trim();
    const humanText = renderOrderWelcomeText(name, deceased);

    // Integrazione Futuria: sync contatto già eseguita in webhook Stripe (ingresso unico autorizzato).
    if (isFuturiaConfigured()) {
        const phone = normalizeFuturiaPhone(order.customerPhone);
        if (!phone) {
            console.warn(`[order-welcome] Telefono non valido su Futuria per ordine ${order.orderNumber || order.id}.`);
            return { ok: false, skipped: 'invalid_phone' };
        }

        try {
            const toAddress = `whatsapp:${phone}`;
            await logToDashboard(toAddress, name, humanText, order);
            console.info(
                `[order-welcome] Benvenuto registrato (Futuria già sincronizzato post-pagamento) ordine ${order.orderNumber || order.id}.`
            );
            return { ok: true, channel: 'futuria_webhook' };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[order-welcome] Registrazione dashboard fallita: ${msg}. Provo fallback Twilio...`);
        }
    }

    // Fallback: Twilio (se Futuria non è configurato o fallisce)
    if (!accountSid || !authToken) {
        console.warn('[order-welcome] Credenziali Twilio mancanti: invio saltato.');
        return { ok: false, skipped: 'twilio_not_configured' };
    }

    const toAddress = toWhatsAppAddress(order.customerPhone);
    if (!toAddress) {
        console.warn(`[order-welcome] Telefono assente/non valido per ordine ${order.orderNumber || order.id}: invio saltato.`);
        return { ok: false, skipped: 'invalid_phone' };
    }

    const templateSid = process.env.WHATSAPP_ORDER_WELCOME_TEMPLATE_SID?.trim();

    try {
        const client = twilio(accountSid, authToken);

        let channel: 'template' | 'freetext';
        let messageSid: string | undefined;

        if (templateSid) {
            const res = await client.messages.create({
                from: fromNumber,
                to: toAddress,
                contentSid: templateSid,
                contentVariables: JSON.stringify({ '1': name || 'Utente', '2': deceased || 'del Suo caro' }),
            });
            channel = 'template';
            messageSid = res.sid;
        } else {
            // Fallback solo per test in Sandbox: in produzione serve il Content SID approvato.
            console.warn('[order-welcome] WHATSAPP_ORDER_WELCOME_TEMPLATE_SID mancante: invio testo libero (valido solo in Sandbox/finestra 24h).');
            const res = await client.messages.create({
                from: fromNumber,
                to: toAddress,
                body: humanText,
            });
            channel = 'freetext';
            messageSid = res.sid;
        }

        await logToDashboard(toAddress, name, humanText, order);
        console.info(`[order-welcome] Inviato (${channel}) via Twilio per ordine ${order.orderNumber || order.id}, sid=${messageSid}`);
        return { ok: true, sid: messageSid, channel };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[order-welcome] Invio fallito via Twilio per ordine ${order.orderNumber || order.id}:`, msg);
        return { ok: false, skipped: 'send_failed' };
    }
}

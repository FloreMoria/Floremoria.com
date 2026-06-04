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

/** Sottoinsieme strutturale dei campi Order necessari: disaccoppia dal tipo Prisma completo. */
export interface OrderWelcomeInput {
    id: string;
    orderNumber?: string | null;
    buyerFullName?: string | null;
    customerPhone?: string | null;
    deceasedName?: string | null;
}

export interface OrderWelcomeResult {
    ok: boolean;
    skipped?: string;
    sid?: string;
    channel?: 'template' | 'freetext';
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
    return `Gentile ${safeName}, il suo ordine per la tomba di ${safeDeceased} è confermato. Le va bene ricevere le foto della posa direttamente qui su WhatsApp?`;
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
 */
export async function sendOrderWelcomeWhatsApp(order: OrderWelcomeInput): Promise<OrderWelcomeResult> {
    if (!accountSid || !authToken) {
        console.warn('[order-welcome] Credenziali Twilio mancanti: invio saltato.');
        return { ok: false, skipped: 'twilio_not_configured' };
    }

    const toAddress = toWhatsAppAddress(order.customerPhone);
    if (!toAddress) {
        console.warn(`[order-welcome] Telefono assente/non valido per ordine ${order.orderNumber || order.id}: invio saltato.`);
        return { ok: false, skipped: 'invalid_phone' };
    }

    const name = (order.buyerFullName || '').trim();
    const deceased = (order.deceasedName || '').trim();
    const templateSid = process.env.WHATSAPP_ORDER_WELCOME_TEMPLATE_SID?.trim();
    const humanText = renderOrderWelcomeText(name, deceased);

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
        console.info(`[order-welcome] Inviato (${channel}) per ordine ${order.orderNumber || order.id}, sid=${messageSid}`);
        return { ok: true, sid: messageSid, channel };
    } catch (e) {
        // Set-and-Forget: logghiamo e usciamo senza propagare l'errore al webhook.
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[order-welcome] Invio fallito per ordine ${order.orderNumber || order.id}:`, msg);
        return { ok: false, skipped: 'send_failed' };
    }
}

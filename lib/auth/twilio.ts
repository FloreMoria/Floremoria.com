import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const twilioSmsNumber = process.env.TWILIO_SMS_NUMBER; // Numero SMS dedicato se presente

/**
 * Normalizza il numero di telefono per l'invio.
 * Se non inizia con '+', assume il prefisso italiano '+39' se inizia con '3'.
 */
export function formatPhoneNumber(phone: string, type: 'whatsapp' | 'sms'): string {
    let cleaned = phone.replace(/[^0-9+]/g, ''); // Rimuove spazi, parentesi, trattini
    if (!cleaned.startsWith('+')) {
        if (cleaned.startsWith('39') && cleaned.length >= 11) {
            cleaned = '+' + cleaned;
        } else if (cleaned.startsWith('3') && (cleaned.length === 10 || cleaned.length === 9)) {
            cleaned = '+39' + cleaned;
        } else {
            cleaned = '+' + cleaned; // Fallback generico
        }
    }
    return type === 'whatsapp' ? `whatsapp:${cleaned}` : cleaned;
}

/**
 * Invia un messaggio WhatsApp tramite Twilio.
 */
export async function sendWhatsAppMessage(phone: string, text: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
    if (!accountSid || !authToken) {
        console.log(`[Twilio WhatsApp MOCK] To: ${phone} | Text: ${text}`);
        return { ok: true };
    }
    try {
        const client = twilio(accountSid, authToken);
        const recipient = formatPhoneNumber(phone, 'whatsapp');
        
        const message = await client.messages.create({
            body: text,
            from: twilioNumber,
            to: recipient,
        });
        
        return { ok: true, sid: message.sid };
    } catch (err: any) {
        console.error('[Twilio WhatsApp Send Error]:', err);
        return { ok: false, error: err.message };
    }
}

/**
 * Invia un SMS tramite Twilio.
 */
export async function sendSMSMessage(phone: string, text: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
    if (!accountSid || !authToken) {
        console.log(`[Twilio SMS MOCK] To: ${phone} | Text: ${text}`);
        return { ok: true };
    }
    try {
        const client = twilio(accountSid, authToken);
        const recipient = formatPhoneNumber(phone, 'sms');
        
        // Per gli SMS rimuove il prefisso 'whatsapp:' dal mittente se è configurato solo quello
        const sender = twilioSmsNumber || twilioNumber.replace('whatsapp:', '');
        
        const message = await client.messages.create({
            body: text,
            from: sender,
            to: recipient,
        });
        
        return { ok: true, sid: message.sid };
    } catch (err: any) {
        console.error('[Twilio SMS Send Error]:', err);
        return { ok: false, error: err.message };
    }
}

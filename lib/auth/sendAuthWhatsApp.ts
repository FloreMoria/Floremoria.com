import { sendWhatsAppTextMessage } from '@/lib/whatsapp/metaCloudApiClient';

/** Invio OTP o magic link via WhatsApp nativo (Meta Cloud API). */
export async function sendAuthWhatsAppMessage(
    phone: string,
    text: string
): Promise<{ ok: boolean; error?: string }> {
    const result = await sendWhatsAppTextMessage(phone, text);
    if (!result.ok) {
        return { ok: false, error: result.error || 'whatsapp_send_failed' };
    }
    return { ok: true };
}

import { NextResponse } from 'next/server';

// ============================================
// WHATSAPP & AI WEBHOOK ENDPOINT
// ============================================
// This webhook is prepared to receive inbound requests
// from Twilio or Meta WhatsApp Business APIs (text, media, location).

export async function POST(request: Request) {
    try {
        const payload = await request.json();

        // Log incoming webhook data for future debugging
        console.log('[WhatsApp Webhook IN] received payload:', JSON.stringify(payload));

        // TODO: Validate Meta/Twilio signature
        // TODO: Extract sender phone number and match with DB Partner.whatsappNumber
        // TODO: Pass message to LLM logic or assign to live operator

        // Acknowledge receipt to Webhook provider promptly
        return new NextResponse('Webhook Received', { status: 200 });

    } catch (error) {
        console.error('[WhatsApp Webhook ERR]', error);
        return new NextResponse('Internal Webhook Error', { status: 500 });
    }
}

/**
 * HELPER METOD: Send Outbound message
 * To be imported and executed from Services or triggers
 */
export async function sendWhatsAppMessage(partnerId: string, text: string, mediaUrl?: string) {
    // 1. Fetch partner info by partnerId from DB to get their whatsappNumber
    // 2. Call WhatsApp Business Cloud API or Twilio Client
    console.log(`[WhatsApp Outbound Mock] To: ${partnerId} | Msg: ${text} | Media: ${mediaUrl ?? 'null'}`);
    return true;
}

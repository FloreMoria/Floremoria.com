import { NextResponse } from 'next/server';
import twilio from 'twilio';

// The credentials will be loaded securely from .env on the server
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER; // Usually 'whatsapp:+14155238886' for sandbox

export async function POST(req: Request) {
  try {
    // Scaffold test for missing env
    if (!accountSid || !authToken || !twilioNumber) {
       return NextResponse.json(
         { success: false, error: 'Credenziali Twilio non trovate nel file .env. Compila TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_NUMBER.' }, 
         { status: 500 }
       );
    }

    const client = twilio(accountSid, authToken);

    // In a real scenario we parse the Request payload:
    // const body = await req.json();
    // const { toPhone, templateUrl, type } = body;
    
    // Hardcoded mock values for demonstration purposes (until DB logic fires this natively):
    const defaultRecipient = 'whatsapp:+393331234567'; // Must be formatted
    const bodyMessage = `Gentile cliente, come promesso ci siamo noi qui per lei. L'omaggio floreale selezionato è stato consegnato e allestito con la massima cura. Acceda al link per visionare la garanzia fotografica: [LINK_FOTO]`;

    const message = await client.messages.create({
      body: bodyMessage,
      from: twilioNumber,
      to: defaultRecipient
    });

    return NextResponse.json({ 
      success: true, 
      sid: message.sid,
      status: message.status
    });
    
  } catch (error: any) {
    console.error('Twilio Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

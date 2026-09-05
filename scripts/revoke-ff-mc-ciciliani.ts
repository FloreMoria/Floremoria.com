import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { sendWhatsAppTextMessage } from '../lib/whatsapp/metaCloudApiClient';

async function main() {
    const msg =
        "Gentile Carla, non tenere conto dell'incarico relativo all'ordine FF-MC-26-001: " +
        "l'assegnazione è stata ritirata in attesa di conferma staff. Grazie.";
    const send = await sendWhatsAppTextMessage('+393381040456', msg);
    console.log(send);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

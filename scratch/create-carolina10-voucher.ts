/**
 * Crea buono omaggio 10€ per Carolina e lo invia su WhatsApp.
 * npx tsx scratch/create-carolina10-voucher.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import prisma from '../lib/prisma';
import { sendWhatsAppTextMessage, normalizePhoneE164 } from '../lib/whatsapp/metaCloudApiClient';
import { addMessage, updateSessionProfile } from '../lib/chatStore';
import { buildContactInitials } from '../lib/whatsapp/sessionPhone';

async function main() {
    const code = 'CAROLINA10';
    const endsAt = new Date();
    endsAt.setMonth(endsAt.getMonth() + 3);

    const existing = await prisma.offer.findFirst({ where: { code } });
    let offer = existing;
    if (!offer) {
        offer = await prisma.offer.create({
            data: {
                name: 'Omaggio scusa Carolina — 10€',
                code,
                type: 'FIXED',
                value: 1000,
                maxUses: 1,
                endsAt,
                isActive: true,
                rulesJson: {
                    audience: 'single',
                    userEmail: 'varreis@gmail.com',
                    userName: 'Carolina Negrini Bertelli',
                    sendWhatsappLink: true,
                    whatsappNumber: '+393312134719',
                },
            },
        });
        console.log('Offer creato:', offer.id, offer.code);
    } else {
        offer = await prisma.offer.update({
            where: { id: offer.id },
            data: {
                isActive: true,
                deletedAt: null,
                value: 1000,
                type: 'FIXED',
                maxUses: 1,
                endsAt,
                rulesJson: {
                    audience: 'single',
                    userEmail: 'varreis@gmail.com',
                    userName: 'Carolina Negrini Bertelli',
                    sendWhatsappLink: true,
                    whatsappNumber: '+393312134719',
                },
            },
        });
        console.log('Offer aggiornato:', offer.id, offer.code);
    }

    const checkoutUrl = `https://www.floremoria.com/checkout?discountCode=${code}`;
    const text =
        `Gentile Carolina,\n` +
        `per il disguido sulle foto della consegna in ricordo di Elio, Le offriamo un buono omaggio di 10€.\n\n` +
        `Codice: ${code}\n` +
        `Può applicarlo qui: ${checkoutUrl}\n\n` +
        `Il codice è personale e valido per 3 mesi (un solo utilizzo).\n` +
        `Restiamo a Sua disposizione.\nStaff FloreMoria 🌹`;

    const phone = normalizePhoneE164('+393312134719')!;
    const send = await sendWhatsAppTextMessage(phone, text);
    console.log('WhatsApp:', send);
    if (send.ok) {
        const sessionPhone = `whatsapp:${phone}`;
        await updateSessionProfile(sessionPhone, {
            name: 'Carolina Negrini Bertelli',
            initials: buildContactInitials('Carolina Negrini Bertelli'),
            userType: 'UTENTE',
            welcomeSent: true,
        });
        await addMessage(sessionPhone, 'OUTBOUND', text, undefined, {
            source: 'operator',
            outboundMode: 'freetext',
            eventType: 'GIFT_VOUCHER',
            offerCode: code,
            ...(send.messageId ? { whatsAppMessageId: send.messageId } : {}),
        });
    }

    console.log('\nPronto.');
    console.log('Codice:', code);
    console.log('Link:', checkoutUrl);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

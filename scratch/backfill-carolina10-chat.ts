/**
 * Registra in chat DB il buono CAROLINA10 già inviato su WhatsApp (senza reinviare).
 * npx tsx scratch/backfill-carolina10-chat.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
process.env.FLOREM_CHAT_USE_DB = '1';

const SESSION = 'whatsapp:+393312134719';
const CODE = 'CAROLINA10';
const CHECKOUT = `https://www.floremoria.com/checkout?discountCode=${CODE}`;

const TEXT =
    `Gentile Carolina,\n` +
    `per il disguido sulle foto della consegna in ricordo di Elio, Le offriamo un buono omaggio di 10€.\n\n` +
    `Codice: ${CODE}\n` +
    `Può applicarlo qui: ${CHECKOUT}\n\n` +
    `Il codice è personale e valido per 3 mesi (un solo utilizzo).\n` +
    `Restiamo a Sua disposizione.\nStaff FloreMoria 🌹`;

async function main() {
    const { default: prisma } = await import('../lib/prisma');
    const { addMessage, getSession, updateSessionProfile } = await import('../lib/chatStore');
    const { buildContactInitials } = await import('../lib/whatsapp/sessionPhone');

    try {
        const session = await getSession(SESSION);
        const already = session.messages.some(
            (m) =>
                m.direction === 'OUTBOUND' &&
                (m.body.includes(CODE) ||
                    m.metadata?.offerCode === CODE ||
                    m.metadata?.eventType === 'GIFT_VOUCHER')
        );
        if (already) {
            console.log('Messaggio già presente in chat — skip.');
            return;
        }

        await updateSessionProfile(SESSION, {
            name: 'Carolina Negrini Bertelli',
            initials: buildContactInitials('Carolina Negrini Bertelli'),
            userType: 'UTENTE',
            welcomeSent: true,
        });

        await addMessage(SESSION, 'OUTBOUND', TEXT, undefined, {
            source: 'operator',
            outboundMode: 'freetext',
            eventType: 'GIFT_VOUCHER',
            offerCode: CODE,
            backfilled: 'true',
            note: 'Inviato su WhatsApp in precedenza; log chat recuperato.',
        });

        console.log('Backfill OK — apri Communications su Carolina per vedere il buono.');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

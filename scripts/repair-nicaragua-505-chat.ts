/**
 * Ripara sessione WhatsApp Nicaragua mal-prefissata (+39505… → +505…).
 * Eseguire: npx tsx scripts/repair-nicaragua-505-chat.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';
import { normalizePhoneE164 } from '../lib/whatsapp/metaCloudApiClient';
import { toWhatsAppSessionPhone } from '../lib/whatsapp/sessionPhone';
import { cleanupDeadAndDuplicateChatSessions } from '../lib/whatsapp/cleanupChatSessions';

const BAD = '+3950587013088';
const GOOD = '+50587013088';

async function main() {
    console.log('[repair-505] normalize', {
        raw: normalizePhoneE164('50587013088'),
        bad: normalizePhoneE164(BAD),
        good: normalizePhoneE164(GOOD),
    });

    const canonical = toWhatsAppSessionPhone(GOOD)!;
    const badKey = `whatsapp:${BAD}`;

    const sessions = await prisma.whatsAppChatSession.findMany({
        where: {
            OR: [
                { phone: badKey },
                { phone: canonical },
                { phone: { contains: '50587013088' } },
                { phone: { contains: '3950587013088' } },
            ],
        },
        include: { messages: { select: { id: true } } },
    });

    console.log(
        '[repair-505] sessions',
        sessions.map((s) => ({ id: s.id, phone: s.phone, name: s.name, msgs: s.messages.length })),
    );

    let keeper = sessions.find((s) => s.phone === canonical);
    const bad = sessions.find((s) => s.phone === badKey || s.phone.includes('3950587013088'));

    if (bad && !keeper) {
        await prisma.whatsAppChatSession.update({
            where: { id: bad.id },
            data: { phone: canonical },
        });
        keeper = { ...bad, phone: canonical };
        console.log('[repair-505] renamed', badKey, '→', canonical, `(name kept: ${bad.name})`);
    } else if (bad && keeper && bad.id !== keeper.id) {
        if (bad.messages.length > 0) {
            await prisma.whatsAppChatMessage.updateMany({
                where: { sessionId: bad.id },
                data: { sessionId: keeper.id },
            });
        }
        await prisma.whatsAppChatSession.delete({ where: { id: bad.id } });
        console.log('[repair-505] merged', badKey, '→', canonical);
    } else if (!bad && !keeper) {
        console.warn('[repair-505] nessuna sessione da riparare');
    } else {
        console.log('[repair-505] già ok');
    }

    // Nome: profilo Meta era "Oscar Delgadillo" (stesso cliente, secondo numero NI).
    // Non forzare rename: se coincide con ordine FF-MC-26-001 è coerente; resta traccia separata per numero.
    if (keeper) {
        const last = await prisma.whatsAppChatMessage.findFirst({
            where: { sessionId: keeper.id },
            orderBy: { createdAt: 'desc' },
        });
        await prisma.whatsAppChatSession.update({
            where: { id: keeper.id },
            data: {
                phone: canonical,
                ...(last
                    ? { lastMessage: last.body, updatedAt: new Date() }
                    : {}),
            },
        });
    }

    const cleanup = await cleanupDeadAndDuplicateChatSessions({ dryRun: false });
    console.log('[repair-505] cleanup', {
        merged: cleanup.mergedGroups,
        renames: cleanup.renames,
        moved: cleanup.messagesMoved,
    });
    console.log('[repair-505] done');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

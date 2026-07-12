import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function pickDatabaseUrl(): string | null {
    const candidates = [
        process.env.DATABASE_URL_UNPOOLED,
        process.env.DATABASE_POSTGRES_URL_NON_POOLING,
        process.env.DATABASE_POSTGRES_PRISMA_URL,
        process.env.DATABASE_POSTGRES_URL,
        process.env.DATABASE_URL,
    ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    const neon = candidates.find((value) => /neon\.tech|vercel-storage\.com/i.test(value));
    if (neon) return neon;

    const nonLocal = candidates.find((value) => !/localhost|127\.0\.0\.1/i.test(value));
    return nonLocal ?? candidates[0] ?? null;
}

function loadProductionEnv(): void {
    const existingDatabaseUrl = pickDatabaseUrl();
    if (existingDatabaseUrl) {
        process.env.DATABASE_URL = existingDatabaseUrl;
        return;
    }

    const envPath = resolve(process.cwd(), '.env.vercel.production');
    if (!existsSync(envPath)) {
        console.error(
            'DATABASE_URL assente. Usa: npx vercel env run --environment production -- npx tsx scratch/resend-waiting-update.ts <ordine>'
        );
        process.exit(1);
    }

    delete process.env.DATABASE_URL;
    const parsed = config({ path: envPath, override: true });
    if (parsed.error) {
        console.error('Errore lettura .env.vercel.production:', parsed.error.message);
        process.exit(1);
    }

    const databaseUrl = pickDatabaseUrl();

    if (!databaseUrl) {
        console.error(
            'Nessuna DATABASE_URL trovata. Esegui con: npx vercel env run --environment production -- npx tsx scratch/resend-waiting-update.ts <ordine>'
        );
        process.exit(1);
    }

    process.env.DATABASE_URL = databaseUrl;
}

const ORDER_NUMBER = process.argv[2] || 'FT-CO-26-005';

async function main() {
    loadProductionEnv();

    const prisma = (await import('../lib/prisma')).default;
    const { extractFirstNameFromProfile } = await import('../lib/vera/genderFromName');
    const { sendVeraTemplate } = await import('../lib/whatsapp/sendVeraTemplate');
    const { buildCustomerWaitingUpdateParams } = await import('../lib/whatsapp/veraTemplateParams');
    const { normalizePhoneE164 } = await import('../lib/whatsapp/metaCloudApiClient');
    const { parseWorkflowFlags, markWorkflowStep } = await import('../lib/vera/orderWorkflow/types');

    const order = await prisma.order.findFirst({
        where: { orderNumber: ORDER_NUMBER, deletedAt: null },
        include: { user: { select: { name: true } } },
    });

    if (!order) {
        console.error(`Ordine non trovato su DB produzione: ${ORDER_NUMBER}`);
        process.exit(1);
    }

    const phoneE164 = normalizePhoneE164(order.customerPhone);
    if (!phoneE164) {
        console.error(`Telefono non valido: ${order.customerPhone}`);
        process.exit(1);
    }

    const name = extractFirstNameFromProfile(order.user?.name || order.buyerFullName);
    const bodyParams = buildCustomerWaitingUpdateParams({
        buyerFirstName: name,
        deceasedName: order.deceasedName,
    });

    console.log('Invio aggiornamento attesa...', {
        orderNumber: order.orderNumber,
        phoneE164,
        buyerFirstName: bodyParams[0],
        deceasedName: bodyParams[1],
        template: 'customer_waiting_update',
    });

    const send = await sendVeraTemplate(phoneE164, 'customer_waiting_update', bodyParams);
    console.log('Risultato:', JSON.stringify(send, null, 2));

    if (!send.ok) process.exit(1);

    const flags = parseWorkflowFlags(order.veraWorkflowFlags);
    await prisma.order.update({
        where: { id: order.id },
        data: { veraWorkflowFlags: markWorkflowStep(flags, 'puntoG_customer_wait') },
    });
    console.log('Flag puntoG_customer_wait aggiornato.');
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

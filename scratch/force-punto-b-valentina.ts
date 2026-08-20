/**
 * Invio forzato Punto B per FT-RC-26-002 (Valentina Cecchini).
 * Uso: npx tsx scratch/force-punto-b-valentina.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prisma from '../lib/prisma';
import { runPuntoBCustomerOrderConfirm } from '../lib/vera/orderWorkflow/puntoBCustomerConfirm';

for (const name of ['.env', '.env.local']) {
    const p = resolve(process.cwd(), name);
    try {
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const i = t.indexOf('=');
            if (i === -1) continue;
            const k = t.slice(0, i).trim();
            let v = t.slice(i + 1).trim();
            if (
                (v.startsWith('"') && v.endsWith('"')) ||
                (v.startsWith("'") && v.endsWith("'"))
            ) {
                v = v.slice(1, -1);
            }
            if (process.env[k] === undefined) process.env[k] = v;
        }
    } catch {
        /* missing */
    }
}

if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

async function main(): Promise<void> {
    const orderNumber = process.argv[2] || 'FT-RC-26-002';
    const order = await prisma.order.findFirst({
        where: { orderNumber, deletedAt: null },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            customerPhone: true,
            buyerFullName: true,
            veraWorkflowFlags: true,
        },
    });

    if (!order) {
        console.error('Ordine non trovato:', orderNumber);
        process.exit(1);
    }

    console.log('Ordine:', order);
    const result = await runPuntoBCustomerOrderConfirm(order.id, {
        force: true,
        bypassSchedule: true,
    });
    console.log('Risultato Punto B:', result);

    const after = await prisma.order.findUnique({
        where: { id: order.id },
        select: { veraWorkflowFlags: true },
    });
    console.log('Flags dopo:', after?.veraWorkflowFlags);
    process.exit(result.ok ? 0 : 2);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

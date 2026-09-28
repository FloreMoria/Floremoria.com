import prisma from '@/lib/prisma';

const QR_FEE_KEY = 'florist_network.qr_fee_cents';
const DEFAULT_QR_FEE_CENTS = 500;

/**
 * Fee QR da SystemState (congelata sull'ordine al pagamento).
 * Mai hardcodare la tariffa nel codice di calcolo business — solo fallback di sicurezza.
 */
export async function readQrFeeCentsFromConfig(): Promise<number> {
    const row = await prisma.systemState.findUnique({
        where: { key: QR_FEE_KEY },
        select: { value: true },
    });
    const n = Number.parseInt((row?.value || '').trim(), 10);
    if (Number.isFinite(n) && n >= 0) return n;
    console.warn(`[florist-network] ${QR_FEE_KEY} assente/invalido → fallback ${DEFAULT_QR_FEE_CENTS}`);
    return DEFAULT_QR_FEE_CENTS;
}

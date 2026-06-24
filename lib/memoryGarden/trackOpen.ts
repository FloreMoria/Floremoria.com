import prisma from '@/lib/prisma';

function clientIp(request: Request): string | null {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const realIp = request.headers.get('x-real-ip')?.trim();
    return forwarded || realIp || null;
}

/**
 * Registra l'apertura del link Giardino della Memoria / bacheca foto consegna.
 * Non blocca il redirect in caso di errore DB.
 */
export async function recordMemoryGardenOpen(
    orderId: string,
    request: Request,
    buyer?: { email?: string | null; name?: string | null }
): Promise<void> {
    try {
        await prisma.memoryGardenOpen.create({
            data: {
                orderId,
                buyerEmail: buyer?.email?.trim() || null,
                buyerName: buyer?.name?.trim() || null,
                userAgent: request.headers.get('user-agent')?.slice(0, 512) || null,
                ipAddress: clientIp(request),
            },
        });
    } catch (error) {
        console.error('[memory-garden] Impossibile registrare apertura link:', error);
    }
}

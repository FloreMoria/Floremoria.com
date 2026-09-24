import prisma from '@/lib/prisma';

export type HeadersLike =
    | {
          get(name: string): string | null;
      }
    | Request;

function extractHeader(reqOrHeaders?: HeadersLike | Request | null, name: string = ''): string | null {
    if (!reqOrHeaders) return null;
    if ('headers' in reqOrHeaders && typeof (reqOrHeaders as Request).headers?.get === 'function') {
        return (reqOrHeaders as Request).headers.get(name);
    }
    if (typeof (reqOrHeaders as Headers).get === 'function') {
        return (reqOrHeaders as Headers).get(name);
    }
    return null;
}

function clientIp(reqOrHeaders?: HeadersLike | Request | null): string | null {
    if (!reqOrHeaders) return null;
    const forwarded = extractHeader(reqOrHeaders, 'x-forwarded-for')?.split(',')[0]?.trim();
    const realIp = extractHeader(reqOrHeaders, 'x-real-ip')?.trim();
    return forwarded || realIp || null;
}

/**
 * Registra l'apertura del link Giardino della Memoria / bacheca foto consegna.
 * Supporta sia oggetti Request (Route Handlers) che Headers di Next.js (Server Components).
 * Non blocca la navigazione/render in caso di errore DB.
 */
export async function recordMemoryGardenOpen(
    orderId: string,
    requestOrHeaders?: HeadersLike | Request | null,
    buyer?: { email?: string | null; name?: string | null }
): Promise<void> {
    try {
        let buyerEmail = buyer?.email?.trim() || null;
        let buyerName = buyer?.name?.trim() || null;

        if (!buyerEmail || !buyerName) {
            const order = await prisma.order.findUnique({
                where: { id: orderId },
                select: { buyerEmail: true, buyerFullName: true },
            });
            if (order) {
                buyerEmail = buyerEmail || order.buyerEmail || null;
                buyerName = buyerName || order.buyerFullName || null;
            }
        }

        await prisma.memoryGardenOpen.create({
            data: {
                orderId,
                buyerEmail,
                buyerName,
                userAgent: extractHeader(requestOrHeaders, 'user-agent')?.slice(0, 512) || null,
                ipAddress: clientIp(requestOrHeaders),
            },
        });
    } catch (error) {
        console.error('[memory-garden] Impossibile registrare apertura link:', error);
    }
}


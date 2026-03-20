import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limitStr = searchParams.get('limit');
        const limit = limitStr ? parseInt(limitStr, 10) : 50;

        const products = await prisma.product.findMany({
            where: {
                isActive: true
            },
            select: {
                id: true,
                name: true,
                basePriceCents: true,
                mediaUrl: true,
                isActive: true
            },
            take: limit
        });

        // Configura un path di base, di default https://floremoria.com
        const baseUrl = 'https://floremoria.eu';

        const payload = products.map(p => {
            let absoluteMediaUrl = null;
            if (p.mediaUrl) {
                if (p.mediaUrl.startsWith('http')) {
                    absoluteMediaUrl = p.mediaUrl;
                } else {
                    absoluteMediaUrl = `${baseUrl}${p.mediaUrl.startsWith('/') ? '' : '/'}${p.mediaUrl}`;
                }
            }

            return {
                id: p.id,
                nome_prodotto: p.name,
                prezzo: p.basePriceCents / 100,
                mediaUrl: absoluteMediaUrl,
                disponibilita: p.isActive,
            };
        });

        return NextResponse.json({
            status: "success",
            data: payload
        }, {
            headers: {
                // Header per abilitare CORS read-only (pubblico per partner API)
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        });
    } catch (error) {
        console.error("Partner API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

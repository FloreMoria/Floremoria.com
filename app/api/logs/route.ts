import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const filter = searchParams.get('filter');

        const excludeFilter = {
            NOT: {
                OR: [
                    { tag: { contains: 'POSTMAN_ASSISTENZA', mode: 'insensitive' as const } },
                    { tag: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { topic: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { shortSummary: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { keyPrompt: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { fullText: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                    { discussedPoints: { contains: 'assistenza@floremoria.com', mode: 'insensitive' as const } },
                ]
            }
        };

        const latestLogs = await prisma.floremoriaLog.findMany({
            where: filter
                ? { AND: [{ tag: { contains: filter, mode: 'insensitive' } }, excludeFilter] }
                : excludeFilter,
            orderBy: [
                { sessionDate: 'desc' },
                { id: 'desc' }
            ],
            take: 20
        });

        if (!latestLogs || latestLogs.length === 0) {
            return NextResponse.json([]);
        }

        // Safety verification for truncation/serialization (JSON Circular or UTF-8 bombs)
        try {
            JSON.stringify(latestLogs);
        } catch (serializationError) {
            console.error("API LOG ERROR: Truncation or Serialization failed. Invalid characters or circular references detected.", serializationError);
        }

        return NextResponse.json(latestLogs);
    } catch (e: any) {
        console.error("Error fetching logs:", e);
        // Fallback to empty clean array as requested
        return NextResponse.json([]);
    }
}

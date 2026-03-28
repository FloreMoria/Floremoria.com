import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const filter = searchParams.get('filter');

        const latestLogs = await prisma.floremoriaLog.findMany({
            where: filter ? { tag: { contains: filter, mode: 'insensitive' } } : {},
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

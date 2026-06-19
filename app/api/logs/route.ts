import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { floremoriaLogPublicWhere } from '@/lib/floremoriaLogFilters';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const filter = searchParams.get('filter');

        const where = filter
            ? floremoriaLogPublicWhere({
                  tag: { contains: filter, mode: 'insensitive' },
              })
            : floremoriaLogPublicWhere();

        const latestLogs = await prisma.floremoriaLog.findMany({
            where,
            orderBy: [{ sessionDate: 'desc' }, { id: 'desc' }],
            take: 20,
        });

        if (!latestLogs || latestLogs.length === 0) {
            return NextResponse.json([]);
        }

        try {
            JSON.stringify(latestLogs);
        } catch (serializationError) {
            console.error(
                'API LOG ERROR: Truncation or Serialization failed.',
                serializationError
            );
        }

        return NextResponse.json(latestLogs);
    } catch (e: unknown) {
        console.error('Error fetching logs:', e);
        return NextResponse.json([]);
    }
}

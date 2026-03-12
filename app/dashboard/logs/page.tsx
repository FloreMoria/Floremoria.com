import { FloremoriaLog } from '@prisma/client';
import prisma from '@/lib/prisma';
import ClientLogsTable from './ClientLogsTable';

export const metadata = {
    title: 'Log di Sistema | Floremoria Admin',
};

export default async function SystemLogsPage({
    searchParams
}: {
    searchParams: { q?: string }
}) {
    const q = searchParams.q || '';

    let logs: FloremoriaLog[] = [];

    if (q) {
        logs = await prisma.floremoriaLog.findMany({
            where: {
                OR: [
                    { tag: { contains: q, mode: 'insensitive' } },
                    { topic: { contains: q, mode: 'insensitive' } },
                    { shortSummary: { contains: q, mode: 'insensitive' } },
                    { keyPrompt: { contains: q, mode: 'insensitive' } },
                ]
            },
            orderBy: {
                sessionDate: 'desc'
            }
        });
    } else {
        logs = await prisma.floremoriaLog.findMany({
            orderBy: {
                sessionDate: 'desc'
            }
        });
    }

    return (
        <div className="p-8 pb-32 max-w-7xl mx-auto space-y-8 fade-in">
            <ClientLogsTable initialLogs={logs} initialQuery={q} />
        </div>
    );
}

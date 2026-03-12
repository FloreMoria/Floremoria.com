import { FloremoriaLog } from '@prisma/client';
import prisma from '@/lib/prisma';
import ClientLogsTable from './ClientLogsTable';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

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
        <div className="p-8 pb-32 max-w-7xl mx-auto space-y-6 fade-in">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-all">
                <ArrowLeft size={16} /> Torna alla Overview
            </Link>
            <ClientLogsTable initialLogs={logs} initialQuery={q} />
        </div>
    );
}

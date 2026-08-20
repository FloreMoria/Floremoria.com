import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { listBankStatements } from '@/lib/financial/bankStatements/store';

export async function GET() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    try {
        const documents = await listBankStatements();
        return NextResponse.json({ ok: true, documents });
    } catch (error) {
        console.error('[bank-statements GET]', error);
        return NextResponse.json(
            { ok: false, error: 'Impossibile caricare l\'archivio rendiconti' },
            { status: 500 }
        );
    }
}

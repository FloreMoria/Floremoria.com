import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * METODO §2 — ingresso testo/incolla chiuso.
 * Usare POST /api/dashboard/finance/bank-statements/upload con file ufficiale banca.
 */
export async function POST() {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    return NextResponse.json(
        {
            ok: false,
            error:
                'Incolla movimenti disabilitato (METODO dossier fiscale §2). Carica esclusivamente il file ufficiale scaricato dal portale della banca (PDF, CSV o Excel) con saldo iniziale e finale dichiarati.',
            code: 'FINECO_PASTE_DISABLED',
        },
        { status: 410 }
    );
}

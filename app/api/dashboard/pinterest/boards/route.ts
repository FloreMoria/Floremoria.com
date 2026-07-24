import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import { getPinterestDefaultBoardId } from '@/lib/pinterest/oauth';
import { getPinterestConnectionStatus } from '@/src/agents/platforms/pinterestTokenService';
import { listPinterestBoards } from '@/src/agents/platforms/pinterestPublisher';

export const runtime = 'nodejs';

/**
 * GET /api/dashboard/pinterest/boards
 * Elenca le bacheche dell’account collegato (serve a copiare PINTEREST_BOARD_ID).
 */
export async function GET() {
    const cookieStore = await cookies();
    const role = cookieStore.get('fm_user_role')?.value;
    if (!isDashboardAdminRole(role)) {
        return NextResponse.json(
            { success: false, message: 'Non autorizzato. Solo staff dashboard.' },
            { status: 403 }
        );
    }

    const status = await getPinterestConnectionStatus();
    if (!status.connected) {
        return NextResponse.json(
            {
                success: false,
                message: 'Pinterest non collegato. Apri /api/auth/pinterest/login.',
            },
            { status: 400 }
        );
    }

    const { boards, error } = await listPinterestBoards();
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 502 });
    }

    return NextResponse.json({
        success: true,
        configuredBoardId: getPinterestDefaultBoardId(),
        scopes: status.scope,
        boards,
    });
}

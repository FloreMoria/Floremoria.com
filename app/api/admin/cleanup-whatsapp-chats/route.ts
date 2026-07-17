import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { isSuperAdminRole } from '@/lib/superAdmin';
import { cleanupDeadAndDuplicateChatSessions } from '@/lib/whatsapp/cleanupChatSessions';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/admin/cleanup-whatsapp-chats
 * Body: { dryRun?: boolean } — default dryRun=true. Solo SUPER_ADMIN può applicare.
 */
export async function POST(req: Request) {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    if (!isSuperAdminRole(auth.role)) {
        return NextResponse.json({ success: false, error: 'Solo SUPER_ADMIN.' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const dryRun = body?.dryRun !== false && body?.apply !== true;
        const result = await cleanupDeadAndDuplicateChatSessions({ dryRun });
        return NextResponse.json({ success: true, dryRun, ...result });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[cleanup-whatsapp-chats]', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

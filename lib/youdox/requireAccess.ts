/**
 * Auth guard per route YouDOX sotto /api/v1/finance/youdox/*.
 * Staff dashboard oppure x-admin-key (cron/Set-and-Forget).
 */

import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { hasValidAdminApiKeyHeader } from '@/lib/auth/verbaleSyncAuth';

export async function requireYoudoxApiAccess(request: Request): Promise<
    | { ok: true; via: 'session' | 'admin_key' }
    | { ok: false; response: NextResponse }
> {
    if (hasValidAdminApiKeyHeader(request.headers.get('x-admin-key'))) {
        return { ok: true, via: 'admin_key' };
    }
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return { ok: false, response: auth.response };
    return { ok: true, via: 'session' };
}

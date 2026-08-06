/**
 * Diagnostica visibilità post Facebook Page (Development Mode / app mismatch).
 * Accesso: /api/admin/facebook-visibility — Super Admin.
 */
import { NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/superAdminAuth';
import { diagnoseFacebookPostVisibility } from '@/lib/postman/facebookVisibilityCheck';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireSuperAdminApi();
  if (denied) return denied;

  try {
    const diagnosis = await diagnoseFacebookPostVisibility();
    return NextResponse.json({ success: true, diagnosis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[facebook-visibility]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

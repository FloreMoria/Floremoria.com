import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isDashboardAdminRole } from '@/lib/superAdmin';
import { hasValidAdminApiKeyHeader } from '@/lib/auth/verbaleSyncAuth';
import {
  sendOfferWhatsApp,
  type OfferSendDuration,
} from '@/lib/offers/sendOfferWhatsApp';

export const runtime = 'nodejs';

async function requireOffersApiAuth(request: Request): Promise<NextResponse | null> {
  if (hasValidAdminApiKeyHeader(request.headers.get('x-admin-key'))) {
    return null;
  }
  const cookieStore = await cookies();
  const role = cookieStore.get('fm_user_role')?.value;
  if (isDashboardAdminRole(role)) {
    return null;
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const DURATIONS = new Set(['1w', '1m', '3m', '6m', '1y']);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requireOffersApiAuth(request);
  if (denied) return denied;

  const { id: offerId } = await context.params;

  try {
    const body = await request.json();
    const phoneRaw = String(body?.phoneRaw ?? body?.whatsappNumber ?? '').trim();
    const duration = String(body?.duration ?? '6m') as OfferSendDuration;
    if (!DURATIONS.has(duration)) {
      return NextResponse.json(
        { ok: false, error: 'Durata non valida. Usi 1w, 1m, 3m, 6m o 1y.' },
        { status: 400 }
      );
    }
    if (!phoneRaw) {
      return NextResponse.json(
        { ok: false, error: 'Inserisca il numero WhatsApp del destinatario.' },
        { status: 400 }
      );
    }

    const result = await sendOfferWhatsApp({
      offerId,
      phoneRaw,
      duration,
      recipientName: typeof body?.recipientName === 'string' ? body.recipientName : null,
      recipientEmail: typeof body?.recipientEmail === 'string' ? body.recipientEmail : null,
      userId: typeof body?.userId === 'string' ? body.userId : null,
      forceTemplate: body?.forceTemplate === true,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

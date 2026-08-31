import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { runFloristScoutForOrder } from '@/lib/ai/floristScoutOrder';
import {
  buildFloristDirectoryUrl,
  buildFloristScoutGoogleMapsUrl,
} from '@/lib/ai/floristScoutMaps';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const force = body.force !== false;

    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        partnerId: true,
        cemeteryName: true,
        cemeteryCity: true,
        gravePosition: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!order) {
      return NextResponse.json({ ok: false, error: 'Ordine non trovato' }, { status: 404 });
    }
    if (order.partnerId) {
      return NextResponse.json(
        { ok: false, error: 'Ordine già assegnato a un fiorista partner.' },
        { status: 409 }
      );
    }

    const result = await runFloristScoutForOrder(id, { force });

    const googleMapsUrl = buildFloristScoutGoogleMapsUrl(order);
    const partnerDirectoryUrl = buildFloristDirectoryUrl(order);

    return NextResponse.json({
      ok: true,
      ran: result.ran,
      reason: result.reason,
      recommendations: result.recommendations,
      scout: result.scout || null,
      googleMapsUrl,
      partnerDirectoryUrl,
      message:
        result.recommendations > 0
          ? `Trovati ${result.recommendations} fioristi vicino al cimitero.`
          : 'Nessun candidato con telefono verificato. Apri Google Maps o la directory partner.',
    });
  } catch (error) {
    console.error('[orders scout POST]', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Ricerca fioristi fallita',
      },
      { status: 500 }
    );
  }
}

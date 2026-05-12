import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normalizeOfferCode, resolveOfferDiscount } from '@/lib/discounts';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = normalizeOfferCode(String(body?.code ?? ''));
    const subtotalCents = Number(body?.subtotalCents ?? 0);
    const buyerEmail = String(body?.buyerEmail ?? '');
    const buyerFullName = String(body?.buyerFullName ?? '');

    if (!code) {
      return NextResponse.json({ ok: false, error: 'Inserisci un codice sconto.' }, { status: 400 });
    }

    const offer = await prisma.offer.findFirst({
      where: {
        deletedAt: null,
        code: code,
      },
    });

    if (!offer) {
      return NextResponse.json({ ok: false, error: 'Codice sconto non trovato.' }, { status: 404 });
    }

    const usageCount = await prisma.offerRedemption.count({
      where: { offerId: offer.id },
    });

    const resolution = resolveOfferDiscount({
      offer,
      subtotalCents,
      buyerEmail,
      buyerFullName,
      usageCount,
    });

    if (!resolution.ok) {
      return NextResponse.json({ ok: false, error: resolution.reason ?? 'Codice non valido.' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      code,
      offerName: offer.name,
      discountCents: resolution.discountCents,
      finalTotalCents: resolution.finalTotalCents,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

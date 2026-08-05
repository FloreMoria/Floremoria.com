import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  findOfferGrantForBuyer,
  normalizeOfferCode,
  resolveOfferDiscount,
} from '@/lib/discounts';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = normalizeOfferCode(String(body?.code ?? ''));
    const subtotalCents = Number(body?.subtotalCents ?? 0);
    const buyerEmail = String(body?.buyerEmail ?? '');
    const buyerFullName = String(body?.buyerFullName ?? '');
    const buyerPhone = String(body?.buyerPhone ?? '');

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

    const grant = await findOfferGrantForBuyer({
      prisma,
      offerId: offer.id,
      buyerPhone,
      buyerEmail,
    });

    const grantCount = await prisma.offerGrant.count({
      where: { offerId: offer.id },
    });
    if (grantCount > 0 && !grant) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Questo buono è personale: inserisca nel checkout lo stesso numero WhatsApp a cui è stato inviato.',
        },
        { status: 400 }
      );
    }

    const usageCount = await prisma.offerRedemption.count({
      where: { offerId: offer.id },
    });

    const normalizedEmail = buyerEmail.trim().toLowerCase();
    const userUsageCount = normalizedEmail
      ? await prisma.offerRedemption.count({
          where: {
            offerId: offer.id,
            buyerEmail: { equals: normalizedEmail, mode: 'insensitive' },
          },
        })
      : 0;

    const grantUsageCount = grant
      ? await prisma.offerRedemption.count({ where: { grantId: grant.id } })
      : 0;

    const resolution = resolveOfferDiscount({
      offer,
      subtotalCents,
      buyerEmail,
      buyerFullName,
      buyerPhone,
      usageCount,
      userUsageCount,
      grant,
      grantUsageCount,
    });

    if (!resolution.ok) {
      return NextResponse.json(
        { ok: false, error: resolution.reason ?? 'Codice non valido.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      code,
      offerName: offer.name,
      discountCents: resolution.discountCents,
      finalTotalCents: resolution.finalTotalCents,
      grantId: resolution.grantId ?? null,
      grantEndsAt: grant?.endsAt?.toISOString() ?? null,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

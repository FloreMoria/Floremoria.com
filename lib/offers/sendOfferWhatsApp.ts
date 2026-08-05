/**
 * Assegna un buono a un numero WhatsApp (scadenza personale) e invia il messaggio.
 */
import prisma from '@/lib/prisma';
import { computeOfferEndsAt, normalizeOfferCode } from '@/lib/discounts';
import { normalizePhoneE164 } from '@/lib/whatsapp/metaCloudApiClient';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendWhatsAppMessage';
import { toWhatsAppSessionPhone } from '@/lib/whatsapp/sessionPhone';
import { extractFirstName } from '@/lib/whatsapp/proactiveTemplateParams';
import { addMessage, updateSessionProfile } from '@/lib/chatStore';
import { buildContactInitials } from '@/lib/whatsapp/sessionPhone';
import { buildOutboundWamidMetadata } from '@/lib/whatsapp/normalizeWamid';

export type OfferSendDuration = '1w' | '1m' | '3m' | '6m' | '1y';

export type SendOfferWhatsAppInput = {
  offerId: string;
  phoneRaw: string;
  duration: OfferSendDuration;
  recipientName?: string | null;
  recipientEmail?: string | null;
  userId?: string | null;
  /** Se true, forza solo template Meta (fuori finestra). Default: free-text + fallback template. */
  forceTemplate?: boolean;
};

export type SendOfferWhatsAppResult =
  | {
      ok: true;
      grantId: string;
      endsAt: string;
      phoneE164: string;
      checkoutUrl: string;
      messageId?: string;
      fallbackExecuted?: boolean;
    }
  | { ok: false; error: string };

function durationLabel(duration: OfferSendDuration): string {
  switch (duration) {
    case '1w':
      return '1 settimana';
    case '1m':
      return '1 mese';
    case '3m':
      return '3 mesi';
    case '6m':
      return '6 mesi';
    case '1y':
      return '1 anno';
  }
}

function formatOfferValue(type: 'PERCENT' | 'FIXED', value: number): string {
  if (type === 'PERCENT') return `${value}%`;
  return `€${(value / 100).toFixed(2).replace('.', ',')}`;
}

function buildCheckoutUrl(code: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, '') ||
    'https://www.floremoria.com';
  return `${base}/checkout?discountCode=${encodeURIComponent(code)}`;
}

function buildVoucherMessage(input: {
  firstName: string;
  code: string;
  valueLabel: string;
  duration: OfferSendDuration;
  endsAt: Date;
  checkoutUrl: string;
}): string {
  const endsLabel = input.endsAt.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  });
  const greeting = input.firstName ? `Gentile ${input.firstName}` : 'Gentile';
  return (
    `${greeting},\n\n` +
    `Le offriamo un buono sconto FloreMoria di ${input.valueLabel}.\n` +
    `Codice: *${input.code}*\n` +
    `Validità per Lei: ${durationLabel(input.duration)} (scade il ${endsLabel}).\n\n` +
    `Può applicarlo al checkout qui:\n${input.checkoutUrl}\n\n` +
    `Con cura,\nLo Staff di FloreMoria`
  );
}

export async function sendOfferWhatsApp(
  input: SendOfferWhatsAppInput
): Promise<SendOfferWhatsAppResult> {
  const phoneE164 = normalizePhoneE164(input.phoneRaw);
  if (!phoneE164) {
    return { ok: false, error: 'Numero WhatsApp non valido. Usi il formato internazionale, es. +393331112222.' };
  }

  const offer = await prisma.offer.findFirst({
    where: { id: input.offerId, deletedAt: null },
  });
  if (!offer) return { ok: false, error: 'Buono sconto non trovato.' };
  if (!offer.isActive) return { ok: false, error: 'Il buono è disattivo: attivilo prima di inviarlo.' };
  if (!offer.code) return { ok: false, error: 'Il buono non ha un codice applicabile.' };

  const code = normalizeOfferCode(offer.code);
  const endsAt = computeOfferEndsAt(input.duration);
  const startsAt = new Date();

  // Collega anagrafica se manca userId ma c'è telefono/email.
  let userId = input.userId?.trim() || null;
  let recipientName = input.recipientName?.trim() || null;
  let recipientEmail = input.recipientEmail?.trim().toLowerCase() || null;

  if (!userId) {
    const phoneDigits = phoneE164.replace(/\D/g, '');
    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { phone: phoneE164 },
          { phone: { contains: phoneDigits.slice(-9) } },
          ...(recipientEmail ? [{ email: recipientEmail }] : []),
        ],
      },
      select: { id: true, name: true, email: true },
    });
    if (user) {
      userId = user.id;
      recipientName = recipientName || user.name || null;
      recipientEmail = recipientEmail || user.email || null;
    }
  }

  const grant = await prisma.offerGrant.upsert({
    where: {
      offerId_recipientPhone: {
        offerId: offer.id,
        recipientPhone: phoneE164,
      },
    },
    create: {
      offerId: offer.id,
      recipientPhone: phoneE164,
      recipientName,
      recipientEmail,
      userId,
      startsAt,
      endsAt,
      maxUses: 1,
      sentAt: new Date(),
    },
    update: {
      recipientName: recipientName ?? undefined,
      recipientEmail: recipientEmail ?? undefined,
      userId: userId ?? undefined,
      startsAt,
      endsAt,
      maxUses: 1,
      sentAt: new Date(),
    },
  });

  const checkoutUrl = buildCheckoutUrl(code);
  const firstName = extractFirstName(recipientName || '') || 'Cliente';
  const message = buildVoucherMessage({
    firstName,
    code,
    valueLabel: formatOfferValue(offer.type, offer.value),
    duration: input.duration,
    endsAt,
    checkoutUrl,
  });

  const sessionPhone = toWhatsAppSessionPhone(phoneE164) || `whatsapp:${phoneE164}`;
  await updateSessionProfile(sessionPhone, {
    name: recipientName || phoneE164,
    userType: 'UTENTE',
    status: 'HUMAN_INTERVENTION',
    initials: buildContactInitials(recipientName || phoneE164),
  }).catch(() => undefined);

  const send = await sendWhatsAppMessage(phoneE164, message, {
    recipientName: recipientName || firstName,
    orderCode: code,
    headerTitle: `Buono ${code}`,
    sessionPhone,
    source: 'offer_grant_whatsapp',
    userType: 'UTENTE',
    forceTemplate: Boolean(input.forceTemplate),
  });

  if (!send.ok) {
    return {
      ok: false,
      error: send.error || 'Invio WhatsApp fallito.',
    };
  }

  if (send.messageId) {
    await prisma.offerGrant.update({
      where: { id: grant.id },
      data: { whatsappWamid: send.messageId },
    });
  }

  if (!send.fallbackExecuted) {
    await addMessage(sessionPhone, 'OUTBOUND', message, undefined, {
      eventType: 'OFFER_GRANT_WHATSAPP',
      source: 'offer_grant_whatsapp',
      offerId: offer.id,
      offerCode: code,
      grantId: grant.id,
      ...buildOutboundWamidMetadata(send.messageId),
    }).catch(() => undefined);
  }

  return {
    ok: true,
    grantId: grant.id,
    endsAt: endsAt.toISOString(),
    phoneE164,
    checkoutUrl,
    messageId: send.messageId,
    fallbackExecuted: send.fallbackExecuted,
  };
}

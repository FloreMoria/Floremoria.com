import prisma from '@/lib/prisma';
import { syncSocialReadyProofsForOrder } from '@/lib/deliveryProof/socialProofChannel';
import { resolveSocialCategoryFromProductSlugs } from '@/lib/marketing/socialProofCopy';
import { MOMO_PHOTO_POLICY_EFFECTIVE_DATE } from '@/lib/deliveryProof/momoPhotoPolicy';

/**
 * Avvia sanificazione social (canale parallelo) dopo upload foto consegna.
 * Non modifica le foto private; errori non bloccano il flusso principale.
 */
export async function triggerSocialSanitizationForOrder(
  orderId: string,
  afterPhotoUrls: string[]
): Promise<void> {
  if (!afterPhotoUrls.length) return;

  try {
    const proof = await prisma.deliveryProof.findUnique({
      where: { orderId },
      select: {
        id: true,
        order: {
          select: {
            marketingPhotosOptOut: true,
            createdAt: true,
            items: { select: { product: { select: { category: { select: { slug: true } } } } } },
          },
        },
      },
    });

    if (!proof) {
      console.warn(`[Social Proof] Nessun DeliveryProof per ordine ${orderId} — skip.`);
      return;
    }

    // 1. Rispetto tassativo opt-out del cliente (Strada A)
    if (proof.order.marketingPhotosOptOut) {
      console.log(
        `[Social Proof] Ordine ${orderId} ha opt-out attivo (marketingPhotosOptOut) — sanificazione e coda Momo bloccate.`
      );
      return;
    }

    // 2. Stock storico: solo ordini dalla data di efficacia informativa in poi
    if (proof.order.createdAt < MOMO_PHOTO_POLICY_EFFECTIVE_DATE) {
      console.log(
        `[Social Proof] Ordine ${orderId} precedente all'informativa privacy (${MOMO_PHOTO_POLICY_EFFECTIVE_DATE.toISOString()}) — non eleggibile per Momo.`
      );
      return;
    }

    const slugs = proof.order.items.map((i) => i.product.category?.slug);
    await syncSocialReadyProofsForOrder({
      orderId,
      deliveryProofId: proof.id,
      afterPhotoUrls,
      socialCategory: resolveSocialCategoryFromProductSlugs(slugs),
    });
  } catch (err) {
    console.error(
      `[Social Proof] Sanificazione non riuscita per ordine ${orderId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

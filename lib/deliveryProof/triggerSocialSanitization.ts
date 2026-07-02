import prisma from '@/lib/prisma';
import { syncSocialReadyProofsForOrder } from '@/lib/deliveryProof/socialProofChannel';
import { resolveSocialCategoryFromProductSlugs } from '@/lib/futuria/socialProofCopy';

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
            items: { select: { product: { select: { category: { select: { slug: true } } } } } },
          },
        },
      },
    });

    if (!proof) {
      console.warn(`[Social Proof] Nessun DeliveryProof per ordine ${orderId} — skip.`);
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

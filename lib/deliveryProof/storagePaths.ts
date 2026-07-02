/** Prefissi logici Vercel Blob — canale privato consegne vs canale social sanificato. */
export const DELIVERY_PROOF_PRIVATE_PREFIX = 'floremoria-blob-foto-consegne/delivery-proof';
export const DELIVERY_PROOF_SOCIAL_READY_PREFIX = 'floremoria-blob-foto-consegne/social-ready';

export function isSocialReadyProofUrl(url: string): boolean {
  return url.includes('/social-ready/') || url.includes(`${DELIVERY_PROOF_SOCIAL_READY_PREFIX}/`);
}

export function isPrivateDeliveryProofUrl(url: string): boolean {
  if (isSocialReadyProofUrl(url)) return false;
  return (
    url.includes('/delivery-proof/') ||
    url.includes(`${DELIVERY_PROOF_PRIVATE_PREFIX}/`)
  );
}

const PRIVATE_BLOB_MARKER = 'private.blob.vercel-storage.com';

export function isPrivateVercelBlobUrl(url: string): boolean {
  if (!url.includes('vercel-storage.com')) return false;
  if (url.includes('public.blob.vercel-storage.com')) return false;
  return url.includes(PRIVATE_BLOB_MARKER);
}

export function blobPathnameFromUrl(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

export function toCampaignMediaProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/api/dashboard/campaigns/media')) return url;
  if (!isPrivateVercelBlobUrl(url)) return url;
  return `/api/dashboard/campaigns/media?url=${encodeURIComponent(url)}`;
}

export function withProxiedCampaignMedia<
  T extends { imageUrl?: string | null; videoUrl?: string | null },
>(campaign: T): T {
  return {
    ...campaign,
    imageUrl: toCampaignMediaProxyUrl(campaign.imageUrl ?? null),
    videoUrl: toCampaignMediaProxyUrl(campaign.videoUrl ?? null),
  };
}

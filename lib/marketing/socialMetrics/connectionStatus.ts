/**
 * Stato connessione insight per canale social.
 * Perché: in dashboard non inventare KPI se manca il token — messaggio esplicito.
 */

import { MarketingChannel } from '@prisma/client';

export type SocialInsightsConnection = {
  ok: boolean;
  message: string;
};

export function getSocialInsightsConnection(
  channel: MarketingChannel
): SocialInsightsConnection {
  switch (channel) {
    case MarketingChannel.META_INSTAGRAM: {
      const token =
        process.env.META_ACCESS_TOKEN?.trim() ||
        process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
      const ig =
        process.env.IG_BUSINESS_ACCOUNT_ID?.trim() ||
        process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
      if (!token || !ig) {
        return {
          ok: false,
          message:
            'Insight Instagram non disponibili — configura META_ACCESS_TOKEN e IG_BUSINESS_ACCOUNT_ID (Connetti account Meta).',
        };
      }
      return { ok: true, message: 'Connesso a Instagram Graph API' };
    }
    case MarketingChannel.META_FACEBOOK: {
      const token =
        process.env.META_ACCESS_TOKEN?.trim() ||
        process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
        process.env.FB_PAGE_ACCESS_TOKEN?.trim();
      const pageId = process.env.FB_PAGE_ID?.trim() || process.env.FACEBOOK_PAGE_ID?.trim();
      if (!token || !pageId) {
        return {
          ok: false,
          message:
            'Insight Facebook non disponibili — configura META_ACCESS_TOKEN e FB_PAGE_ID (Connetti account Meta).',
        };
      }
      return { ok: true, message: 'Connesso a Facebook Pages API' };
    }
    case MarketingChannel.TIKTOK: {
      if (!process.env.TIKTOK_ACCESS_TOKEN?.trim()) {
        return {
          ok: false,
          message: 'Insight TikTok non disponibili — token assente o scaduto. Ricollega TikTok.',
        };
      }
      return { ok: true, message: 'Connesso a TikTok' };
    }
    case MarketingChannel.LINKEDIN: {
      if (!process.env.LINKEDIN_ACCESS_TOKEN?.trim()) {
        return {
          ok: false,
          message: 'Insight LinkedIn non disponibili — LINKEDIN_ACCESS_TOKEN assente.',
        };
      }
      return { ok: true, message: 'Connesso a LinkedIn' };
    }
    case MarketingChannel.PINTEREST: {
      return {
        ok: true,
        message: 'Pinterest: token risolto a runtime (refresh OAuth se presente).',
      };
    }
    case MarketingChannel.YOUTUBE_SHORTS:
      return {
        ok: false,
        message: 'YouTube Analytics non configurato (manca OAuth/API key).',
      };
    default:
      return { ok: false, message: 'Canale non supportato per insight live.' };
  }
}

export function isSimulatedSocialId(id: string | null | undefined): boolean {
  return Boolean(id && String(id).startsWith('simulated-'));
}

/** Snapshot a zero reali — mai numeri inventati. */
export function zeroedUnavailableMetrics(error: string) {
  return {
    views: 0,
    reach: 0,
    impressions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    engagement: 0,
    permalink: null as string | null,
    thumbnailUrl: null as string | null,
    source: 'unavailable' as const,
    error,
  };
}

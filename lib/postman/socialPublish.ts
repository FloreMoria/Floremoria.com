/**
 * POSTMAN — Pubblicazione campagne marketing su Meta (Facebook/Instagram), TikTok e LinkedIn.
 */
import { ContentFormat, MarketingChannel } from '@prisma/client';
import { get } from '@vercel/blob';
import { getBlobStoreAccess } from '@/lib/blob/storeAccess';
import { ensureMetaFetchableImageUrl } from '@/lib/postman/socialImageStaging';
import prisma from '@/lib/prisma';
import {
  isPrivateDeliveryProofUrl,
  isSocialReadyProofUrl,
} from '@/lib/deliveryProof/storagePaths';
import {
  buildSocialProofCopy,
  coerceSocialCategoryCode,
} from '@/lib/marketing/socialProofCopy';
import {
  publishToFacebookReel,
  publishToFacebookStory,
  publishToInstagramReel,
  publishToInstagramStory,
  type MetaEnv,
} from '@/lib/postman/metaStoriesReels';
import { ensureCampaignReelVideoUrl } from '@/lib/postman/reelVideo';
import { captionForFormat } from '@/lib/postman/socialStoryCopy';
import { publishToTikTok } from '@/lib/postman/tiktokPublish';

const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export interface CampaignPublishInput {
  id: string;
  targetChannel: MarketingChannel;
  contentFormat?: ContentFormat;
  copy: string;
  hashtags: string[];
  imageUrl: string;
  videoUrl?: string | null;
  /** Foto consegna: risolve socialReadyPrimaryUrl + copy da socialCopyCategory. */
  deliveryProofId?: string;
}

export interface CampaignPublishResult {
  success: boolean;
  simulated?: boolean;
  channel: MarketingChannel;
  campaignId: string;
  externalId?: string;
  videoUrl?: string;
  error?: string;
}

interface SocialPublishEnv extends MetaEnv {
  linkedInAccessToken?: string;
  linkedInOrganizationId?: string;
  linkedInUserId?: string;
  tiktokAccessToken?: string;
}

function readSocialPublishEnv(): SocialPublishEnv {
  return {
    metaAccessToken: process.env.META_ACCESS_TOKEN?.trim(),
    fbPageId: process.env.FB_PAGE_ID?.trim(),
    igBusinessAccountId: process.env.IG_BUSINESS_ACCOUNT_ID?.trim(),
    linkedInAccessToken: process.env.LINKEDIN_ACCESS_TOKEN?.trim(),
    linkedInOrganizationId: process.env.LINKEDIN_ORGANIZATION_ID?.trim(),
    linkedInUserId: process.env.LINKEDIN_USER_ID?.trim(),
    blobToken: process.env.BLOB_READ_WRITE_TOKEN?.trim(),
    tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN?.trim(),
  };
}

function logSimulatedPublish(channel: MarketingChannel, campaignId: string, reason: string) {
  console.warn(
    `[POSTMAN] Credenziali assenti, pubblicazione simulata con successo — ${channel} · campagna ${campaignId} (${reason})`
  );
}

/** Payload social-ready da DeliveryProof (privacy pipeline end-to-end). */
export async function resolveDeliveryProofPublishPayload(deliveryProofId: string): Promise<{
  imageUrl: string;
  copy: string;
  hashtags: string[];
  category: string;
} | null> {
  const proof = await prisma.deliveryProof.findUnique({
    where: { id: deliveryProofId },
    select: {
      socialReadyPrimaryUrl: true,
      socialCopyCategory: true,
    },
  });

  const imageUrl = proof?.socialReadyPrimaryUrl?.trim();
  if (!proof || !imageUrl) {
    return null;
  }

  if (!isSocialReadyProofUrl(imageUrl)) {
    console.error(
      `[POSTMAN] DeliveryProof ${deliveryProofId}: socialReadyPrimaryUrl non proviene da /social-ready/`
    );
    return null;
  }

  const category = coerceSocialCategoryCode(proof.socialCopyCategory);
  const copyPack = buildSocialProofCopy(category);

  return {
    imageUrl,
    copy: copyPack.copy,
    hashtags: copyPack.hashtags,
    category,
  };
}

async function resolveCampaignPublishPayload(
  campaign: CampaignPublishInput
): Promise<CampaignPublishInput | { error: string }> {
  if (!campaign.deliveryProofId) {
    return campaign;
  }

  const fromProof = await resolveDeliveryProofPublishPayload(campaign.deliveryProofId);
  if (!fromProof) {
    return {
      error: `DeliveryProof ${campaign.deliveryProofId} privo di socialReadyPrimaryUrl sanificato.`,
    };
  }

  console.log(
    `[POSTMAN] Canale social-ready — proof ${campaign.deliveryProofId} · categoria ${fromProof.category}`
  );

  return {
    ...campaign,
    copy: fromProof.copy,
    hashtags: fromProof.hashtags,
    imageUrl: fromProof.imageUrl,
  };
}

export function formatCampaignCaption(copy: string, hashtags: string[]): string {
  const tags = hashtags
    .map((tag) => {
      const t = tag.trim();
      if (!t) return '';
      return t.startsWith('#') ? t : `#${t}`;
    })
    .filter(Boolean)
    .join(' ');

  const body = copy.trim();
  return tags ? `${body}\n\n${tags}` : body;
}

export async function fetchImageBytes(imageUrl: string, blobToken?: string): Promise<Buffer> {
  const isPrivateBlob = imageUrl.includes('private.blob.vercel-storage.com');

  if (isPrivateBlob) {
    if (!blobToken) {
      throw new Error('BLOB_READ_WRITE_TOKEN mancante per leggere immagine privata.');
    }
    const pathname = new URL(imageUrl).pathname.replace(/^\//, '');
    const blobResult = await get(pathname, { access: getBlobStoreAccess(), token: blobToken, useCache: false });
    if (!blobResult?.stream || blobResult.statusCode !== 200) {
      throw new Error('Impossibile scaricare immagine da Vercel Blob privato.');
    }
    return Buffer.from(await new Response(blobResult.stream).arrayBuffer());
  }

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Download immagine fallito (${res.status}).`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function contentTypeFromImageUrl(imageUrl: string): string {
  const lower = imageUrl.toLowerCase();
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  return 'image/webp';
}

async function metaGraphUploadPhoto(
  fbPageId: string,
  accessToken: string,
  imageUrl: string,
  blobToken?: string
): Promise<{ id?: string }> {
  const isPrivateBlob = imageUrl.includes('private.blob.vercel-storage.com');

  if (!isPrivateBlob) {
    return metaGraphPost<{ id?: string }>(`/${fbPageId}/photos`, accessToken, {
      url: imageUrl,
      published: 'false',
    });
  }

  const bytes = await fetchImageBytes(imageUrl, blobToken);
  const contentType = contentTypeFromImageUrl(imageUrl);
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
  const formData = new FormData();
  formData.append('published', 'false');
  formData.append('access_token', accessToken);
  formData.append('source', new Blob([new Uint8Array(bytes)], { type: contentType }), `photo.${ext}`);

  const res = await fetch(`${META_GRAPH_BASE}/${fbPageId}/photos`, {
    method: 'POST',
    body: formData,
  });

  const payload = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message || `Meta Graph API upload error (${res.status})`);
  }
  return payload;
}

async function metaGraphPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, string>
): Promise<T> {
  const params = new URLSearchParams({ ...body, access_token: accessToken });
  const res = await fetch(`${META_GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const payload = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message || `Meta Graph API error (${res.status})`);
  }
  return payload;
}

async function getFacebookPageAccessToken(
  fbPageId: string,
  userAccessToken: string
): Promise<string> {
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${fbPageId}?fields=access_token&access_token=${userAccessToken}`
    );
    const payload = (await res.json()) as { access_token?: string; error?: { message?: string } };
    if (!res.ok || payload.error) {
      throw new Error(payload.error?.message || `Failed to fetch page token (${res.status})`);
    }
    if (!payload.access_token) {
      throw new Error('Page access token not returned from Meta API');
    }
    return payload.access_token;
  } catch (err) {
    console.error(`[POSTMAN] Errore recupero Page Access Token per pagina ${fbPageId}:`, err);
    // In caso di errore proviamo comunque a fare fallback sul token utente configurato
    return userAccessToken;
  }
}

async function publishToFacebook(
  campaign: CampaignPublishInput,
  env: SocialPublishEnv
): Promise<string> {
  const { metaAccessToken, fbPageId, blobToken } = env;
  if (!metaAccessToken || !fbPageId) {
    throw new Error('META_ACCESS_TOKEN o FB_PAGE_ID assenti');
  }

  // Risolviamo dinamicamente il Page Access Token per evitare errore #200 (Unpublished posts)
  const pageAccessToken = await getFacebookPageAccessToken(fbPageId, metaAccessToken);

  const caption = captionForFormat(
    campaign.contentFormat ?? ContentFormat.FEED_POST,
    campaign.copy,
    campaign.hashtags
  );
  const photoRes = await metaGraphUploadPhoto(
    fbPageId,
    pageAccessToken,
    campaign.imageUrl,
    blobToken
  );

  if (!photoRes.id) {
    throw new Error('Meta Facebook: photo id mancante.');
  }

  const feedRes = await metaGraphPost<{ id?: string }>(`/${fbPageId}/feed`, pageAccessToken, {
    message: caption,
    attached_media: JSON.stringify([{ media_fbid: photoRes.id }]),
  });

  if (!feedRes.id) {
    throw new Error('Meta Facebook: post id mancante su /feed.');
  }

  console.log(`[POSTMAN] Facebook pubblicato — feed post_id ${feedRes.id} (campagna ${campaign.id})`);
  return feedRes.id;
}

async function publishToInstagram(
  campaign: CampaignPublishInput,
  env: SocialPublishEnv
): Promise<string> {
  const { metaAccessToken, igBusinessAccountId, blobToken } = env;
  if (!metaAccessToken || !igBusinessAccountId) {
    throw new Error('META_ACCESS_TOKEN o IG_BUSINESS_ACCOUNT_ID assenti');
  }

  const caption = captionForFormat(
    campaign.contentFormat ?? ContentFormat.FEED_POST,
    campaign.copy,
    campaign.hashtags
  );
  const metaImageUrl = await ensureMetaFetchableImageUrl(
    campaign.id,
    campaign.imageUrl,
    blobToken
  );

  const container = await metaGraphPost<{ id?: string }>(
    `/${igBusinessAccountId}/media`,
    metaAccessToken,
    {
      image_url: metaImageUrl,
      caption,
    }
  );

  if (!container.id) {
    throw new Error('Meta Instagram: creation_id mancante.');
  }

  const published = await metaGraphPost<{ id?: string }>(
    `/${igBusinessAccountId}/media_publish`,
    metaAccessToken,
    { creation_id: container.id }
  );

  if (!published.id) {
    throw new Error('Meta Instagram: media id mancante dopo publish.');
  }

  console.log(`[POSTMAN] Instagram pubblicato — media_id ${published.id} (campagna ${campaign.id})`);
  return published.id;
}

async function linkedInRegisterImageUpload(
  authorUrn: string,
  accessToken: string
): Promise<{ uploadUrl: string; asset: string }> {
  const res = await fetch(`${LINKEDIN_API_BASE}/assets?action=registerUpload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: authorUrn,
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
      },
    }),
  });

  const payload = (await res.json()) as {
    value?: {
      uploadMechanism?: {
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: { uploadUrl?: string };
      };
      asset?: string;
    };
    message?: string;
  };

  if (!res.ok) {
    throw new Error(payload.message || `LinkedIn registerUpload error (${res.status})`);
  }

  const uploadUrl =
    payload.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']
      ?.uploadUrl;
  const asset = payload.value?.asset;

  if (!uploadUrl || !asset) {
    throw new Error('LinkedIn registerUpload: uploadUrl o asset mancanti.');
  }

  return { uploadUrl, asset };
}

async function publishToLinkedIn(
  campaign: CampaignPublishInput,
  env: SocialPublishEnv
): Promise<string> {
  const { linkedInAccessToken, linkedInOrganizationId, linkedInUserId, blobToken } = env;
  if (!linkedInAccessToken) {
    throw new Error('LINKEDIN_ACCESS_TOKEN assente');
  }

  const authorUrn = linkedInOrganizationId
    ? `urn:li:organization:${linkedInOrganizationId}`
    : linkedInUserId
      ? `urn:li:person:${linkedInUserId}`
      : null;

  if (!authorUrn) {
    throw new Error('LINKEDIN_ORGANIZATION_ID o LINKEDIN_USER_ID assente');
  }

  const caption = formatCampaignCaption(campaign.copy, campaign.hashtags);
  const imageBytes = await fetchImageBytes(campaign.imageUrl, blobToken);

  const { uploadUrl, asset } = await linkedInRegisterImageUpload(authorUrn, linkedInAccessToken);

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${linkedInAccessToken}`,
      'Content-Type': 'image/png',
    },
    body: new Uint8Array(imageBytes),
  });

  if (!uploadRes.ok) {
    throw new Error(`LinkedIn upload immagine fallito (${uploadRes.status}).`);
  }

  const postsRes = await fetch(`${LINKEDIN_API_BASE}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${linkedInAccessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      commentary: caption,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
      },
      content: {
        media: {
          id: asset,
        },
      },
      lifecycleState: 'PUBLISHED',
    }),
  });

  const responseText = await postsRes.text();
  let postsPayload: Record<string, unknown> = {};
  try {
    postsPayload = JSON.parse(responseText);
  } catch {
    // Non sempre le API RestLi restituiscono JSON valido in caso di successo 201
  }

  if (!postsRes.ok) {
    console.error(
      '[POSTMAN] LinkedIn posts error — payload completo:',
      responseText
    );
    const message =
      typeof postsPayload.message === 'string'
        ? postsPayload.message
        : `LinkedIn posts error (${postsRes.status})`;
    throw new Error(message);
  }

  // L'ID del post creato viene spesso ritornato nell'header 'x-restli-id' o nel body
  const restliId = postsRes.headers.get('x-restli-id');
  const externalId = restliId || (typeof postsPayload.id === 'string' ? postsPayload.id : null) || asset;
  console.log(`[POSTMAN] LinkedIn pubblicato — post ${externalId} (campagna ${campaign.id})`);
  return externalId;
}

function channelCredentialsReady(
  channel: MarketingChannel,
  env: SocialPublishEnv
): { ready: boolean; reason: string } {
  switch (channel) {
    case MarketingChannel.META_FACEBOOK:
      if (!env.metaAccessToken || !env.fbPageId) {
        return { ready: false, reason: 'META_ACCESS_TOKEN / FB_PAGE_ID' };
      }
      return { ready: true, reason: '' };
    case MarketingChannel.META_INSTAGRAM:
      if (!env.metaAccessToken || !env.igBusinessAccountId) {
        return { ready: false, reason: 'META_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID' };
      }
      return { ready: true, reason: '' };
    case MarketingChannel.LINKEDIN:
      if (!env.linkedInAccessToken) {
        return { ready: false, reason: 'LINKEDIN_ACCESS_TOKEN' };
      }
      if (!env.linkedInOrganizationId && !env.linkedInUserId) {
        return { ready: false, reason: 'LINKEDIN_ORGANIZATION_ID / LINKEDIN_USER_ID' };
      }
      return { ready: true, reason: '' };
    case MarketingChannel.TIKTOK:
      if (!env.tiktokAccessToken) {
        return { ready: false, reason: 'TIKTOK_ACCESS_TOKEN' };
      }
      return { ready: true, reason: '' };
    case MarketingChannel.GOOGLE_ADS:
      return { ready: false, reason: 'Google Ads non ancora integrato' };
    default:
      return { ready: false, reason: 'Canale non supportato' };
  }
}

/**
 * Pubblica una campagna APPROVED sul canale target.
 * Se le credenziali mancano, simula il successo senza interrompere la pipeline.
 */
export async function publishCampaignToChannel(
  campaign: CampaignPublishInput
): Promise<CampaignPublishResult> {
  const resolved = await resolveCampaignPublishPayload(campaign);
  if ('error' in resolved) {
    console.error(`[POSTMAN] ${resolved.error} (id ${campaign.id})`);
    return {
      success: false,
      channel: campaign.targetChannel,
      campaignId: campaign.id,
      error: resolved.error,
    };
  }

  const payload = resolved;
  const env = readSocialPublishEnv();
  const { ready, reason } = channelCredentialsReady(payload.targetChannel, env);

  if (!payload.imageUrl?.trim()) {
    const msg = 'imageUrl mancante — impossibile pubblicare.';
    console.error(`[POSTMAN] ${msg} (campagna ${payload.id})`);
    return {
      success: false,
      channel: payload.targetChannel,
      campaignId: payload.id,
      error: msg,
    };
  }

  if (isPrivateDeliveryProofUrl(payload.imageUrl)) {
    const msg =
      'Pubblicazione bloccata: foto consegna privata. Usare solo asset /social-ready/.';
    console.error(`[POSTMAN] ${msg} (campagna ${payload.id})`);
    return {
      success: false,
      channel: payload.targetChannel,
      campaignId: payload.id,
      error: msg,
    };
  }

  if (!ready) {
    logSimulatedPublish(payload.targetChannel, payload.id, reason);
    return {
      success: true,
      simulated: true,
      channel: payload.targetChannel,
      campaignId: payload.id,
      externalId: `simulated-${payload.id}`,
    };
  }

  try {
    let externalId: string;
    let videoUrl: string | undefined = payload.videoUrl ?? undefined;
    const contentFormat = payload.contentFormat ?? ContentFormat.FEED_POST;

    if (contentFormat === ContentFormat.REEL && !videoUrl?.trim()) {
      videoUrl =
        (await ensureCampaignReelVideoUrl({
          campaignId: payload.id,
          imageUrl: payload.imageUrl,
          blobToken: env.blobToken,
        })) ?? undefined;
    }

    switch (payload.targetChannel) {
      case MarketingChannel.META_FACEBOOK:
        if (contentFormat === ContentFormat.STORY) {
          externalId = await publishToFacebookStory(payload, env);
        } else if (contentFormat === ContentFormat.REEL) {
          if (!videoUrl) {
            throw new Error(
              'Video reel mancante. Configura MARKETING_REEL_FALLBACK_VIDEO_URL o FFMPEG_PATH.'
            );
          }
          externalId = await publishToFacebookReel(
            { ...payload, videoUrl, contentFormat },
            env
          );
        } else {
          externalId = await publishToFacebook(payload, env);
        }
        break;
      case MarketingChannel.META_INSTAGRAM:
        if (contentFormat === ContentFormat.STORY) {
          externalId = await publishToInstagramStory(
            { ...payload, contentFormat },
            env
          );
        } else if (contentFormat === ContentFormat.REEL) {
          if (!videoUrl) {
            throw new Error(
              'Video reel mancante. Configura MARKETING_REEL_FALLBACK_VIDEO_URL o FFMPEG_PATH.'
            );
          }
          externalId = await publishToInstagramReel(
            { ...payload, videoUrl, contentFormat },
            env
          );
        } else {
          externalId = await publishToInstagram(payload, env);
        }
        break;
      case MarketingChannel.TIKTOK: {
        const tiktokResult = await publishToTikTok({
          campaignId: payload.id,
          contentFormat,
          copy: payload.copy,
          hashtags: payload.hashtags,
          imageUrl: payload.imageUrl,
          videoUrl,
        });
        if (!tiktokResult.success) {
          throw new Error(tiktokResult.error || 'TikTok publish failed');
        }
        return {
          success: true,
          simulated: tiktokResult.simulated,
          channel: payload.targetChannel,
          campaignId: payload.id,
          externalId: tiktokResult.externalId,
          videoUrl,
        };
      }
      case MarketingChannel.LINKEDIN:
        externalId = await publishToLinkedIn(payload, env);
        break;
      default:
        logSimulatedPublish(payload.targetChannel, payload.id, reason);
        return {
          success: true,
          simulated: true,
          channel: payload.targetChannel,
          campaignId: payload.id,
          externalId: `simulated-${payload.id}`,
        };
    }

    return {
      success: true,
      channel: payload.targetChannel,
      campaignId: payload.id,
      externalId,
      videoUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[POSTMAN] Errore pubblicazione ${payload.targetChannel} · campagna ${payload.id}: ${msg}`
    );
    return {
      success: false,
      channel: payload.targetChannel,
      campaignId: payload.id,
      error: msg,
    };
  }
}

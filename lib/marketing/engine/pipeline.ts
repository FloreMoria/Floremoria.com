import { evaluateCampaignDraft } from './checkpoint';
import {
  MarketingEngineConfigError,
  generateCampaignDraft,
  regenerateCampaignDraftWithFeedback,
} from './generation';
import { generateAndStorageCampaignImage } from './images';
import { getMarketingLaunchProducts, pickDailyLaunchProduct, type MarketingLaunchProduct } from './launchQueue';
import { getDailyPublishSlots, getActiveTheme } from './contentCalendar';

export interface PipelineCampaignResult {
  campaignId: string;
  channel: string;
  contentFormat: string;
  imageUrl?: string;
  approved?: boolean;
  rejectionReason?: string;
  error?: string;
}

export interface PipelineProductResult {
  category: string;
  productName: string;
  productPrice: number;
  campaigns: PipelineCampaignResult[];
  error?: string;
}

export interface MarketingProductionSummary {
  startedAt: string;
  finishedAt: string;
  productsProcessed: number;
  campaignsCreated: number;
  campaignsApproved: number;
  campaignsRejected: number;
  campaignsFailed: number;
  products: PipelineProductResult[];
}

async function processCampaignPost(
  product: MarketingLaunchProduct,
  campaignId: string,
  channel: string,
  contentFormat: string,
  index: number,
  total: number
): Promise<PipelineCampaignResult> {
  const label = `[Marketing Pipeline] ${product.category} · ${product.productName} · ${channel} · ${contentFormat}`;

  let attempts = 0;
  const maxRetries = 3;
  let approved = false;
  let rejectionReason: string | undefined;
  let imageUrl: string | undefined;

  while (attempts <= maxRetries && !approved) {
    attempts++;
    const attemptLabel = `${label} (Tentativo ${attempts}/${maxRetries + 1})`;
    try {
      if (attempts > 1 && rejectionReason) {
        console.log(`${attemptLabel} — Rigenerazione copy e prompt basata su feedback Guardiani...`);
        await regenerateCampaignDraftWithFeedback(campaignId, rejectionReason);
      }

      console.log(`${attemptLabel} — STEP 2/3 Imagen + Vercel Blob`);
      imageUrl = await generateAndStorageCampaignImage(campaignId, { force: true });
      console.log(`${attemptLabel} — immagine caricata: ${imageUrl}`);

      console.log(`${attemptLabel} — STEP 3/3 Checkpoint Guardiani`);
      const checkpoint = await evaluateCampaignDraft(campaignId);
      approved = checkpoint.approved;
      rejectionReason = checkpoint.reason;

      console.log(
        `${attemptLabel} — checkpoint ${approved ? 'APPROVED' : 'REJECTED'}${
          rejectionReason ? `: ${rejectionReason}` : ''
        }`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${attemptLabel} — ERRORE: ${msg}`);
      return { campaignId, channel, contentFormat, error: msg };
    }
  }

  return {
    campaignId,
    channel,
    contentFormat,
    imageUrl,
    approved,
    rejectionReason: approved ? undefined : rejectionReason,
  };
}

async function runProductPipeline(product: MarketingLaunchProduct): Promise<PipelineProductResult> {
  console.log(
    `\n[Marketing Pipeline] ▶ Avvio prodotto ${product.category} — ${product.productName} (€${product.productPrice.toFixed(2)})`
  );

  try {
    console.log(`[Marketing Pipeline] STEP 1/3 generateCampaignDraft — ${product.productName}`);
    const slots = getDailyPublishSlots();
    const theme = await getActiveTheme();
    const draft = await generateCampaignDraft(
      product.category,
      product.productName,
      product.productPrice,
      slots,
      theme
    );

    console.log(
      `[Marketing Pipeline] STEP 1/3 completato — ${draft.posts.length} post creati in DRAFT su Prisma`
    );

    const campaigns: PipelineCampaignResult[] = [];
    const total = draft.posts.length;

    for (let i = 0; i < draft.posts.length; i++) {
      const post = draft.posts[i];
      const result = await processCampaignPost(
        product,
        post.campaignId,
        post.channel,
        post.contentFormat,
        i + 1,
        total
      );
      campaigns.push(result);
    }

    const approved = campaigns.filter((c) => c.approved).length;
    const rejected = campaigns.filter((c) => c.approved === false && !c.error).length;
    const failed = campaigns.filter((c) => c.error).length;

    console.log(
      `[Marketing Pipeline] ✔ Prodotto ${product.productName} — approved: ${approved}, rejected: ${rejected}, errori: ${failed}`
    );

    return {
      category: product.category,
      productName: product.productName,
      productPrice: product.productPrice,
      campaigns,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[Marketing Pipeline] ✖ Errore prodotto ${product.productName} (STEP 1): ${msg}`
    );
    return {
      category: product.category,
      productName: product.productName,
      productPrice: product.productPrice,
      campaigns: [],
      error: msg,
    };
  }
}

/**
 * Esegue la pipeline completa Marketing per ogni prodotto in coda:
 * generazione copy → Imagen/Blob → checkpoint Guardiani.
 */
export async function runMarketingProductionPipeline(
  products = getMarketingLaunchProducts()
): Promise<MarketingProductionSummary> {
  const startedAt = new Date();
  const dailyProduct = pickDailyLaunchProduct(products, startedAt);
  console.log(
    `[Marketing Pipeline] ═══ Produzione giornaliera avviata (${startedAt.toISOString()}) — prodotto del giorno: ${dailyProduct.productName} ═══`
  );

  const productResults: PipelineProductResult[] = [];
  productResults.push(await runProductPipeline(dailyProduct));

  const finishedAt = new Date();
  const allCampaigns = productResults.flatMap((p) => p.campaigns);

  const summary: MarketingProductionSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    productsProcessed: productResults.length,
    campaignsCreated: allCampaigns.length,
    campaignsApproved: allCampaigns.filter((c) => c.approved).length,
    campaignsRejected: allCampaigns.filter((c) => c.approved === false && !c.error).length,
    campaignsFailed: allCampaigns.filter((c) => c.error).length,
    products: productResults,
  };

  console.log(
    `[Marketing Pipeline] ═══ Produzione completata — creati: ${summary.campaignsCreated}, approved: ${summary.campaignsApproved}, rejected: ${summary.campaignsRejected}, errori: ${summary.campaignsFailed} ═══`
  );

  return summary;
}

export { MarketingEngineConfigError };

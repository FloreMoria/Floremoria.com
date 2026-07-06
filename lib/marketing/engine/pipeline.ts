import { evaluateCampaignDraft } from './checkpoint';
import { MarketingEngineConfigError, generateCampaignDraft } from './generation';
import { generateAndStorageCampaignImage } from './images';
import { getMarketingLaunchProducts, pickDailyLaunchProduct, type MarketingLaunchProduct } from './launchQueue';
import { getDailyPublishSlots } from './contentCalendar';

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

  try {
    console.log(`${label} — STEP 2/3 Imagen + Vercel Blob (${index}/${total})`);
    const imageUrl = await generateAndStorageCampaignImage(campaignId, { force: true });
    console.log(`${label} — immagine caricata: ${imageUrl}`);

    console.log(`${label} — STEP 3/3 Checkpoint Guardiani (${index}/${total})`);
    const checkpoint = await evaluateCampaignDraft(campaignId);
    console.log(
      `${label} — checkpoint ${checkpoint.approved ? 'APPROVED' : 'REJECTED'}${
        checkpoint.reason ? `: ${checkpoint.reason}` : ''
      }`
    );

    return {
      campaignId,
      channel,
      contentFormat,
      imageUrl,
      approved: checkpoint.approved,
      rejectionReason: checkpoint.reason,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${label} — ERRORE: ${msg}`);
    return { campaignId, channel, contentFormat, error: msg };
  }
}

async function runProductPipeline(product: MarketingLaunchProduct): Promise<PipelineProductResult> {
  console.log(
    `\n[Marketing Pipeline] ▶ Avvio prodotto ${product.category} — ${product.productName} (€${product.productPrice.toFixed(2)})`
  );

  try {
    console.log(`[Marketing Pipeline] STEP 1/3 generateCampaignDraft — ${product.productName}`);
    const slots = getDailyPublishSlots();
    const draft = await generateCampaignDraft(
      product.category,
      product.productName,
      product.productPrice,
      slots
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

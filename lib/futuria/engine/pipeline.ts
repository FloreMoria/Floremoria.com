import { evaluateCampaignDraft } from './checkpoint';
import { FuturiaEngineConfigError, generateCampaignDraft } from './generation';
import { generateAndStorageCampaignImage } from './images';
import { getFuturiaLaunchProducts, type FuturiaLaunchProduct } from './launchQueue';

export interface PipelineCampaignResult {
  campaignId: string;
  channel: string;
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

export interface FuturiaProductionSummary {
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
  product: FuturiaLaunchProduct,
  campaignId: string,
  channel: string,
  index: number,
  total: number
): Promise<PipelineCampaignResult> {
  const label = `[Futuria Pipeline] ${product.category} · ${product.productName} · ${channel}`;

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
      imageUrl,
      approved: checkpoint.approved,
      rejectionReason: checkpoint.reason,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${label} — ERRORE: ${msg}`);
    return { campaignId, channel, error: msg };
  }
}

async function runProductPipeline(product: FuturiaLaunchProduct): Promise<PipelineProductResult> {
  console.log(
    `\n[Futuria Pipeline] ▶ Avvio prodotto ${product.category} — ${product.productName} (€${product.productPrice.toFixed(2)})`
  );

  try {
    console.log(`[Futuria Pipeline] STEP 1/3 generateCampaignDraft — ${product.productName}`);
    const draft = await generateCampaignDraft(
      product.category,
      product.productName,
      product.productPrice
    );

    console.log(
      `[Futuria Pipeline] STEP 1/3 completato — ${draft.posts.length} post creati in DRAFT su Prisma`
    );

    const campaigns: PipelineCampaignResult[] = [];
    const total = draft.posts.length;

    for (let i = 0; i < draft.posts.length; i++) {
      const post = draft.posts[i];
      const result = await processCampaignPost(
        product,
        post.campaignId,
        post.channel,
        i + 1,
        total
      );
      campaigns.push(result);
    }

    const approved = campaigns.filter((c) => c.approved).length;
    const rejected = campaigns.filter((c) => c.approved === false && !c.error).length;
    const failed = campaigns.filter((c) => c.error).length;

    console.log(
      `[Futuria Pipeline] ✔ Prodotto ${product.productName} — approved: ${approved}, rejected: ${rejected}, errori: ${failed}`
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
      `[Futuria Pipeline] ✖ Errore prodotto ${product.productName} (STEP 1): ${msg}`
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
 * Esegue la pipeline completa Futuria per ogni prodotto in coda:
 * generazione copy → Imagen/Blob → checkpoint Guardiani.
 */
export async function runFuturiaProductionPipeline(
  products = getFuturiaLaunchProducts()
): Promise<FuturiaProductionSummary> {
  const startedAt = new Date();
  console.log(
    `[Futuria Pipeline] ═══ Produzione giornaliera avviata (${startedAt.toISOString()}) — ${products.length} prodotti in coda ═══`
  );

  const productResults: PipelineProductResult[] = [];

  for (const product of products) {
    productResults.push(await runProductPipeline(product));
  }

  const finishedAt = new Date();
  const allCampaigns = productResults.flatMap((p) => p.campaigns);

  const summary: FuturiaProductionSummary = {
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
    `[Futuria Pipeline] ═══ Produzione completata — creati: ${summary.campaignsCreated}, approved: ${summary.campaignsApproved}, rejected: ${summary.campaignsRejected}, errori: ${summary.campaignsFailed} ═══`
  );

  return summary;
}

export { FuturiaEngineConfigError };

/**
 * Feed prodotti Google Merchant Center — mappatura da catalogo istituzionale lib/products.ts.
 */
import { products, type Product } from '@/lib/products';
import { getProductUrl } from '@/lib/productUrls';
import { getPublicSiteBaseUrl } from '@/lib/siteBaseUrl';
import { resolvePartnerProductImages } from '@/lib/resolveProductPublicImage';

export const MERCHANT_FEED_COLUMNS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'availability',
  'price',
  'google_product_category',
  'brand',
  'condition',
  'identifier_exists',
] as const;

export type MerchantFeedRow = Record<(typeof MERCHANT_FEED_COLUMNS)[number], string>;

const SERVICE_SUFFIX =
  " Servizio FloreMoria: consegna dell'omaggio floreale sulla tomba o nel luogo indicato da fioristi partner locali, con foto di conferma inviata su WhatsApp e nel profilo personale.";

const CANDLE_SLUGS = new Set([
  'lumino',
  'set-ceri',
  'lumino-piccoli-amici',
  'ceri-piccoli-amici',
]);

const PLANT_SLUGS = new Set([
  'kalonche',
  'margherite-gerbere',
  'un-raggio-di-sole',
  'abbraccio-verde',
  'legame-eterno',
  'battito-di-foglia',
  'anima-pura',
  'il-giardino-del-ponte',
]);

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function merchantProductId(product: Product): string {
  return `FM-${product.slug}`;
}

function buildTitle(product: Product): string {
  const base = product.name.trim();
  if (CANDLE_SLUGS.has(product.slug)) {
    return `${base} - Lumino e Candele FloreMoria con Consegna e Foto WhatsApp`;
  }
  if (product.isBouquet === false) {
    return `${base} - Accessorio Omaggio FloreMoria con Consegna e Foto WhatsApp`;
  }
  if (product.category === 'funerale') {
    return `${base} - Consegna Fiori Funerale con Foto WhatsApp`;
  }
  if (product.category === 'animali') {
    return `${base} - Omaggio Florale per Animali con Foto WhatsApp`;
  }
  return `${base} - Consegna Fiori al Cimitero con Foto WhatsApp`;
}

function buildDescription(product: Product): string {
  const source = product.descriptionSEO || product.description || product.name;
  const cleaned = stripHtml(source.replace(/\n+/g, ' '));
  const text = `${cleaned}${SERVICE_SUFFIX}`.slice(0, 5000);
  return text;
}

function googleProductCategory(product: Product): string {
  if (CANDLE_SLUGS.has(product.slug)) {
    return 'Home & Garden > Decor > Candles & Scented Oils';
  }
  if (PLANT_SLUGS.has(product.slug)) {
    return 'Home & Garden > Plants > House & Indoor Plants';
  }
  return 'Home & Garden > Plants > Flowers & Cut Flowers';
}

function formatPrice(price: number): string {
  return `${price.toFixed(2)} EUR`;
}

function absoluteUrl(path: string): string {
  const base = getPublicSiteBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const encoded = normalized
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join('/');
  return `${base}${encoded}`;
}

function resolveCoverImage(product: Product): string | null {
  const { cover } = resolvePartnerProductImages({
    slug: product.slug,
    name: product.name,
    mediaUrl: product.coverImage,
    images: product.images?.map((url) => ({ url })),
  });
  return cover;
}

export function buildMerchantFeedRows(siteBaseUrl?: string): MerchantFeedRow[] {
  if (siteBaseUrl) {
    process.env.NEXT_PUBLIC_SITE_URL = siteBaseUrl.replace(/\/$/, '');
  }

  return products.map((product) => {
    const image = resolveCoverImage(product);
    if (!image) {
      console.warn(`[merchant-feed] Nessuna immagine per ${product.slug}`);
    }

    return {
      id: merchantProductId(product),
      title: buildTitle(product),
      description: buildDescription(product),
      link: absoluteUrl(getProductUrl(product)),
      image_link: image || '',
      availability: 'in_stock',
      price: formatPrice(product.price),
      google_product_category: googleProductCategory(product),
      brand: 'FloreMoria',
      condition: 'new',
      identifier_exists: 'no',
    };
  });
}

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function merchantFeedToCsv(rows: MerchantFeedRow[]): string {
  const header = MERCHANT_FEED_COLUMNS.join(',');
  const lines = rows.map((row) =>
    MERCHANT_FEED_COLUMNS.map((col) => escapeCsvField(row[col] ?? '')).join(',')
  );
  return [header, ...lines].join('\n');
}

export function buildMerchantFeedCsv(siteBaseUrl?: string): string {
  return merchantFeedToCsv(buildMerchantFeedRows(siteBaseUrl));
}

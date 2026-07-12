export type MarketingLaunchCategory = 'FF' | 'FT';

export interface MarketingLaunchProduct {
  category: MarketingLaunchCategory;
  productName: string;
  productPrice: number;
}

/** Prodotti di default per il calendario editoriale (FF / FT). */
export const DEFAULT_MARKETING_LAUNCH_PRODUCTS: MarketingLaunchProduct[] = [
  {
    category: 'FT',
    productName: 'Bouquet Ricordo Affettuoso',
    productPrice: 29.99,
  },
  {
    category: 'FF',
    productName: 'Cuore/Corona Omaggio Solenne',
    productPrice: 199.99,
  },
];

export function getMarketingLaunchProducts(): MarketingLaunchProduct[] {
  const raw = process.env.MARKETING_LAUNCH_PRODUCTS_JSON?.trim();
  if (!raw) {
    return DEFAULT_MARKETING_LAUNCH_PRODUCTS;
  }

  try {
    const parsed = JSON.parse(raw) as MarketingLaunchProduct[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter(
        (item) =>
          (item.category === 'FF' || item.category === 'FT') &&
          typeof item.productName === 'string' &&
          item.productName.trim() &&
          typeof item.productPrice === 'number' &&
          item.productPrice > 0
      );
    }
  } catch {
    console.warn('[Marketing Pipeline] MARKETING_LAUNCH_PRODUCTS_JSON non valido — uso default.');
  }

  return DEFAULT_MARKETING_LAUNCH_PRODUCTS;
}

/** Un prodotto al giorno (rotazione) per rispettare i limiti del cron. */
export function pickDailyLaunchProduct(
  products = getMarketingLaunchProducts(),
  reference = new Date()
): MarketingLaunchProduct {
  if (products.length === 0) {
    return DEFAULT_MARKETING_LAUNCH_PRODUCTS[0]!;
  }
  const dayIndex = Math.floor(reference.getTime() / 86_400_000);
  return products[dayIndex % products.length]!;
}

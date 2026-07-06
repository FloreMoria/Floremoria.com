export type FuturiaLaunchCategory = 'FF' | 'FT';

export interface FuturiaLaunchProduct {
  category: FuturiaLaunchCategory;
  productName: string;
  productPrice: number;
}

/** Prodotti di default allineati alla Direttiva Futuria (FF / FT). */
export const DEFAULT_FUTURIA_LAUNCH_PRODUCTS: FuturiaLaunchProduct[] = [
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

export function getFuturiaLaunchProducts(): FuturiaLaunchProduct[] {
  const raw = process.env.FUTURIA_LAUNCH_PRODUCTS_JSON?.trim();
  if (!raw) {
    return DEFAULT_FUTURIA_LAUNCH_PRODUCTS;
  }

  try {
    const parsed = JSON.parse(raw) as FuturiaLaunchProduct[];
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
    console.warn('[Futuria Pipeline] FUTURIA_LAUNCH_PRODUCTS_JSON non valido — uso default.');
  }

  return DEFAULT_FUTURIA_LAUNCH_PRODUCTS;
}

/** Un prodotto al giorno (rotazione) per rispettare i limiti del cron. */
export function pickDailyLaunchProduct(
  products = getFuturiaLaunchProducts(),
  reference = new Date()
): FuturiaLaunchProduct {
  if (products.length === 0) {
    return DEFAULT_FUTURIA_LAUNCH_PRODUCTS[0]!;
  }
  const dayIndex = Math.floor(reference.getTime() / 86_400_000);
  return products[dayIndex % products.length]!;
}

import { buildMerchantFeedCsv } from '@/lib/merchant/merchantFeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Feed prodotti Google Merchant Center — generato dal catalogo lib/products.ts */
export async function GET() {
  const csv = buildMerchantFeedCsv();

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'inline; filename="merchant-feed.csv"',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

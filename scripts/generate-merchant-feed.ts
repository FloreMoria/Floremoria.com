#!/usr/bin/env tsx
/**
 * Genera public/merchant-feed.csv per Google Merchant Center (Content API / upload manuale).
 *
 * Uso:
 *   npm run merchant:feed
 *   tsx scripts/generate-merchant-feed.ts
 *   tsx scripts/generate-merchant-feed.ts --out public/merchant-feed.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildMerchantFeedCsv, buildMerchantFeedRows } from '../lib/merchant/merchantFeed';
import { products } from '../lib/products';

const DEFAULT_OUT = path.join(process.cwd(), 'public', 'merchant-feed.csv');

function parseOutArg(): string {
  const idx = process.argv.indexOf('--out');
  if (idx >= 0 && process.argv[idx + 1]) {
    return path.resolve(process.cwd(), process.argv[idx + 1]!);
  }
  return DEFAULT_OUT;
}

function main(): void {
  const outPath = parseOutArg();
  const rows = buildMerchantFeedRows();

  if (rows.length !== products.length) {
    console.error(
      `[merchant-feed] Attenzione: righe feed (${rows.length}) != prodotti catalogo (${products.length})`
    );
    process.exit(1);
  }

  const missingImages = rows.filter((r) => !r.image_link);
  if (missingImages.length > 0) {
    console.warn(
      `[merchant-feed] ${missingImages.length} prodotti senza image_link:`,
      missingImages.map((r) => r.id).join(', ')
    );
  }

  const csv = buildMerchantFeedCsv();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv, 'utf8');

  console.log(`[merchant-feed] Scritti ${rows.length} prodotti → ${outPath}`);
  console.table(
    rows.map((r) => ({
      id: r.id,
      title: r.title.slice(0, 60) + (r.title.length > 60 ? '…' : ''),
      price: r.price,
      category: r.google_product_category.split(' > ').pop(),
      link: r.link.replace('https://www.floremoria.com', ''),
    }))
  );
}

main();

/**
 * Esporta il volantino B2B per tipografia (Centro Digitale / istruzioni volantini flyer).
 *
 * Requisiti dal tipografo (sintesi):
 * - Prodotti bifacciali: DUE FILE SEPARATI (fronte e retro), non un unico PDF a doppia pagina.
 * - Risoluzione piccolo formato: > 300 dpi nativi (qui alziamo deviceScaleFactor per una resa più fitta).
 * - Colore: CMYK consigliato, profilo FOGRA 39; i PDF da browser sono RGB e verranno convertiti dal tipografo.
 * - Abbondanze: verificare mm richiesti per il prodotto; niente crocini di taglio nel file.
 * - Font: in file vettoriali vanno convertiti in curve; in PDF testo i font restano incorporati.
 *
 * Prerequisiti:
 *   npm install
 *   npx playwright install chromium   (solo la prima volta)
 *
 * Avvio:
 *   1) npm run dev
 *   2) npm run pdf:volantino
 *
 * Output (root progetto):
 *   volantino-b2b-fronte.pdf
 *   volantino-b2b-retro.pdf
 *
 * URL: PDF_BASE_URL=http://127.0.0.1:3001 npm run pdf:volantino
 * Nitidezza: PDF_DEVICE_SCALE=3 npm run pdf:volantino  (default 2)
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outFronte = path.join(root, 'volantino-b2b-fronte.pdf');
const outRetro = path.join(root, 'volantino-b2b-retro.pdf');
const base = (process.env.PDF_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const url = `${base}/stampa/volantino-b2b`;
const rawScale = Number.parseFloat(String(process.env.PDF_DEVICE_SCALE ?? ''));
const deviceScaleFactor = Math.min(4, Math.max(1, Number.isFinite(rawScale) ? rawScale : 2));

/* Area contenuto con margini 5 mm (stesso layout CSS @page) */
const innerWmm = 138;
const innerHmm = 200;
const a5w = Math.round((innerWmm * 96) / 25.4);
const a5h = Math.round((innerHmm * 96) / 25.4);

console.log(`PDF volantino B2B (2 file separati per tipografia)\n  sorgente: ${url}\n  scale:    ${deviceScaleFactor}x\n  fronte:   ${outFronte}\n  retro:    ${outRetro}\n`);

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    deviceScaleFactor,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage({
    viewport: { width: a5w + 32, height: a5h * 2 + 80 },
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('[aria-label="Volantino fronte"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.emulateMedia({ media: 'print' });
  await new Promise((r) => setTimeout(r, 2500));

  /* Margini 5 mm da @page nel CSS; qui margin 0 per non sommare due volte */
  const pdfOpts = {
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  };

  await page.pdf({ ...pdfOpts, path: outFronte, pageRanges: '1' });
  await page.pdf({ ...pdfOpts, path: outRetro, pageRanges: '2' });

  console.log('Completato: 2 PDF pronti per il caricamento (fronte e retro separati).\n');
  await context.close();
} finally {
  await browser.close();
}

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [,, inputPath, productSlug, altText] = process.argv;

  if (!inputPath || !productSlug || !altText) {
    console.error("Usage: node scripts/ingest-ai-images.mjs <path-to-raw-image> <product-slug> <\"SEO alt text\">");
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  // Find product
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
    include: { images: true }
  });

  if (!product) {
    console.error(`Product with slug "${productSlug}" not found in database.`);
    process.exit(1);
  }

  console.log(`Found product: ${product.name}`);

  // Determine SEO File Name
  // e.g. altText = "Fiori cimitero Roma bouquet omaggio speciale"
  // seoFileName = "fiori-cimitero-roma-bouquet-omaggio-speciale"
  let seoFileName = altText.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-') // replace non chars with hyphen
                    .replace(/^-|-$/g, '');     // trim hyphens

  // Append a lightweight unique timestamp to avoid overwrites
  seoFileName = `${seoFileName}-${Date.now().toString().slice(-4)}.webp`;

  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Assicura il vero path assoluto di public/images/products indipendentemente da dove si lancia il comando
  const projectRoot = path.resolve(__dirname, '..');
  const outputDir = path.join(projectRoot, 'public', 'images', 'products', productSlug);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, seoFileName);

  // Read metadata via sharp
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  console.log(`Original image: ${metadata.width}x${metadata.height}`);

  let pipeline = image;

  // Let's assume square images need 3:4 crop centrally
  // This gracefully drops the AI watermark usually placed in the corner
  if (metadata.width === metadata.height) {
    const targetWidth = Math.floor(metadata.height * 0.75);
    const leftOffset = Math.floor((metadata.width - targetWidth) / 2);
    
    console.log(`Cropping to 3:4. Extracting width ${targetWidth} from center (removing ${leftOffset}px per side). This removes the AI watermark!`);
    
    pipeline = pipeline.extract({
      left: leftOffset,
      top: 0,
      width: targetWidth,
      height: metadata.height
    });
  }

  console.log(`Saving as WebP to ${outputPath}...`);
  await pipeline
    .webp({ quality: 85, effort: 6 })
    .toFile(outputPath);

  const publicUrl = `/images/products/${productSlug}/${seoFileName}`;

  // Calculate sort order
  const nextSortOrder = product.images.length > 0 
    ? Math.max(...product.images.map(img => img.sortOrder)) + 1 
    : 0;

  // Insert to DB
  const newImage = await prisma.productImage.create({
    data: {
      productId: product.id,
      url: publicUrl,
      alt: altText,
      sortOrder: nextSortOrder
    }
  });

  console.log(`✅ Success! Added image record to DB. Image ID: ${newImage.id}`);

  // If the product doesn't have a mediaUrl yet, let's set it
  if (!product.mediaUrl) {
    console.log(`🎉 Setting product mediaUrl as well because it was currently empty.`);
    await prisma.product.update({
      where: { id: product.id },
      data: { mediaUrl: publicUrl }
    });
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

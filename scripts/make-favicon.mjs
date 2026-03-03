import sharp from 'sharp';
import path from 'path';

async function make() {
  const input = path.resolve('public/images/brand/Logo FloreMoria.png');
  const iconOut = path.resolve('app/icon.png');
  const appleOut = path.resolve('app/apple-icon.png');

  await sharp(input)
    .resize({
      width: 512,
      height: 512,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toFile(iconOut);

  await sharp(input)
    .resize({
      width: 180,
      height: 180,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toFile(appleOut);

  console.log('Icons generated successfully.');
}
make().catch(console.error);

/**
 * Test temporaneo permessi Vercel Blob (BLOB_READ_WRITE_TOKEN).
 * Uso: npx tsx scratch/test-blob-storage.ts
 */
import { get, head, put } from '@vercel/blob';
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

const TEST_PATH = 'futuria/test-futuria.txt';
const TEST_CONTENT = 'Hello Futuria';

async function main() {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
        console.error('❌ BLOB_READ_WRITE_TOKEN non impostato (.env.local o env di shell).');
        process.exit(1);
    }

    console.log('→ Upload test-futuria.txt su Vercel Blob…');

    const { url, pathname, downloadUrl } = await put(TEST_PATH, TEST_CONTENT, {
        access: 'private',
        contentType: 'text/plain; charset=utf-8',
        token,
        addRandomSuffix: false,
    });

    console.log('✅ Upload riuscito');
    console.log('   pathname:', pathname);
    console.log('   url:', url);
    console.log('   downloadUrl:', downloadUrl);

    const meta = await head(url, { token });
    console.log('→ Verifica lettura (head)…');
    console.log('   size:', meta.size, 'bytes');
    console.log('   contentType:', meta.contentType);

    const blobResult = await get(pathname, { access: 'private', token, useCache: false });
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
        console.warn('⚠️ get() non ha restituito uno stream.');
        process.exit(1);
    }
    const body = await new Response(blobResult.stream).text();
    if (body === TEST_CONTENT) {
        console.log('✅ Lettura autenticata OK — contenuto:', JSON.stringify(body));
    } else {
        console.warn('⚠️ URL raggiungibile ma contenuto inatteso:', JSON.stringify(body));
    }
}

main().catch((err) => {
    console.error('❌ Errore test Blob:', err instanceof Error ? err.message : err);
    process.exit(1);
});

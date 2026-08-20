import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();
import { PrismaClient } from '@prisma/client';
import { getDocumentProxy, extractTextItems } from 'unpdf';
import { ensurePdfDomPolyfills } from '../lib/financial/bankStatements/pdfDomPolyfill';

async function main() {
    ensurePdfDomPolyfills();
    const prisma = new PrismaClient();
    const doc = await prisma.bankStatementDocument.findFirst({
        orderBy: { uploadedAt: 'desc' },
        where: { fileName: { contains: 'Fineco' } },
    });
    if (!doc?.blobUrl) throw new Error('no doc');
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    const res = await fetch(doc.blobUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { items } = await extractTextItems(pdf);
    for (const pageIdx of [0, 1]) {
        console.log('\n=== PAGE', pageIdx + 1, '===');
        const page = items[pageIdx] || [];
        const sorted = [...page].sort((a, b) => b.y - a.y || a.x - b.x);
        const rows: { y: number; parts: string[] }[] = [];
        for (const it of sorted) {
            const s = String(it.str || '').trim();
            if (!s) continue;
            const last = rows[rows.length - 1];
            if (last && Math.abs(last.y - it.y) < 3.2) last.parts.push(`${s}@${Math.round(it.x)}`);
            else rows.push({ y: it.y, parts: [`${s}@${Math.round(it.x)}`] });
        }
        for (const r of rows.slice(0, 25)) console.log(r.parts.join(' | '));
    }
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

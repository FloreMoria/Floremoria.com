import { loadEnvFiles } from '../lib/loadEnvFiles';
loadEnvFiles();
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { parseFinecoPdfTabular } from '../lib/financial/parseFinecoPdf';

async function main() {
    const prisma = new PrismaClient();
    const doc = await prisma.bankStatementDocument.findFirst({
        orderBy: { uploadedAt: 'desc' },
        where: { fileName: { contains: 'Fineco' } },
    });
    if (!doc?.blobUrl) {
        console.log('no blobUrl', doc);
        await prisma.$disconnect();
        return;
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    const res = await fetch(doc.blobUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync('/tmp/fineco-sample.pdf', buf);
    console.log('bytes', buf.length);
    const result = await parseFinecoPdfTabular(buf);
    console.log('movements', result.movements.length, 'anomalies', result.anomalies.length, 'warnings', result.warnings);
    console.log(JSON.stringify(result.anomalies, null, 2));
    for (const a of result.anomalies) {
        console.log('ANOM', a.code, a.message.slice(0, 120));
    }
    const paypal = result.movements.filter((m) => /paypal/i.test(m.description));
    console.log(
        'paypal',
        paypal.map((p) => ({ a: p.amountCents, d: p.description.slice(0, 100), date: p.accountingDate }))
    );
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

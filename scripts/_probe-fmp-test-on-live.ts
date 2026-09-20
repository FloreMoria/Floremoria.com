import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { hashPartnerApiSecret } from '../lib/partnerApiSecret';

let v = fs.readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)![1].trim();
if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
process.env.DATABASE_URL = v;

const prisma = new PrismaClient();
const publicId = 'fmp_test_probe_live_reject_2026';
const secret = `fms_test_probe_reject_only_${Date.now()}`;

async function main() {
    await prisma.partnerApiCredential.deleteMany({ where: { publicId } });
    await prisma.partnerApiCredential.create({
        data: {
            partnerId: 'cmpcosjdo00008oncx62bgs5e',
            label: 'PROBE reject test-on-live (revoke after)',
            publicId,
            secretHash: hashPartnerApiSecret(secret),
            environment: 'TEST',
            isActive: true,
        },
    });

    const res = await fetch('https://www.floremoria.com/api/v1/partner/order/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Partner-Key': publicId,
            Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ agencyId: 'probe' }),
    });
    const body = await res.text();
    // Non stampare il secret
    console.log(JSON.stringify({ status: res.status, body: body.slice(0, 500) }));

    await prisma.partnerApiCredential.updateMany({
        where: { publicId },
        data: { isActive: false, revokedAt: new Date() },
    });
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

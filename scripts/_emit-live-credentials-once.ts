/**
 * Genera credenziali LIVE AF + IOF.
 * Scrive i segreti SOLO in un file one-shot fuori dal repo (chmod 600).
 * Non stampa mai i segreti su stdout.
 */
import 'dotenv/config';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PrismaClient } from '@prisma/client';
import {
    generatePartnerApiPublicId,
    generatePartnerApiSecretPlain,
    hashPartnerApiSecret,
} from '../lib/partnerApiSecret';

config({ path: '.env' });
config({ path: '.env.local' });

// Prefer Neon from .env over localhost override in .env.local when FORCE_NEON=1
if (process.env.FORCE_NEON === '1') {
    const envFile = fs.readFileSync('.env', 'utf8');
    const m = envFile.match(/^DATABASE_URL=(.+)$/m);
    if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        process.env.DATABASE_URL = v;
    }
}

const prisma = new PrismaClient();

const TARGETS = [
    { match: /annunci\s*funebri/i, type: 'AGGREGATOR' as const, label: 'Annunci Funebri LIVE' },
    { match: /iof|san marco|marghera/i, type: 'FUNERAL_AGENCY' as const, label: 'IOF San Marco LIVE' },
];

async function main() {
    const partners = await prisma.partner.findMany({
        where: { deletedAt: null, partnerType: { in: ['AGGREGATOR', 'FUNERAL_AGENCY'] } },
        select: {
            id: true,
            shopName: true,
            uniqueCode: true,
            partnerType: true,
            masterPartnerId: true,
        },
    });

    console.log(
        'Partners:',
        partners.map((p) => `${p.partnerType} ${p.shopName} (${p.uniqueCode})`).join(' | ')
    );

    const outDir = path.join(os.homedir(), '.floremoria');
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    const outFile = path.join(outDir, `live-secrets-one-shot-${Date.now()}.txt`);
    const lines: string[] = [
        '# ONE-SHOT — copia i segreti nel Hub / verso AF, poi CANCELLA questo file.',
        '# Non commitare. Non inoltrare in chat.',
        '',
    ];
    const publicIds: { partner: string; publicId: string }[] = [];

    for (const t of TARGETS) {
        const partner = partners.find(
            (p) => p.partnerType === t.type && t.match.test(p.shopName)
        );
        if (!partner) {
            console.error('MISSING', t.label);
            process.exitCode = 1;
            continue;
        }
        if (!partner.uniqueCode?.trim()) {
            console.error('NO_UNIQUE_CODE', partner.shopName);
            process.exitCode = 1;
            continue;
        }

        // Revoca eventuali LIVE attive precedenti sullo stesso partner
        await prisma.partnerApiCredential.updateMany({
            where: { partnerId: partner.id, environment: 'LIVE', isActive: true },
            data: { isActive: false, revokedAt: new Date() },
        });

        let publicId = generatePartnerApiPublicId('LIVE', partner.uniqueCode);
        for (let i = 0; i < 5; i++) {
            const clash = await prisma.partnerApiCredential.findUnique({ where: { publicId } });
            if (!clash) break;
            publicId = generatePartnerApiPublicId('LIVE', partner.uniqueCode);
        }
        const secretPlain = generatePartnerApiSecretPlain('LIVE');
        const secretHash = hashPartnerApiSecret(secretPlain);

        await prisma.partnerApiCredential.create({
            data: {
                partnerId: partner.id,
                label: t.label,
                publicId,
                secretHash,
                environment: 'LIVE',
                isActive: true,
            },
        });

        lines.push(`Partner: ${partner.shopName}`);
        lines.push(`Public ID: ${publicId}`);
        lines.push(`Secret: ${secretPlain}`);
        lines.push(`Auth: X-Partner-Key: ${publicId}  +  Authorization: Bearer <secret>`);
        lines.push('---');
        publicIds.push({ partner: partner.shopName, publicId });
    }

    fs.writeFileSync(outFile, lines.join('\n') + '\n', { mode: 0o600 });
    // Solo public id su stdout
    console.log(JSON.stringify({ publicIds, secretsFile: outFile, note: 'secrets only in file' }));
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

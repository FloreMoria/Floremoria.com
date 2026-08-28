/**
 * CLI admin: trova/crea partner B2B (default "Agenzia Test") e mostra credenziali API v1 + cURL di prova.
 *
 * Uso:
 *   npm run partner:key
 *   npm run partner:key -- --name="Agenzia Test"
 *   npm run partner:key -- --id=<partnerId>
 *   npm run partner:key -- --rotate   (nuove credenziali casuali invece del set deterministico di test)
 */
import { loadEnvFiles } from '../lib/loadEnvFiles';

loadEnvFiles();

/** Prisma legge DATABASE_URL: se punta a localhost, usa Neon da .env.local quando presente. */
function preferNonLocalDatabaseUrl(): void {
    const current = process.env.DATABASE_URL?.trim() ?? '';
    const host = current.match(/@([^/:?]+)/)?.[1] ?? '';
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) return;

    for (const key of [
        'DATABASE_URL_UNPOOLED',
        'DATABASE_POSTGRES_URL',
        'POSTGRES_URL_NON_POOLING',
    ]) {
        const candidate = process.env[key]?.trim();
        if (!candidate || !/^postgres(ql)?:\/\//.test(candidate)) continue;
        const candidateHost = candidate.match(/@([^/:?]+)/)?.[1] ?? '';
        if (candidateHost === 'localhost' || candidateHost === '127.0.0.1') continue;
        process.env.DATABASE_URL = candidate;
        return;
    }
}

preferNonLocalDatabaseUrl();

const DEFAULT_PARTNER_NAME = 'Agenzia Test';
const TEST_PUBLIC_ID = 'fmp_test_agenzia_test_2026';
const TEST_SECRET_PLAIN = 'fms_test_secret_agenzia_test_99';

type CliOptions = {
    name: string;
    id: string | null;
    rotate: boolean;
};

type PartnerRow = {
    id: string;
    shopName: string;
    uniqueCode: string | null;
    province: string | null;
    isB2B: boolean;
    isActive: boolean;
    partnerType: string;
    partnershipChannel: string | null;
};

function parseCliOptions(): CliOptions {
    let name = DEFAULT_PARTNER_NAME;
    let id: string | null = null;
    let rotate = false;

    for (const arg of process.argv.slice(2)) {
        if (arg === '--rotate') {
            rotate = true;
            continue;
        }
        if (arg.startsWith('--name=')) {
            name = arg.slice('--name='.length).trim().replace(/^["']|["']$/g, '') || DEFAULT_PARTNER_NAME;
            continue;
        }
        if (arg.startsWith('--id=')) {
            id = arg.slice('--id='.length).trim() || null;
            continue;
        }
    }

    return { name, id, rotate };
}

async function loadDeps() {
    const [{ PartnerType }, { default: prisma }, { generatePartnerCode }, partnerApiSecret] =
        await Promise.all([
            import('@prisma/client'),
            import('../lib/prisma'),
            import('../lib/codeGenerator'),
            import('../lib/partnerApiSecret'),
        ]);

    return { PartnerType, prisma, generatePartnerCode, partnerApiSecret };
}

async function findPartner(
    prisma: Awaited<ReturnType<typeof loadDeps>>['prisma'],
    opts: CliOptions
) {
    if (opts.id) {
        return prisma.partner.findFirst({
            where: { id: opts.id, deletedAt: null },
        });
    }

    return prisma.partner.findFirst({
        where: {
            deletedAt: null,
            shopName: { contains: opts.name, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'asc' },
    });
}

async function ensurePartner(
    deps: Awaited<ReturnType<typeof loadDeps>>,
    opts: CliOptions
): Promise<PartnerRow> {
    const { prisma, PartnerType, generatePartnerCode } = deps;
    const existing = await findPartner(prisma, opts);

    if (existing) {
        const needsUpdate =
            !existing.isB2B ||
            existing.partnerType !== PartnerType.FUNERAL_AGENCY ||
            !existing.uniqueCode?.trim() ||
            !existing.isActive;

        if (needsUpdate) {
            const uniqueCode =
                existing.uniqueCode?.trim() ||
                (await generatePartnerCode(existing.province || 'MI'));

            return prisma.partner.update({
                where: { id: existing.id },
                data: {
                    isB2B: true,
                    isActive: true,
                    partnerType: PartnerType.FUNERAL_AGENCY,
                    uniqueCode,
                    partnershipChannel: existing.partnershipChannel || 'Diretta (FloreMoria)',
                },
            });
        }

        return existing;
    }

    console.warn(`⚠️  Partner "${opts.name}" non trovato: creazione record FUNERAL_AGENCY di test.`);

    const uniqueCode = await generatePartnerCode('MI');

    return prisma.partner.create({
        data: {
            shopName: opts.name,
            ownerName: opts.name,
            address: 'Milano',
            province: 'MI',
            coverageArea: 'Milano',
            email: 'test@floremoria.com',
            agencyNotificationEmail: 'test@floremoria.com',
            uniqueCode,
            isActive: true,
            isB2B: true,
            partnerType: PartnerType.FUNERAL_AGENCY,
            partnershipChannel: 'Diretta (FloreMoria)',
        },
    });
}

async function ensureCredential(
    deps: Awaited<ReturnType<typeof loadDeps>>,
    partnerId: string,
    partnerName: string,
    rotate: boolean
) {
    const { prisma, partnerApiSecret } = deps;
    const { hashPartnerApiSecret, generatePartnerApiPublicId, generatePartnerApiSecretPlain } =
        partnerApiSecret;

    const useDeterministicTestKeys =
        !rotate && partnerName.toLowerCase().includes(DEFAULT_PARTNER_NAME.toLowerCase());

    if (useDeterministicTestKeys) {
        const secretHash = hashPartnerApiSecret(TEST_SECRET_PLAIN);
        const row = await prisma.partnerApiCredential.upsert({
            where: { publicId: TEST_PUBLIC_ID },
            update: {
                partnerId,
                label: 'Agenzia Test (CLI)',
                secretHash,
                isActive: true,
                revokedAt: null,
            },
            create: {
                partnerId,
                label: 'Agenzia Test (CLI)',
                publicId: TEST_PUBLIC_ID,
                secretHash,
                isActive: true,
            },
        });

        return {
            publicId: row.publicId,
            secretPlain: TEST_SECRET_PLAIN,
            note: 'Credenziali deterministiche di test (sempre recuperabili). Usa --rotate per generare un nuovo segreto casuale.',
        };
    }

    const active = await prisma.partnerApiCredential.findFirst({
        where: { partnerId, isActive: true },
        orderBy: { createdAt: 'desc' },
    });

    if (active && !rotate) {
        console.error(
            'Esiste già una credenziale attiva ma il segreto non è recuperabile (hash one-way).'
        );
        console.error(`Public ID attivo: ${active.publicId}`);
        console.error('Rilancia con --rotate per generare e mostrare un nuovo segreto.');
        process.exit(1);
    }

    if (active && rotate) {
        await prisma.partnerApiCredential.update({
            where: { id: active.id },
            data: { isActive: false, revokedAt: new Date() },
        });
    }

    let publicId = generatePartnerApiPublicId();
    for (let i = 0; i < 5; i++) {
        const clash = await prisma.partnerApiCredential.findUnique({ where: { publicId } });
        if (!clash) break;
        publicId = generatePartnerApiPublicId();
    }

    const secretPlain = generatePartnerApiSecretPlain();
    const secretHash = hashPartnerApiSecret(secretPlain);

    const row = await prisma.partnerApiCredential.create({
        data: {
            partnerId,
            label: rotate ? 'CLI rotate' : 'CLI generated',
            publicId,
            secretHash,
            isActive: true,
        },
    });

    return {
        publicId: row.publicId,
        secretPlain,
        note: rotate
            ? 'Nuove credenziali generate (--rotate). Salva il segreto: non sarà più mostrato.'
            : 'Nuove credenziali generate. Salva il segreto: non sarà più mostrato.',
    };
}

function resolveBaseUrl(): string {
    const raw =
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        process.env.VERCEL_URL?.trim() ||
        'http://localhost:3000';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw.replace(/\/$/, '');
    return `https://${raw.replace(/\/$/, '')}`;
}

function buildCurlExample(baseUrl: string, publicId: string, secretPlain: string, productId: string): string {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 2);
    const deliveryDateIso = deliveryDate.toISOString().slice(0, 10);

    const body = {
        deceasedName: 'Mario Rossi (Test)',
        cemeteryName: 'Cimitero Monumentale',
        cemeteryCity: 'Milano',
        deliveryProvince: 'MI',
        deliveryDate: deliveryDateIso,
        buyerFullName: 'Cliente Test',
        buyerEmail: 'test@floremoria.com',
        buyerPhone: '+393400000000',
        ticketMessage: 'Con affetto e vicinanza.',
        lineItems: [{ productId, quantity: 1 }],
    };

    return `curl -X POST ${baseUrl}/api/v1/partner/order/create \\
  -H "Content-Type: application/json" \\
  -H "X-Partner-Key: ${publicId}" \\
  -H "Authorization: Bearer ${secretPlain}" \\
  -d '${JSON.stringify(body, null, 2)}'`;
}

async function main(): Promise<void> {
    const opts = parseCliOptions();
    const deps = await loadDeps();
    const { prisma } = deps;

    const partner = await ensurePartner(deps, opts);

    if (!partner.uniqueCode?.trim()) {
        console.error('Il partner non ha uniqueCode: impossibile creare credenziali API.');
        process.exit(1);
    }

    const cred = await ensureCredential(deps, partner.id, partner.shopName, opts.rotate);

    const product =
        (await prisma.product.findFirst({
            where: { slug: 'bouquet-ricordo-affettuoso', isActive: true },
            select: { id: true, name: true },
        })) ??
        (await prisma.product.findFirst({
            where: { isActive: true },
            orderBy: { basePriceCents: 'asc' },
            select: { id: true, name: true },
        }));

    if (!product) {
        console.error('Nessun prodotto attivo nel DB: esegui npm run db:seed prima del test cURL.');
        process.exit(1);
    }

    const baseUrl = resolveBaseUrl();
    const divider = '--------------------------------------------------';

    console.log(divider);
    console.log(`🏢 Partner: ${partner.shopName}`);
    console.log(`🆔 ID: ${partner.id}`);
    console.log(`🏷️  Codice referral: ${partner.uniqueCode}`);
    console.log(`🔑 Public ID (X-Partner-Key): ${cred.publicId}`);
    console.log(`🔐 Secret (Authorization Bearer): ${cred.secretPlain}`);
    console.log(divider);
    console.log(`ℹ️  ${cred.note}`);
    console.log(divider);
    console.log('🚀 Esempio cURL per Creare un Ordine di Test:');
    console.log(buildCurlExample(baseUrl, cred.publicId, cred.secretPlain, product.id));
    console.log(divider);
    console.log(`📦 Prodotto usato nel payload: ${product.name} (${product.id})`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        const { default: prisma } = await import('../lib/prisma');
        await prisma.$disconnect();
    });

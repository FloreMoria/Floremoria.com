/**
 * Pulizia sicura Vercel Blob — logica condivisa script + cron API.
 *
 * Cancella SOLO:
 *  - path tmp/test/scratch/futuria/staging
 *  - media campagne MarketingCampaign PUBLISHED da oltre 30 giorni
 *
 * NON tocca MAI:
 *  - foto consegne (delivery-proof / social-ready)
 *  - documenti fiscali (floremoria-finance/*)
 *  - immagini prodotto ancora referenziate
 *  - campagne draft / pubblicate di recente (< 30 gg)
 */

import { list, del, type ListBlobResultBlob } from '@vercel/blob';

export type BlobCleanupItem = {
    url: string;
    pathname: string;
    size: number;
    uploadedAt: Date;
    reason: string;
};

export type BlobCleanupReport = {
    totalFiles: number;
    totalBytes: number;
    candidateCount: number;
    candidateBytes: number;
    deletedCount: number;
    deletedBytes: number;
    errors: number;
    byReason: Record<string, { count: number; bytes: number }>;
    byPrefix: Array<{ prefix: string; count: number; bytes: number }>;
    residualBytesEstimate: number;
    dryRun: boolean;
    clearedCampaignMedia?: number;
};

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Prefissi SEMPRE protetti. */
const PROTECTED_PREFIXES = [
    'floremoria-finance/',
    'floremoria-blob-foto-consegne/',
    'delivery-proof/',
    'floremoria-media/products/',
    'floremoria-media/whatsapp-chat/',
];

/** Pattern path chiaramente temporanei / test. */
const SAFE_PATH_RES: Array<{ re: RegExp; reason: string }> = [
    { re: /(^|\/)tmp\//i, reason: 'cartella tmp/' },
    { re: /(^|\/)temp\//i, reason: 'cartella temp/' },
    { re: /(^|\/)test\//i, reason: 'cartella test/' },
    { re: /(^|\/)scratch\//i, reason: 'cartella scratch/' },
    { re: /^futuria\//i, reason: 'prefisso futuria/ (legacy test)' },
    { re: /test-futuria/i, reason: 'file test Futuria' },
    { re: /(^|\/)test[-_]/i, reason: 'prefisso test-' },
    { re: /\.tmp$/i, reason: 'estensione .tmp' },
    { re: /\/publish-staging\//i, reason: 'staging Meta (TTL breve)' },
    { re: /^whatsapp\/delivery-staging\//i, reason: 'whatsapp delivery-staging' },
];

function pathnameFromUrl(url: string): string {
    try {
        return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    } catch {
        return url;
    }
}

function prefixBucket(pathname: string): string {
    const parts = pathname.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return parts[0] || '(root)';
}

function isProtectedPath(pathname: string): boolean {
    return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

function matchSafePath(pathname: string): string | null {
    for (const { re, reason } of SAFE_PATH_RES) {
        if (re.test(pathname)) return reason;
    }
    return null;
}

async function listAllBlobs(token?: string): Promise<ListBlobResultBlob[]> {
    const out: ListBlobResultBlob[] = [];
    let cursor: string | undefined;
    do {
        const page = await list({
            cursor,
            limit: 1000,
            ...(token ? { token } : {}),
        });
        out.push(...page.blobs);
        cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
}

type DbCleanupContext = {
    /** Path ancora da proteggere (prodotti, campagne recenti, fiscali…). */
    protectedPaths: Set<string>;
    /** Path media campagne pubblicate da >30gg → cancellabili. */
    publishedOldPaths: Set<string>;
    /** ID campagne il cui media verrà azzerato dopo delete. */
    publishedOldCampaignIds: string[];
};

async function collectDbCleanupContext(): Promise<DbCleanupContext> {
    const protectedPaths = new Set<string>();
    const publishedOldPaths = new Set<string>();
    const publishedOldCampaignIds: string[] = [];

    const addProtected = (url: string | null | undefined) => {
        if (!url || !/blob\.vercel-storage\.com/i.test(url)) return;
        protectedPaths.add(pathnameFromUrl(url));
    };

    try {
        const { default: prisma } = await import('@/lib/prisma');
        const cutoff = new Date(Date.now() - ONE_MONTH_MS);

        const [products, productImages, campaigns] = await Promise.all([
            prisma.product.findMany({
                where: { mediaUrl: { not: null } },
                select: { mediaUrl: true },
            }),
            prisma.productImage.findMany({ select: { url: true } }),
            prisma.marketingCampaign.findMany({
                select: {
                    id: true,
                    status: true,
                    publishedAt: true,
                    imageUrl: true,
                    videoUrl: true,
                },
            }),
        ]);

        for (const p of products) addProtected(p.mediaUrl);
        for (const img of productImages) addProtected(img.url);

        for (const c of campaigns) {
            const publishedOld =
                c.status === 'PUBLISHED' &&
                c.publishedAt != null &&
                c.publishedAt.getTime() <= cutoff.getTime();

            if (publishedOld) {
                publishedOldCampaignIds.push(c.id);
                if (c.imageUrl && /blob\.vercel-storage\.com/i.test(c.imageUrl)) {
                    publishedOldPaths.add(pathnameFromUrl(c.imageUrl));
                }
                if (c.videoUrl && /blob\.vercel-storage\.com/i.test(c.videoUrl)) {
                    publishedOldPaths.add(pathnameFromUrl(c.videoUrl));
                }
            } else {
                addProtected(c.imageUrl);
                addProtected(c.videoUrl);
            }
        }

        // Fiscali: proteggere sempre
        const fiscalRows = await Promise.all([
            prisma.manualFinanceExpense
                .findMany({ where: { blobUrl: { not: null } }, select: { blobUrl: true } })
                .catch(() => [] as Array<{ blobUrl: string | null }>),
            prisma.bankStatementDocument
                .findMany({ where: { blobUrl: { not: null } }, select: { blobUrl: true } })
                .catch(() => [] as Array<{ blobUrl: string | null }>),
            prisma.saasForeignInvoice
                .findMany({ where: { blobUrl: { not: null } }, select: { blobUrl: true } })
                .catch(() => [] as Array<{ blobUrl: string | null }>),
            prisma.financialLedgerEntry
                .findMany({
                    where: { attachmentUrl: { not: null } },
                    select: { attachmentUrl: true },
                    take: 10000,
                })
                .catch(() => [] as Array<{ attachmentUrl: string | null }>),
            prisma.customerOrderReceipt
                .findMany({ where: { blobUrl: { not: null } }, select: { blobUrl: true } })
                .catch(() => [] as Array<{ blobUrl: string | null }>),
        ]);

        for (const rows of fiscalRows) {
            for (const r of rows) {
                addProtected((r as { blobUrl?: string | null }).blobUrl);
                addProtected((r as { attachmentUrl?: string | null }).attachmentUrl);
            }
        }

        console.info(
            `[blob-cleanup] DB: campagne pubblicate >30gg=${publishedOldCampaignIds.length} ` +
                `mediaPath=${publishedOldPaths.size} protetti=${protectedPaths.size}`,
        );
    } catch (err) {
        console.warn(
            '[blob-cleanup] DB non disponibile — solo path test/staging (niente campagne pubblicate):',
            err instanceof Error ? err.message : err,
        );
    }

    return { protectedPaths, publishedOldPaths, publishedOldCampaignIds };
}

async function clearPublishedCampaignMediaUrls(campaignIds: string[]): Promise<number> {
    if (campaignIds.length === 0) return 0;
    try {
        const { default: prisma } = await import('@/lib/prisma');
        // Placeholder vuoto: imageUrl è required nello schema → stringa vuota.
        const result = await prisma.marketingCampaign.updateMany({
            where: { id: { in: campaignIds } },
            data: { imageUrl: '', videoUrl: null },
        });
        return result.count;
    } catch (err) {
        console.warn(
            '[blob-cleanup] clear campaign media URLs fallito:',
            err instanceof Error ? err.message : err,
        );
        return 0;
    }
}

export async function runSafeBlobCleanup(opts: {
    dryRun: boolean;
    /** Token RW esplicito (script locale). Su Vercel OIDC: omettere. */
    token?: string;
}): Promise<BlobCleanupReport> {
    const { dryRun, token } = opts;
    const blobs = await listAllBlobs(token);
    const totalBytes = blobs.reduce((s, b) => s + b.size, 0);

    const byPrefixMap = new Map<string, { count: number; bytes: number }>();
    for (const b of blobs) {
        const key = prefixBucket(b.pathname);
        const cur = byPrefixMap.get(key) || { count: 0, bytes: 0 };
        cur.count++;
        cur.bytes += b.size;
        byPrefixMap.set(key, cur);
    }
    const byPrefix = [...byPrefixMap.entries()]
        .sort((a, b) => b[1].bytes - a[1].bytes)
        .map(([prefix, v]) => ({ prefix, count: v.count, bytes: v.bytes }));

    const { protectedPaths, publishedOldPaths, publishedOldCampaignIds } =
        await collectDbCleanupContext();

    const candidates: BlobCleanupItem[] = [];
    for (const b of blobs) {
        // Foto consegne + fiscali + prodotti: mai toccare
        if (isProtectedPath(b.pathname)) continue;
        if (protectedPaths.has(b.pathname)) continue;

        const safeReason = matchSafePath(b.pathname);
        if (safeReason) {
            candidates.push({
                url: b.url,
                pathname: b.pathname,
                size: b.size,
                uploadedAt: b.uploadedAt,
                reason: safeReason,
            });
            continue;
        }

        if (publishedOldPaths.has(b.pathname)) {
            candidates.push({
                url: b.url,
                pathname: b.pathname,
                size: b.size,
                uploadedAt: b.uploadedAt,
                reason: 'campagna PUBLISHED >30gg',
            });
        }
    }

    const unique = new Map<string, BlobCleanupItem>();
    for (const c of candidates) unique.set(c.pathname, c);
    const toDelete = [...unique.values()];
    const candidateBytes = toDelete.reduce((s, c) => s + c.size, 0);

    const byReason: Record<string, { count: number; bytes: number }> = {};
    for (const c of toDelete) {
        const cur = byReason[c.reason] || { count: 0, bytes: 0 };
        cur.count++;
        cur.bytes += c.size;
        byReason[c.reason] = cur;
    }

    let deletedCount = 0;
    let deletedBytes = 0;
    let errors = 0;
    let clearedCampaignMedia = 0;

    if (!dryRun && toDelete.length > 0) {
        const BATCH = 40;
        for (let i = 0; i < toDelete.length; i += BATCH) {
            const batch = toDelete.slice(i, i + BATCH);
            try {
                await del(
                    batch.map((c) => c.url),
                    token ? { token } : {},
                );
                for (const c of batch) {
                    deletedCount++;
                    deletedBytes += c.size;
                }
            } catch {
                for (const c of batch) {
                    try {
                        await del(c.url, token ? { token } : {});
                        deletedCount++;
                        deletedBytes += c.size;
                    } catch (e) {
                        errors++;
                        console.warn(
                            '[blob-cleanup] del fallito:',
                            c.pathname,
                            e instanceof Error ? e.message : e,
                        );
                    }
                }
            }
        }

        // Solo se abbiamo cancellato media campagne pubblicate: azzera URL in DB
        const deletedPublished = toDelete.some((c) => c.reason === 'campagna PUBLISHED >30gg');
        if (deletedPublished && publishedOldCampaignIds.length > 0) {
            clearedCampaignMedia = await clearPublishedCampaignMediaUrls(publishedOldCampaignIds);
        }
    }

    const freed = dryRun ? candidateBytes : deletedBytes;

    return {
        totalFiles: blobs.length,
        totalBytes,
        candidateCount: toDelete.length,
        candidateBytes,
        deletedCount: dryRun ? 0 : deletedCount,
        deletedBytes: dryRun ? 0 : deletedBytes,
        errors,
        byReason,
        byPrefix,
        residualBytesEstimate: Math.max(0, totalBytes - freed),
        dryRun,
        clearedCampaignMedia: dryRun ? 0 : clearedCampaignMedia,
    };
}

export function formatMb(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(2);
}

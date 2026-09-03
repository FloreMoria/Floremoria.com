/**
 * Pulizia sicura Vercel Blob — logica condivisa script + cron API.
 *
 * Cancella SOLO:
 *  - path tmp/test/scratch/futuria/staging
 *  - foto consegne di ordini isTest=true
 *  - immagini prodotto/marketing orfane (non referenziate in Neon)
 *
 * NON tocca: floremoria-finance/*, foto ordini reali, media referenziati.
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
};

const PROTECTED_PREFIXES = ['floremoria-finance/'];

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

async function collectDbReferences(): Promise<{
    referenced: Set<string>;
    testOrderIds: Set<string>;
    existingOrderIds: Set<string>;
}> {
    const referenced = new Set<string>();
    const testOrderIds = new Set<string>();
    const existingOrderIds = new Set<string>();

    const addUrl = (url: string | null | undefined) => {
        if (!url || !/blob\.vercel-storage\.com/i.test(url)) return;
        referenced.add(pathnameFromUrl(url));
    };

    try {
        const { default: prisma } = await import('@/lib/prisma');

        const [products, productImages, campaigns, testOrders, realOrders, deliveryProofs, allOrderIds] =
            await Promise.all([
            prisma.product.findMany({
                where: { mediaUrl: { not: null } },
                select: { mediaUrl: true },
            }),
            prisma.productImage.findMany({ select: { url: true } }),
            prisma.marketingCampaign.findMany({
                select: { imageUrl: true, videoUrl: true },
            }),
            prisma.order.findMany({
                where: { isTest: true },
                select: { id: true },
            }),
            prisma.order.findMany({
                where: {
                    isTest: false,
                    photos: { isEmpty: false },
                },
                select: { photos: true },
                take: 8000,
            }),
            prisma.deliveryProof.findMany({
                select: {
                    orderId: true,
                    photoBeforeUrl: true,
                    photoAfterUrl: true,
                    photosBeforeUrls: true,
                    photosAfterUrls: true,
                    socialReadyAfterUrls: true,
                    socialReadyPrimaryUrl: true,
                    order: { select: { isTest: true } },
                },
            }),
            prisma.order.findMany({
                select: { id: true },
                take: 50000,
            }),
        ]);

        for (const o of allOrderIds) existingOrderIds.add(o.id);

        for (const p of products) addUrl(p.mediaUrl);
        for (const img of productImages) addUrl(img.url);
        for (const c of campaigns) {
            addUrl(c.imageUrl);
            addUrl(c.videoUrl);
        }
        for (const o of testOrders) testOrderIds.add(o.id);
        for (const o of realOrders) {
            for (const u of o.photos || []) addUrl(u);
        }
        for (const d of deliveryProofs) {
            if (d.order?.isTest) {
                testOrderIds.add(d.orderId);
                continue; // foto test: NON proteggere
            }
            addUrl(d.photoBeforeUrl);
            addUrl(d.photoAfterUrl);
            addUrl(d.socialReadyPrimaryUrl);
            for (const u of d.photosBeforeUrls || []) addUrl(u);
            for (const u of d.photosAfterUrls || []) addUrl(u);
            for (const u of d.socialReadyAfterUrls || []) addUrl(u);
        }

        // Allegati fiscali / ledger (best-effort: modelli opzionali)
        const extras: Array<Promise<Array<{ blobUrl?: string | null; attachmentUrl?: string | null }>>> = [];
        extras.push(
            prisma.manualFinanceExpense
                .findMany({
                    where: { blobUrl: { not: null } },
                    select: { blobUrl: true },
                })
                .catch(() => []),
        );
        extras.push(
            prisma.bankStatementDocument
                .findMany({
                    where: { blobUrl: { not: null } },
                    select: { blobUrl: true },
                })
                .catch(() => []),
        );
        extras.push(
            prisma.saasForeignInvoice
                .findMany({
                    where: { blobUrl: { not: null } },
                    select: { blobUrl: true },
                })
                .catch(() => []),
        );
        extras.push(
            prisma.financialLedgerEntry
                .findMany({
                    where: { attachmentUrl: { not: null } },
                    select: { attachmentUrl: true },
                    take: 10000,
                })
                .catch(() => []),
        );
        extras.push(
            prisma.customerOrderReceipt
                .findMany({
                    where: { blobUrl: { not: null } },
                    select: { blobUrl: true },
                })
                .catch(() => []),
        );

        const settled = await Promise.all(extras);
        for (const rows of settled) {
            for (const r of rows) {
                addUrl(r.blobUrl);
                addUrl(r.attachmentUrl);
            }
        }
    } catch (err) {
        console.warn(
            '[blob-cleanup] DB refs non disponibili — solo path test/staging:',
            err instanceof Error ? err.message : err,
        );
    }

    return { referenced, testOrderIds, existingOrderIds };
}

function extractDeliveryOrderId(pathname: string): string | null {
    const m =
        pathname.match(
            /floremoria-blob-foto-consegne\/(?:delivery-proof|social-ready)\/([^/]+)\//,
        ) || pathname.match(/^delivery-proof\/([^/]+)\//);
    return m?.[1] || null;
}

function isTestOrderProof(pathname: string, testOrderIds: Set<string>): boolean {
    const orderId = extractDeliveryOrderId(pathname);
    if (!orderId) return false;
    return testOrderIds.has(orderId);
}

function isOrphanProductMedia(pathname: string, referenced: Set<string>): boolean {
    if (!pathname.startsWith('floremoria-media/products/')) return false;
    return !referenced.has(pathname);
}

function isOrphanDeliveryProofFolder(
    pathname: string,
    existingOrderIds: Set<string>,
): boolean {
    // Solo se abbiamo caricato gli ID ordine dal DB (evita wipe se DB down).
    if (existingOrderIds.size === 0) return false;
    const orderId = extractDeliveryOrderId(pathname);
    if (!orderId) return false;
    return !existingOrderIds.has(orderId);
}

function isUnreferencedDeliveryProof(
    pathname: string,
    referenced: Set<string>,
    existingOrderIds: Set<string>,
): boolean {
    // Foto sotto un ordine esistente ma URL non più referenziato (duplicati random suffix).
    if (existingOrderIds.size === 0 || referenced.size === 0) return false;
    if (
        !pathname.includes('floremoria-blob-foto-consegne/') &&
        !pathname.startsWith('delivery-proof/')
    ) {
        return false;
    }
    if (referenced.has(pathname)) return false;
    const orderId = extractDeliveryOrderId(pathname);
    if (!orderId) return false;
    // Solo se l'ordine esiste: altrimenti gestito da orphan folder.
    if (!existingOrderIds.has(orderId)) return false;
    return true;
}

function isOrphanMarketing(pathname: string, referenced: Set<string>, uploadedAt: Date): boolean {
    if (!pathname.startsWith('marketing/campagne/')) return false;
    if (pathname.includes('/publish-staging/')) return false;
    if (pathname.includes('/reel-audio/')) return false;
    if (referenced.has(pathname)) return false;
    // 7 giorni: draft/generation abortite senza riga MarketingCampaign
    const ageMs = Date.now() - uploadedAt.getTime();
    return ageMs > 7 * 24 * 60 * 60 * 1000;
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

    const { referenced, testOrderIds, existingOrderIds } = await collectDbReferences();

    const candidates: BlobCleanupItem[] = [];
    for (const b of blobs) {
        if (isProtectedPath(b.pathname)) continue;

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

        if (isTestOrderProof(b.pathname, testOrderIds)) {
            candidates.push({
                url: b.url,
                pathname: b.pathname,
                size: b.size,
                uploadedAt: b.uploadedAt,
                reason: 'foto consegna ordine isTest=true',
            });
            continue;
        }

        if (isOrphanDeliveryProofFolder(b.pathname, existingOrderIds)) {
            candidates.push({
                url: b.url,
                pathname: b.pathname,
                size: b.size,
                uploadedAt: b.uploadedAt,
                reason: 'foto consegna ordine assente dal DB',
            });
            continue;
        }

        if (
            isUnreferencedDeliveryProof(b.pathname, referenced, existingOrderIds) &&
            Date.now() - b.uploadedAt.getTime() > 7 * 24 * 60 * 60 * 1000
        ) {
            candidates.push({
                url: b.url,
                pathname: b.pathname,
                size: b.size,
                uploadedAt: b.uploadedAt,
                reason: 'foto consegna duplicata/non referenziata (>7gg)',
            });
            continue;
        }

        if (referenced.size > 0 && isOrphanProductMedia(b.pathname, referenced)) {
            candidates.push({
                url: b.url,
                pathname: b.pathname,
                size: b.size,
                uploadedAt: b.uploadedAt,
                reason: 'immagine prodotto orfana',
            });
            continue;
        }

        if (referenced.size > 0 && isOrphanMarketing(b.pathname, referenced, b.uploadedAt)) {
            candidates.push({
                url: b.url,
                pathname: b.pathname,
                size: b.size,
                uploadedAt: b.uploadedAt,
                reason: 'marketing orfano >30gg',
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
    };
}

export function formatMb(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(2);
}

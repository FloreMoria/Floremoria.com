/**
 * Diagnosi live YouDOX: token expires_in, list unread vs all, sync sample, last invoices per vendor.
 * Uso: npx tsx scripts/_diag-youdox-sync-live.ts
 * Non stampa secret. Opzionale: --force-wide per fetch lookback 400gg onlyUnread=false.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' }); // non override

import fs from 'node:fs';
import path from 'node:path';
import {
    clearYoudoxTokenCache,
    getFinancialYoudoxClient,
} from '@/lib/financial/youdoxClient';
import { getYoudoxAccessToken, loadYoudoxConfigFromEnv } from '@/lib/youdox/auth';
import prisma from '@/lib/prisma';

async function probeToken() {
    clearYoudoxTokenCache();
    const config = loadYoudoxConfigFromEnv();
    if (!config) throw new Error('YOUDOX config assente');

    const tokenUrl = config.tokenUrl.trim();
    const body = new URLSearchParams({
        username: config.username.trim(),
        password: config.password.trim(),
        client_id: config.clientId.trim(),
    });
    const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body,
    });
    const json = (await res.json()) as Record<string, unknown>;
    return {
        httpStatus: res.status,
        ok: res.ok && !('error' in json),
        expires_in: json.expires_in ?? null,
        token_type: json.token_type ?? null,
        error: json.error ?? null,
        error_message: json.error_message ?? null,
        hasAccessToken: typeof json.access_token === 'string' && json.access_token.length > 0,
        cacheCodeFallbackSeconds: 3600,
        note: 'Cache in-memory usa expires_in dalla risposta, fallback 3600 se assente; rinnovo con margine 60s.',
    };
}

async function main() {
    const forceWide = process.argv.includes('--force-wide');
    const client = getFinancialYoudoxClient();

    const tokenProbe = await probeToken();
    // warm cache via client
    await getYoudoxAccessToken(client.config);

    const now = new Date();
    const from120 = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const fromWide = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);

    console.info('[diag] list unread...');
    let unread: Awaited<ReturnType<typeof client.fetchUnreadInvoices>> = [];
    let unreadErr: string | null = null;
    try {
        unread = await client.fetchUnreadInvoices();
    } catch (e) {
        unreadErr = e instanceof Error ? e.message : String(e);
    }

    console.info('[diag] list all for sync (120d)...');
    let all120: Awaited<ReturnType<typeof client.fetchPassiveInvoicesForSync>> = [];
    let all120Err: string | null = null;
    try {
        all120 = await client.fetchPassiveInvoicesForSync({
            timestampFrom: from120,
            lookbackDays: 120,
            onlyUnread: false,
        });
    } catch (e) {
        all120Err = e instanceof Error ? e.message : String(e);
    }

    let allWide: typeof all120 = [];
    let allWideErr: string | null = null;
    if (forceWide) {
        console.info('[diag] list all wide 400d...');
        try {
            allWide = await client.fetchPassiveInvoicesForSync({
                timestampFrom: fromWide,
                lookbackDays: 400,
                onlyUnread: false,
            });
        } catch (e) {
            allWideErr = e instanceof Error ? e.message : String(e);
        }
    }

    // Ultima fattura per fornitore in DB
    const expenses = await prisma.manualFinanceExpense.findMany({
        where: { docType: { in: ['FATTURA', 'NOTA_CREDITO'] } },
        select: {
            expenseDate: true,
            vendorName: true,
            metadataJson: true,
            totalCents: true,
            createdAt: true,
        },
        orderBy: { expenseDate: 'desc' },
        take: 5000,
    });
    const lastByVendor = new Map<
        string,
        { vendorName: string; invoiceNumber: string | null; expenseDate: string; totalEuro: number; createdAt: string }
    >();
    for (const e of expenses) {
        const meta = (e.metadataJson || {}) as Record<string, unknown>;
        const vendor = e.vendorName || 'UNKNOWN';
        if (lastByVendor.has(vendor)) continue;
        lastByVendor.set(vendor, {
            vendorName: vendor,
            invoiceNumber: typeof meta.invoiceNumber === 'string' ? meta.invoiceNumber : null,
            expenseDate: e.expenseDate.toISOString().slice(0, 10),
            totalEuro: +(e.totalCents / 100).toFixed(2),
            createdAt: e.createdAt.toISOString(),
        });
    }

    const syncState = await prisma.systemState.findUnique({ where: { key: 'youdox:sync:passive' } });
    let parsedState: { lastSyncAt?: string; processedKeys?: string[] } | null = null;
    try {
        parsedState = syncState?.value ? JSON.parse(syncState.value) : null;
    } catch {
        parsedState = null;
    }

    const report = {
        generatedAt: new Date().toISOString(),
        tokenProbe,
        markAsReadOrder: {
            codePath: 'app/api/v1/finance/youdox/sync/route.ts',
            order: 'downloadInvoiceXml → ingestSdiInvoiceUpload → markInvoiceAsRead',
            hypothesisMarkBeforeDb: false,
            note: 'markInvoiceAsRead è DOPO ingest riuscito (try). Se ingest throw, non marca. Se ingest ok con imported=0, marca comunque.',
            unreadOnlyBurnRisk:
                'Rischio residuo solo se un vecchio flusso usava OnlyUnread=true e marcava senza salvare; il sync dashboard attuale usa listAllReceivedForSync(onlyUnread:false).',
        },
        listUnread: {
            error: unreadErr,
            count: unread.length,
            sample: unread.slice(0, 10).map((i) => ({
                key: i.InvoiceKey,
                numero: i.FatturaNumero,
                data: i.FatturaData,
                fornitore: i.DichiaranteDenominazione || i.ClienteDenominazione,
            })),
        },
        listAll120d: {
            windowFrom: from120.toISOString(),
            windowTo: now.toISOString(),
            onlyUnread: false,
            error: all120Err,
            count: all120.length,
            sample: all120.slice(0, 10).map((i) => ({
                key: i.InvoiceKey,
                numero: i.FatturaNumero,
                data: i.FatturaData,
                fornitore: i.DichiaranteDenominazione || i.ClienteDenominazione,
            })),
        },
        listAllWide400d: forceWide
            ? {
                  windowFrom: fromWide.toISOString(),
                  windowTo: now.toISOString(),
                  onlyUnread: false,
                  error: allWideErr,
                  count: allWide.length,
              }
            : { skipped: true, hint: 'Rilancia con --force-wide' },
        syncState: {
            lastSyncAt: parsedState?.lastSyncAt ?? null,
            processedKeysCount: parsedState?.processedKeys?.length ?? 0,
        },
        lastInvoicePerVendor: [...lastByVendor.values()].sort((a, b) =>
            b.expenseDate.localeCompare(a.expenseDate)
        ),
    };

    const out = path.join(process.cwd(), 'docs/verbali/17-09-2026-youdox-sync-diag.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({
        tokenHttp: tokenProbe.httpStatus,
        expires_in: tokenProbe.expires_in,
        unread: unread.length,
        unreadErr,
        all120: all120.length,
        all120Err,
        wide: forceWide ? allWide.length : null,
        vendors: lastByVendor.size,
        out,
    }, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());

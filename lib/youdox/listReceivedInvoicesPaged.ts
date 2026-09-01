import { soapListReceivedByFilter } from '@/lib/youdox/soap';
import type { YoudoxConfig, YoudoxInvoice, YoudoxInvoicesFilter } from '@/lib/youdox/types';

/** YouDOX restituisce ~50 righe per chiamata: sotto soglia non serve subdividere. */
const PAGE_SIZE_HINT = Number(process.env.YOUDOX_SYNC_PAGE_HINT || 50);
const DEFAULT_CHUNK_DAYS = Number(process.env.YOUDOX_SYNC_CHUNK_DAYS || 14);
const DEFAULT_LOOKBACK_DAYS = Number(process.env.YOUDOX_SYNC_LOOKBACK_DAYS || 120);

export type SyncReceivedWindowOptions = {
    lookbackDays?: number;
    onlyUnread?: boolean;
    now?: Date;
};

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function mergeInvoices(target: Map<string, YoudoxInvoice>, batch: YoudoxInvoice[]): void {
    for (const inv of batch) {
        if (inv.InvoiceKey) target.set(inv.InvoiceKey, inv);
    }
}

/**
 * Scarica fatture passive in finestre temporali ricorsive.
 * Perché: l'API non espone paginazione esplicita e tronca a ~50 documenti per richiesta.
 */
async function fetchReceivedChunk(
    config: YoudoxConfig,
    token: string,
    filter: YoudoxInvoicesFilter,
    depth = 0
): Promise<YoudoxInvoice[]> {
    const from = new Date(filter.TimestampFrom || 0);
    const to = new Date(filter.TimestampTo || Date.now());
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        return [];
    }

    const batch = await soapListReceivedByFilter(config, token, {
        ...filter,
        TimestampFrom: from.toISOString(),
        TimestampTo: to.toISOString(),
        Status: undefined,
    });

    if (batch.length < PAGE_SIZE_HINT || depth >= 8) {
        return batch;
    }

    const spanMs = to.getTime() - from.getTime();
    if (spanMs <= 24 * 60 * 60 * 1000) {
        return batch;
    }

    const mid = new Date(from.getTime() + Math.floor(spanMs / 2));
    const left = await fetchReceivedChunk(
        config,
        token,
        { ...filter, TimestampFrom: from.toISOString(), TimestampTo: mid.toISOString() },
        depth + 1
    );
    const right = await fetchReceivedChunk(
        config,
        token,
        {
            ...filter,
            TimestampFrom: new Date(mid.getTime() + 1).toISOString(),
            TimestampTo: to.toISOString(),
        },
        depth + 1
    );

    const byKey = new Map<string, YoudoxInvoice>();
    mergeInvoices(byKey, left);
    mergeInvoices(byKey, right);
    return [...byKey.values()];
}

/**
 * Elenco completo fatture passive nel periodo (default: anno corrente + lookback).
 * Non filtra per Status; OnlyUnread configurabile (default false per sync completo).
 */
export async function fetchAllReceivedInvoicesForSync(
    config: YoudoxConfig,
    token: string,
    options: SyncReceivedWindowOptions = {}
): Promise<YoudoxInvoice[]> {
    const now = options.now ?? new Date();
    const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    const timestampFrom = addDays(now, -lookbackDays);
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const dataFatturaFrom = timestampFrom < yearStart ? timestampFrom : yearStart;

    const baseFilter: YoudoxInvoicesFilter = {
        TimestampFrom: timestampFrom.toISOString(),
        TimestampTo: now.toISOString(),
        DataFatturaFrom: dataFatturaFrom.toISOString(),
        DataFatturaTo: now.toISOString(),
        OnlyUnread: options.onlyUnread ?? false,
        ShowAlsoDeleted: false,
    };

    console.info('[youdox] Sync window', {
        timestampFrom: baseFilter.TimestampFrom?.slice(0, 10),
        timestampTo: baseFilter.TimestampTo?.slice(0, 10),
        dataFatturaFrom: baseFilter.DataFatturaFrom?.slice(0, 10),
        dataFatturaTo: baseFilter.DataFatturaTo?.slice(0, 10),
        onlyUnread: baseFilter.OnlyUnread,
    });

    const byKey = new Map<string, YoudoxInvoice>();
    let cursor = new Date(timestampFrom);

    while (cursor < now) {
        const chunkEnd = addDays(cursor, DEFAULT_CHUNK_DAYS);
        const effectiveEnd = chunkEnd > now ? now : chunkEnd;

        const batch = await fetchReceivedChunk(config, token, {
            ...baseFilter,
            TimestampFrom: cursor.toISOString(),
            TimestampTo: effectiveEnd.toISOString(),
            DataFatturaFrom: dataFatturaFrom.toISOString(),
            DataFatturaTo: effectiveEnd.toISOString(),
        });

        mergeInvoices(byKey, batch);
        cursor = new Date(effectiveEnd.getTime() + 1);
    }

    const invoices = [...byKey.values()].sort((a, b) => {
        const ta = a.StatusTimestamp || a.FatturaData || '';
        const tb = b.StatusTimestamp || b.FatturaData || '';
        return tb.localeCompare(ta);
    });

    console.info('[youdox] Sync window risultato', { count: invoices.length });
    return invoices;
}

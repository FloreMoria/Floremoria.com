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
    /** Override limite inferiore (risincronizzazione forzata). */
    timestampFrom?: string | Date;
    /** Override limite superiore (default: fine giornata UTC odierna). */
    timestampTo?: string | Date;
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
 *
 * Nota: DataFatturaFrom/To restano sul range completo (non sul chunk di ricezione),
 * altrimenti fatture con data documento agosto ricevute a settembre vengono escluse.
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

    const requestFilter: YoudoxInvoicesFilter = {
        ...filter,
        TimestampFrom: from.toISOString(),
        TimestampTo: to.toISOString(),
        Status: undefined,
    };

    console.info('[youdox-sync] fetchReceivedChunk', {
        depth,
        timestampFrom: requestFilter.TimestampFrom?.slice(0, 19),
        timestampTo: requestFilter.TimestampTo?.slice(0, 19),
        dataFatturaFrom: requestFilter.DataFatturaFrom?.slice(0, 10),
        dataFatturaTo: requestFilter.DataFatturaTo?.slice(0, 10),
        onlyUnread: requestFilter.OnlyUnread,
    });

    const batch = await soapListReceivedByFilter(config, token, requestFilter);
    const hasMore = batch.length >= PAGE_SIZE_HINT;

    console.log('[youdox-sync-debug]', {
        from: requestFilter.TimestampFrom,
        to: requestFilter.TimestampTo,
        countReceived: batch.length,
        hasMore,
        depth,
    });

    console.info('[youdox-sync] fetchReceivedChunk result', {
        depth,
        count: batch.length,
        sample: batch.slice(0, 3).map((inv) => ({
            key: inv.InvoiceKey,
            numero: inv.FatturaNumero,
            data: inv.FatturaData,
            statusTs: inv.StatusTimestamp,
            cliente: inv.ClienteDenominazione || inv.DichiaranteDenominazione,
        })),
    });

    const spanMs = to.getTime() - from.getTime();
    if (spanMs <= 24 * 60 * 60 * 1000 || depth >= 8) {
        return batch;
    }

    // Subdivide se pieno (≥50) o se vuoto: l'API può troncare/omettere su finestre larghe.
    if (batch.length < PAGE_SIZE_HINT && batch.length > 0) {
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
    const endOfToday = options.timestampTo
        ? new Date(options.timestampTo)
        : new Date(now);
    if (!options.timestampTo) {
        endOfToday.setUTCHours(23, 59, 59, 999);
    }

    const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    const timestampFrom = options.timestampFrom
        ? new Date(options.timestampFrom)
        : addDays(now, -lookbackDays);
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const dataFatturaFrom = addDays(now, -Math.max(lookbackDays, 365 * 2));
    const dataFatturaTo = endOfToday.toISOString();

    const baseFilter: YoudoxInvoicesFilter = {
        TimestampFrom: timestampFrom.toISOString(),
        TimestampTo: endOfToday.toISOString(),
        DataFatturaFrom: dataFatturaFrom.toISOString(),
        DataFatturaTo: dataFatturaTo,
        OnlyUnread: options.onlyUnread ?? false,
        ShowAlsoDeleted: false,
    };

    console.log('[youdox-sync-debug]', {
        from: baseFilter.TimestampFrom,
        to: baseFilter.TimestampTo,
        countReceived: null,
        hasMore: null,
        phase: 'sync-window-start',
        nowIso: now.toISOString(),
    });

    console.info('[youdox-sync] Sync window', {
        timestampFrom: baseFilter.TimestampFrom?.slice(0, 19),
        timestampTo: baseFilter.TimestampTo?.slice(0, 19),
        dataFatturaFrom: baseFilter.DataFatturaFrom?.slice(0, 10),
        dataFatturaTo: baseFilter.DataFatturaTo?.slice(0, 10),
        onlyUnread: baseFilter.OnlyUnread,
        lookbackDays,
    });

    const byKey = new Map<string, YoudoxInvoice>();
    let cursor = new Date(timestampFrom);

    while (cursor < endOfToday) {
        const chunkEnd = addDays(cursor, DEFAULT_CHUNK_DAYS);
        const effectiveEnd = chunkEnd > endOfToday ? endOfToday : chunkEnd;

        const batch = await fetchReceivedChunk(config, token, {
            ...baseFilter,
            TimestampFrom: cursor.toISOString(),
            TimestampTo: effectiveEnd.toISOString(),
            // Data documento: range fisso su tutto il periodo (non legato al chunk di ricezione).
            DataFatturaFrom: dataFatturaFrom.toISOString(),
            DataFatturaTo: dataFatturaTo,
        });

        mergeInvoices(byKey, batch);
        console.log('[youdox-sync-debug]', {
            from: cursor.toISOString(),
            to: effectiveEnd.toISOString(),
            countReceived: batch.length,
            hasMore: batch.length >= PAGE_SIZE_HINT,
            phase: 'outer-chunk',
        });
        cursor = new Date(effectiveEnd.getTime() + 1);
    }

    const invoices = [...byKey.values()].sort((a, b) => {
        const ta = a.FatturaData || a.StatusTimestamp || '';
        const tb = b.FatturaData || b.StatusTimestamp || '';
        return tb.localeCompare(ta);
    });

    const byMonth = new Map<string, number>();
    for (const inv of invoices) {
        const m = (inv.FatturaData || inv.StatusTimestamp || 'unknown').slice(0, 7);
        byMonth.set(m, (byMonth.get(m) || 0) + 1);
    }

    console.info('[youdox-sync] Sync window risultato', {
        count: invoices.length,
        byMonth: Object.fromEntries([...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))),
    });
    return invoices;
}

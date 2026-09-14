import { NextResponse } from 'next/server';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';
import { getFinancialYoudoxClient } from '@/lib/financial/youdoxClient';
import { YoudoxAuthError } from '@/lib/youdox/auth';
import { ingestSdiInvoiceUpload } from '@/lib/financial/ingestSdiInvoices';
import { reparseZeroNetSdiInvoices } from '@/lib/financial/reparseZeroNetSdiInvoices';
import { buildPassiveIdentityKey } from '@/lib/financial/passiveInvoiceIdentity';
import prisma from '@/lib/prisma';

export const maxDuration = 300;

/**
 * Budget di elaborazione: oltre questa soglia il sync si ferma, salva quello che
 * ha già importato e chiede un secondo giro. Serve a non superare mai il limite
 * di durata della funzione serverless (che restituirebbe un 504 illeggibile).
 */
const SYNC_BUDGET_MS = Number(process.env.YOUDOX_SYNC_BUDGET_MS || 55_000);

/** Chiave in system_state dove teniamo memoria dell'ultimo sync riuscito. */
const SYNC_STATE_KEY = 'youdox:sync:passive';

/** Quante InvoiceKey già lavorate teniamo in memoria (le più recenti). */
const MAX_PROCESSED_KEYS = 3000;

type YoudoxSyncState = {
    lastSyncAt: string | null;
    processedKeys: string[];
};

async function loadSyncState(): Promise<YoudoxSyncState> {
    try {
        const row = await prisma.systemState.findUnique({ where: { key: SYNC_STATE_KEY } });
        if (!row?.value) return { lastSyncAt: null, processedKeys: [] };
        const parsed = JSON.parse(row.value) as Partial<YoudoxSyncState>;
        return {
            lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
            processedKeys: Array.isArray(parsed.processedKeys)
                ? parsed.processedKeys.filter((k): k is string => typeof k === 'string')
                : [],
        };
    } catch (err) {
        console.warn('[youdox/sync] Stato sync non leggibile, riparto da zero:', err);
        return { lastSyncAt: null, processedKeys: [] };
    }
}

async function saveSyncState(state: YoudoxSyncState): Promise<void> {
    const trimmed: YoudoxSyncState = {
        lastSyncAt: state.lastSyncAt,
        processedKeys: state.processedKeys.slice(-MAX_PROCESSED_KEYS),
    };
    try {
        await prisma.systemState.upsert({
            where: { key: SYNC_STATE_KEY },
            create: { key: SYNC_STATE_KEY, value: JSON.stringify(trimmed) },
            update: { value: JSON.stringify(trimmed) },
        });
    } catch (err) {
        console.warn('[youdox/sync] Salvataggio stato sync fallito (non bloccante):', err);
    }
}

/**
 * Documenti passivi già presenti in contabilità, indicizzati per identità
 * «P.IVA fornitore | numero documento» (METODO §2). Una sola query invece di
 * riscaricare da YouDOX XML che abbiamo già.
 */
async function loadExistingPassiveIdentities(): Promise<Set<string>> {
    const keys = new Set<string>();
    try {
        const rows = await prisma.manualFinanceExpense.findMany({
            where: { docType: { in: ['FATTURA', 'NOTA_CREDITO'] } },
            select: { metadataJson: true },
            take: 5000,
        });
        for (const row of rows) {
            const meta = (row.metadataJson || {}) as Record<string, unknown>;
            const stored = typeof meta.passiveIdentityKey === 'string' ? meta.passiveIdentityKey : null;
            if (stored) {
                keys.add(stored);
                continue;
            }
            const vat =
                (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
                (typeof meta.cedenteVat === 'string' && meta.cedenteVat) ||
                null;
            const num = typeof meta.invoiceNumber === 'string' ? meta.invoiceNumber : null;
            const built = buildPassiveIdentityKey(vat, num);
            if (built) keys.add(built);
        }
    } catch (err) {
        console.warn('[youdox/sync] Indice documenti esistenti non disponibile:', err);
    }
    return keys;
}

function buildSyncMessage(params: {
    polled: number;
    imported: number;
    updated: number;
    failed: number;
    alreadyPresent?: number;
    remaining?: number;
}): string {
    const { polled, imported, updated, failed, alreadyPresent = 0, remaining = 0 } = params;
    const tailRemaining =
        remaining > 0
            ? ` Restano ${remaining} documenti da scaricare: premi di nuovo «Sincronizza YouDOX SDI» per continuare.`
            : '';

    if (polled === 0) {
        return 'Nessuna fattura passiva restituita da YouDOX SDI nel periodo configurato (verifica log [youdox-sync] e credenziali).';
    }
    if (imported > 0) {
        const tail = updated > 0 ? `, ${updated} aggiornate` : '';
        return `${imported} nuove fatture passive SDI importate con successo${tail}.${tailRemaining}`;
    }
    if (updated > 0) {
        return `${updated} fatture passive SDI aggiornate con successo.${tailRemaining}`;
    }
    if (alreadyPresent > 0 && failed === 0) {
        return `${polled} fatture lette da YouDOX: tutte già presenti in Contabilità (${alreadyPresent} invariate).${tailRemaining}`;
    }
    if (failed > 0) {
        return `Sincronizzazione completata: ${polled} documenti letti, ${failed} non importati (vedi log).${tailRemaining}`;
    }
    return `Sincronizzazione YouDOX completata (${polled} documenti elaborati).${tailRemaining}`;
}

async function handleSync(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    const startedAt = Date.now();
    const timeLeft = () => SYNC_BUDGET_MS - (Date.now() - startedAt);

    try {
        const url = new URL(request.url);
        let bodyOpts: Record<string, unknown> = {};
        if (request.method === 'POST') {
            try {
                const json = await request.clone().json();
                if (json && typeof json === 'object') bodyOpts = json as Record<string, unknown>;
            } catch {
                /* no body */
            }
        }

        const forceFromMonthStart =
            url.searchParams.get('forceFromMonthStart') === '1' ||
            bodyOpts.forceFromMonthStart === true;
        const forceResyncFrom =
            url.searchParams.get('forceResyncFrom') ||
            (typeof bodyOpts.forceResyncFrom === 'string' ? bodyOpts.forceResyncFrom : null);
        const forceFull = url.searchParams.get('force') === '1' || bodyOpts.force === true;
        const withReparse = url.searchParams.get('reparse') === '1' || bodyOpts.reparse === true;
        const isForced = forceFromMonthStart || Boolean(forceResyncFrom) || forceFull;

        const state = await loadSyncState();

        const now = new Date();
        const syncOptions: {
            timestampFrom?: Date;
            lookbackDays?: number;
        } = {};
        if (forceFromMonthStart) {
            syncOptions.timestampFrom = new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
            );
        } else if (forceResyncFrom) {
            const parsed = new Date(forceResyncFrom);
            if (!Number.isNaN(parsed.getTime())) {
                syncOptions.timestampFrom = parsed;
            }
        } else if (!forceFull && state.lastSyncAt) {
            // Sync incrementale: riparto dall'ultimo giro riuscito con 3 giorni
            // di sovrapposizione, così non perdo documenti arrivati in ritardo.
            const since = new Date(new Date(state.lastSyncAt).getTime() - 3 * 24 * 60 * 60 * 1000);
            if (!Number.isNaN(since.getTime())) {
                syncOptions.timestampFrom = since;
            }
        }
        if (typeof bodyOpts.lookbackDays === 'number' && bodyOpts.lookbackDays > 0) {
            syncOptions.lookbackDays = bodyOpts.lookbackDays;
        }

        const client = getFinancialYoudoxClient();
        console.info('[youdox-sync] Avvio sync passivo dashboard', {
            ...syncOptions,
            incrementalFrom: state.lastSyncAt,
            isForced,
        });
        const receivedInvoices = await client.fetchPassiveInvoicesForSync(syncOptions);
        console.info('[youdox-sync] Fatture passive da elaborare', {
            count: receivedInvoices.length,
            elapsedMs: Date.now() - startedAt,
            latest: receivedInvoices.slice(0, 5).map((i) => ({
                key: i.InvoiceKey,
                numero: i.FatturaNumero,
                data: i.FatturaData,
                fornitore: i.DichiaranteDenominazione || i.ClienteDenominazione,
            })),
        });

        const processedKeys = new Set(state.processedKeys);
        const existingIdentities = isForced ? new Set<string>() : await loadExistingPassiveIdentities();

        const results: Array<{
            invoiceKey: string;
            ok: boolean;
            vendorName?: string;
            vendorVat?: string | null;
            invoiceNumber?: string;
            totalCents?: number;
            error?: string;
            ingested?: number;
            skipped?: 'already_processed' | 'already_in_ledger';
        }> = [];

        let importedCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        let alreadyPresentCount = 0;
        let remainingCount = 0;
        let budgetExhausted = false;

        for (const inv of receivedInvoices) {
            const key = inv.InvoiceKey;
            if (!key) continue;

            // 1) Già scaricata in un sync precedente → nessuna chiamata a YouDOX.
            if (!isForced && processedKeys.has(key)) {
                alreadyPresentCount += 1;
                results.push({ invoiceKey: key, ok: true, skipped: 'already_processed' });
                continue;
            }

            // 2) Documento già in contabilità (stessa P.IVA fornitore + numero).
            const identityKey = buildPassiveIdentityKey(
                inv.DichiarantePartitaIva || inv.ClientePartitaIva,
                inv.FatturaNumero
            );
            if (!isForced && identityKey && existingIdentities.has(identityKey)) {
                alreadyPresentCount += 1;
                processedKeys.add(key);
                results.push({
                    invoiceKey: key,
                    ok: true,
                    invoiceNumber: inv.FatturaNumero || undefined,
                    skipped: 'already_in_ledger',
                });
                continue;
            }

            // 3) Budget tempo esaurito → mi fermo e segnalo quanto resta.
            if (budgetExhausted || timeLeft() <= 5_000) {
                budgetExhausted = true;
                remainingCount += 1;
                continue;
            }

            try {
                const { buffer, parsed } = await client.downloadInvoiceXml(key);
                const fileName =
                    inv.OriginalFilename?.replace(/\.p7m$/i, '') ||
                    `${key}.xml`;

                const summary = await ingestSdiInvoiceUpload({
                    buffer,
                    fileName: fileName.endsWith('.xml') ? fileName : `${fileName}.xml`,
                    contentType: 'application/xml',
                });

                await client.markInvoiceAsRead(key);
                processedKeys.add(key);

                importedCount += summary.imported;
                updatedCount += summary.updated;
                if (summary.imported === 0 && summary.updated === 0) {
                    alreadyPresentCount += 1;
                }

                results.push({
                    invoiceKey: key,
                    ok: true,
                    vendorName: parsed.vendorName,
                    vendorVat: parsed.vendorVat,
                    invoiceNumber: parsed.invoiceNumber,
                    totalCents: parsed.totalCents,
                    ingested: summary.imported + summary.updated,
                });
            } catch (innerErr) {
                failedCount += 1;
                results.push({
                    invoiceKey: key,
                    ok: false,
                    error: innerErr instanceof Error ? innerErr.message : 'Errore sincronizzazione fattura',
                });
            }
        }

        // Lo stato avanza solo se abbiamo finito il giro: altrimenti la prossima
        // chiamata deve poter ripescare gli stessi documenti rimasti indietro.
        await saveSyncState({
            lastSyncAt: budgetExhausted ? state.lastSyncAt : new Date().toISOString(),
            processedKeys: [...processedKeys],
        });

        // Sincronizzazione esiti SDI (Status Report ultimi 30 giorni)
        let statusReportSynced = false;
        if (!budgetExhausted && timeLeft() > 10_000) {
            try {
                const past30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                await client.syncStatusReports(
                    past30Days.toISOString().slice(0, 10),
                    new Date().toISOString().slice(0, 10)
                );
                statusReportSynced = true;
            } catch {
                /* status report best effort */
            }
        }

        // Re-parsing imponibili a zero: operazione pesante, solo su richiesta
        // esplicita (?reparse=1), non a ogni clic sul pulsante.
        let reparsed = { scanned: 0, updated: 0, errors: [] as string[] };
        if (withReparse) {
            try {
                reparsed = await reparseZeroNetSdiInvoices({ limit: 5000, allZeroOrNull: true });
            } catch (reparseErr) {
                console.warn('[youdox/sync] Re-parse imponibili fallito (non bloccante):', reparseErr);
            }
        }

        // Registra l'esito della sincronizzazione nei log di sistema
        try {
            await prisma.floremoriaLog.create({
                data: {
                    tag: 'WEBHOOK,FINANCE,YOUDOX',
                    topic: 'SINCRONIZZAZIONE_YOUDOX_SDI',
                    shortSummary: `Sincronizzate ${receivedInvoices.length} fatture passive YouDOX SDI (Importate: ${importedCount}, Aggiornate: ${updatedCount}, Restanti: ${remainingCount})`,
                    fullText: JSON.stringify({
                        polled: receivedInvoices.length,
                        imported: importedCount,
                        updated: updatedCount,
                        alreadyPresent: alreadyPresentCount,
                        remaining: remainingCount,
                        durationMs: Date.now() - startedAt,
                        reparsed,
                        statusReportSynced,
                        results,
                    }, null, 2),
                    achievedResults: `Sync YouDOX. Poll: ${receivedInvoices.length}, Importate: ${importedCount}, Aggiornate: ${updatedCount}, Re-parse: ${reparsed.updated}`,
                    sessionDate: new Date(),
                },
            });
        } catch (logErr) {
            console.warn('[youdox/sync] Log creation skipped:', logErr);
        }

        const message = buildSyncMessage({
            polled: receivedInvoices.length,
            imported: importedCount,
            updated: updatedCount,
            failed: failedCount,
            alreadyPresent: alreadyPresentCount,
            remaining: remainingCount,
        });

        return NextResponse.json({
            ok: true,
            message,
            polled: receivedInvoices.length,
            imported: importedCount,
            updated: updatedCount,
            failed: failedCount,
            alreadyPresent: alreadyPresentCount,
            remaining: remainingCount,
            partial: budgetExhausted,
            durationMs: Date.now() - startedAt,
            reparsed,
            statusReportSynced,
            results,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Sincronizzazione YouDOX fallita';
        console.error('[youdox/sync]', message);
        if (e instanceof YoudoxAuthError || message.includes('Credenziali API non riconosciute')) {
            return NextResponse.json(
                { ok: false, error: message, code: 'ER05' },
                { status: 401 }
            );
        }
        const status = message.includes('Credenziali mancanti') || message.includes('Config assente')
            ? 503
            : message.includes('non ancora cablato')
              ? 501
              : 502;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}

export async function GET(request: Request) {
    return handleSync(request);
}

export async function POST(request: Request) {
    return handleSync(request);
}

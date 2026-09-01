import { NextResponse } from 'next/server';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';
import { getFinancialYoudoxClient } from '@/lib/financial/youdoxClient';
import { YoudoxAuthError } from '@/lib/youdox/auth';
import { ingestSdiInvoiceUpload } from '@/lib/financial/ingestSdiInvoices';
import { reparseZeroNetSdiInvoices } from '@/lib/financial/reparseZeroNetSdiInvoices';
import prisma from '@/lib/prisma';

export const maxDuration = 120;

function buildSyncMessage(params: {
    polled: number;
    imported: number;
    updated: number;
    failed: number;
    alreadyPresent?: number;
}): string {
    const { polled, imported, updated, failed, alreadyPresent = 0 } = params;
    if (polled === 0) {
        return 'Nessuna fattura passiva restituita da YouDOX SDI nel periodo configurato (verifica log [youdox-sync] e credenziali).';
    }
    if (imported > 0) {
        const tail = updated > 0 ? `, ${updated} aggiornate` : '';
        return `${imported} nuove fatture passive SDI importate con successo${tail}.`;
    }
    if (updated > 0) {
        return `${updated} fatture passive SDI aggiornate con successo.`;
    }
    if (alreadyPresent > 0 && failed === 0) {
        return `${polled} fatture lette da YouDOX: tutte già presenti in Contabilità (${alreadyPresent} invariate).`;
    }
    if (failed > 0) {
        return `Sincronizzazione completata: ${polled} documenti letti, ${failed} non importati (vedi log).`;
    }
    return `Sincronizzazione YouDOX completata (${polled} documenti elaborati).`;
}

async function handleSync(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    try {
        const client = getFinancialYoudoxClient();
        console.info('[youdox-sync] Avvio sync passivo dashboard');
        const receivedInvoices = await client.fetchPassiveInvoicesForSync();
        console.info('[youdox-sync] Fatture passive da elaborare', {
            count: receivedInvoices.length,
            latest: receivedInvoices.slice(0, 5).map((i) => ({
                key: i.InvoiceKey,
                numero: i.FatturaNumero,
                data: i.FatturaData,
                fornitore: i.DichiaranteDenominazione || i.ClienteDenominazione,
            })),
        });

        const results: Array<{
            invoiceKey: string;
            ok: boolean;
            vendorName?: string;
            vendorVat?: string | null;
            invoiceNumber?: string;
            totalCents?: number;
            error?: string;
            ingested?: number;
        }> = [];

        let importedCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        let alreadyPresentCount = 0;

        for (const inv of receivedInvoices) {
            const key = inv.InvoiceKey;
            if (!key) continue;

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

        // Sincronizzazione esiti SDI (Status Report ultimi 30 giorni)
        let statusReportSynced = false;
        try {
            const now = new Date();
            const past30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            await client.syncStatusReports(
                past30Days.toISOString().slice(0, 10),
                now.toISOString().slice(0, 10)
            );
            statusReportSynced = true;
        } catch {
            /* status report best effort */
        }

        // Re-parsing imponibili a zero su XML già archiviati (fix parser retroattivo).
        let reparsed = { scanned: 0, updated: 0, errors: [] as string[] };
        try {
            reparsed = await reparseZeroNetSdiInvoices({ limit: 300 });
        } catch (reparseErr) {
            console.warn('[youdox/sync] Re-parse imponibili fallito (non bloccante):', reparseErr);
        }

        // Registra l'esito della sincronizzazione nei log di sistema
        try {
            await prisma.floremoriaLog.create({
                data: {
                    tag: 'WEBHOOK,FINANCE,YOUDOX',
                    topic: 'SINCRONIZZAZIONE_YOUDOX_SDI',
                    shortSummary: `Sincronizzate ${receivedInvoices.length} fatture passive YouDOX SDI (Importate: ${importedCount}, Aggiornate: ${updatedCount})`,
                    fullText: JSON.stringify({
                        polled: receivedInvoices.length,
                        imported: importedCount,
                        updated: updatedCount,
                        reparsed,
                        statusReportSynced,
                        results,
                    }, null, 2),
                    achievedResults: `Sync YouDOX completata con successo. Poll: ${receivedInvoices.length}, Importate: ${importedCount}, Aggiornate: ${updatedCount}, Re-parse: ${reparsed.updated}`,
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
        });

        return NextResponse.json({
            ok: true,
            message,
            polled: receivedInvoices.length,
            imported: importedCount,
            updated: updatedCount,
            failed: failedCount,
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

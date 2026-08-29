import { NextResponse } from 'next/server';
import { requireYoudoxApiAccess } from '@/lib/youdox/requireAccess';
import { getFinancialYoudoxClient } from '@/lib/financial/youdoxClient';
import { ingestSdiInvoiceUpload } from '@/lib/financial/ingestSdiInvoices';
import prisma from '@/lib/prisma';

async function handleSync(request: Request) {
    const access = await requireYoudoxApiAccess(request);
    if (!access.ok) return access.response;

    try {
        const client = getFinancialYoudoxClient();
        const unreadInvoices = await client.fetchUnreadInvoices();

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

        for (const inv of unreadInvoices) {
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

        // Registra l'esito della sincronizzazione nei log di sistema
        try {
            await prisma.floremoriaLog.create({
                data: {
                    tag: 'WEBHOOK,FINANCE,YOUDOX',
                    topic: 'SINCRONIZZAZIONE_YOUDOX_SDI',
                    shortSummary: `Sincronizzate ${unreadInvoices.length} fatture passive YouDOX SDI (Importate: ${importedCount}, Aggiornate: ${updatedCount})`,
                    fullText: JSON.stringify({
                        polled: unreadInvoices.length,
                        imported: importedCount,
                        updated: updatedCount,
                        statusReportSynced,
                        results,
                    }, null, 2),
                    achievedResults: `Sync YouDOX completata con successo. Poll: ${unreadInvoices.length}, Importate: ${importedCount}, Aggiornate: ${updatedCount}`,
                    sessionDate: new Date(),
                },
            });
        } catch (logErr) {
            console.warn('[youdox/sync] Log creation skipped:', logErr);
        }

        return NextResponse.json({
            ok: true,
            polled: unreadInvoices.length,
            imported: importedCount,
            updated: updatedCount,
            statusReportSynced,
            results,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Sincronizzazione YouDOX fallita';
        console.error('[youdox/sync]', message);
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

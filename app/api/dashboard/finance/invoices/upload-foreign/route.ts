/**
 * Upload autofatture estere TD17/TD18/TD19 (XML/ZIP SDI oppure PDF fornitore).
 */

import { NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboard/requireDashboardAdmin';
import { ingestSdiInvoiceUpload } from '@/lib/financial/ingestSdiInvoices';
import { uploadSaasForeignInvoice } from '@/lib/financial/saasForeignInvoices';
import prisma from '@/lib/prisma';
import {
    FOREIGN_AUTOFATTURA_SOURCE,
    classifySaasCategory,
    type ForeignAutofatturaType,
} from '@/lib/financial/foreignAutofattura';
import { addAccountingEntries } from '@/lib/financial/ledgerStore';
import { LEDGER_BANK_ACCOUNT } from '@/lib/financial/companyBankDetails';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BYTES = 40 * 1024 * 1024;
const XML_ZIP = /\.(zip|xml|csv)$/i;
const PDF_IMG = /\.(pdf|png|jpe?g|webp)$/i;

function jsonError(error: string, status: number) {
    return NextResponse.json({ ok: false, error }, { status });
}

function periodKeyFromDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function POST(request: Request) {
    try {
        const auth = await requireDashboardAdmin();
        if (!auth.ok) return auth.response;

        let form: FormData;
        try {
            form = await request.formData();
        } catch (err) {
            console.error('[foreign autofattura upload] formData', err);
            return jsonError('Impossibile leggere il multipart/form-data.', 400);
        }

        const file = form.get('file');
        const isBlob = typeof Blob !== 'undefined' && file instanceof Blob;
        if (!isBlob) return jsonError('File mancante (campo file)', 400);

        const blob = file as Blob & { name?: string };
        const fileName =
            (typeof blob.name === 'string' && blob.name) ||
            String(form.get('fileName') || 'autofattura.bin');

        if (!XML_ZIP.test(fileName) && !PDF_IMG.test(fileName)) {
            return jsonError(
                'Formato non supportato. Usa XML/ZIP/CSV SDI oppure PDF/immagine della fattura estera.',
                400
            );
        }
        if (blob.size > MAX_BYTES) {
            return jsonError('File troppo grande (max 40 MB).', 400);
        }

        const buffer = Buffer.from(await blob.arrayBuffer());

        // Percorso XML/ZIP/CSV → parser FatturaPA + flag TD17/18/19
        if (XML_ZIP.test(fileName)) {
            const summary = await ingestSdiInvoiceUpload({
                buffer,
                fileName,
                contentType: blob.type || 'application/octet-stream',
            });
            const totalEuro = (summary.totalCents / 100).toLocaleString('it-IT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });
            const message =
                `Import autofatture/fatture: ${summary.imported} nuove · ${summary.updated} aggiornate` +
                (summary.foreignAutofatture > 0
                    ? ` · ${summary.foreignAutofatture} riconosciute come estere (TD17/TD18/TD19)`
                    : '') +
                (summary.matchedFineco > 0
                    ? ` · ${summary.matchedFineco} abbinate a Fineco`
                    : '') +
                ` · totale ${totalEuro} €`;
            return NextResponse.json({
                ok: summary.imported > 0 || summary.updated > 0 || summary.skippedDuplicates > 0,
                message,
                summary,
            });
        }

        // Percorso PDF/immagine → archivio SaaS + spesa Contabilità reverse charge
        const vendorName = String(form.get('vendorName') || '').trim() || 'Fornitore SaaS Estero';
        // Data: default a oggi se il client omette il campo (UI dovrebbe sempre inviarla)
        const invoiceDateRaw =
            String(form.get('invoiceDate') || '').slice(0, 10) ||
            new Date().toISOString().slice(0, 10);
        // Accetta eurAmount | amount | importo (alias UI / FormData)
        const amountField =
            form.get('eurAmount') ?? form.get('amount') ?? form.get('importo') ?? '';
        const eurAmount = Number(String(amountField).replace(',', '.'));
        const originalCurrency = String(form.get('originalCurrency') || 'EUR')
            .toUpperCase()
            .slice(0, 8);
        const originalAmount = Number(
            String(form.get('originalAmount') || eurAmount).replace(',', '.'),
        );
        const countryCode = String(form.get('countryCode') || 'US')
            .toUpperCase()
            .slice(0, 2);
        const jurisdiction =
            String(form.get('jurisdiction') || 'EXTRA_UE').toUpperCase() === 'UE'
                ? 'UE'
                : 'EXTRA_UE';
        let autofatturaType = String(form.get('autofatturaType') || 'TD17')
            .toUpperCase()
            .replace(/\s+/g, '') as ForeignAutofatturaType | 'NONE';
        if (!['TD17', 'TD18', 'TD19', 'NONE'].includes(autofatturaType)) {
            autofatturaType = 'TD17';
        }

        if (!invoiceDateRaw || !Number.isFinite(eurAmount) || eurAmount <= 0) {
            return jsonError(
                'Per PDF/immagine servono: Data fattura e Importo EUR (oltre al file).',
                400,
            );
        }

        const eurCents = Math.round(eurAmount * 100);
        const originalCents = Math.round(
            (Number.isFinite(originalAmount) && originalAmount > 0 ? originalAmount : eurAmount) * 100
        );

        const saas = await uploadSaasForeignInvoice({
            fileName,
            contentType: blob.type || 'application/pdf',
            buffer,
            invoiceDate: invoiceDateRaw,
            vendorName,
            originalCurrency,
            originalAmountCents: originalCents,
            eurAmountCents: eurCents,
            countryCode,
            jurisdiction,
            autofatturaType: autofatturaType === 'NONE' ? 'TD17' : autofatturaType,
            notes: `Upload Contabilità Autofatture Estere (${autofatturaType})`,
        });

        const expenseDate = new Date(`${invoiceDateRaw}T12:00:00.000Z`);
        const category = classifySaasCategory(vendorName);
        const expense = await prisma.manualFinanceExpense.create({
            data: {
                expenseDate,
                docType: 'FATTURA',
                vendorName,
                description: `Autofattura ${autofatturaType} — ${vendorName} (${category})`,
                totalCents: -Math.abs(eurCents),
                vatRate: 0,
                vatCents: 0,
                netCents: -Math.abs(eurCents),
                fileName: saas.fileName,
                contentType: saas.contentType,
                sizeBytes: saas.sizeBytes,
                blobPath: saas.blobPath,
                blobUrl: saas.blobUrl,
                storageKind: saas.storageKind,
                periodKey: periodKeyFromDate(expenseDate),
                notes: `${FOREIGN_AUTOFATTURA_SOURCE} PDF ${autofatturaType}`,
                metadataJson: {
                    source: FOREIGN_AUTOFATTURA_SOURCE,
                    isDeductible: true,
                    isReverseCharge: true,
                    isForeignAutofattura: true,
                    category,
                    autofatturaType,
                    tipoDocumento: autofatturaType === 'NONE' ? 'TD17' : autofatturaType,
                    documentNumber: saas.fileName || fileName,
                    foreignInvoiceDate: invoiceDateRaw,
                    foreignInvoiceNumber: saas.fileName || fileName,
                    vatCentsVirtual: Math.round(Math.abs(eurCents) * 0.22),
                    totaleDocumentoCents: Math.abs(eurCents),
                    saasForeignInvoiceId: saas.id,
                    countryCode,
                    jurisdiction,
                    origin: 'upload',
                },
                reconciled: false,
            },
        });

        addAccountingEntries([
            {
                id: `entry_foreign_${expense.id}`,
                date: invoiceDateRaw,
                description: `Autofattura estera ${autofatturaType} ${vendorName}`.slice(0, 240),
                dareAccount: '70300 - Software / SaaS Esteri (Reverse Charge)',
                avereAccount: LEDGER_BANK_ACCOUNT,
                amountCents: Math.abs(eurCents),
                vatAmountCents: 0,
                isForeignService: true,
                invoiceReference: saas.id,
                status: 'CONFIRMED',
            },
        ]);

        try {
            await appendLedgerEntries([
                {
                    sourceKey: `FOREIGN_AUTOFATTURA:${expense.id}`,
                    sourceType: 'MANUAL_EXPENSE',
                    sourceId: expense.id,
                    direction: 'USCITA',
                    category: 'SPESE_SAAS',
                    accountingDate: expenseDate,
                    description: expense.description,
                    counterpartyName: vendorName,
                    netCents: -Math.abs(eurCents),
                    vatCents: 0,
                    totalCents: -Math.abs(eurCents),
                    reconciliationStatus: 'UNMATCHED',
                    documentRef: autofatturaType,
                    attachmentUrl: saas.blobUrl,
                    attachmentPath: saas.blobPath,
                    metadataJson: {
                        source: FOREIGN_AUTOFATTURA_SOURCE,
                        autofatturaType,
                        saasForeignInvoiceId: saas.id,
                    },
                },
            ]);
        } catch (err) {
            console.warn('[foreign autofattura] ledger', err);
        }

        return NextResponse.json({
            ok: true,
            message: `Autofattura estera ${autofatturaType} registrata per ${vendorName} (€${eurAmount.toFixed(2)})`,
            expenseId: expense.id,
            saasInvoiceId: saas.id,
        });
    } catch (error) {
        console.error('[foreign autofattura upload]', error);
        return jsonError(
            error instanceof Error ? error.message : 'Upload autofattura fallito',
            500
        );
    }
}

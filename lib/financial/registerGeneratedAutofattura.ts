/**
 * Registra autofattura generata in Contabilità + match Fineco.
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '@/lib/prisma';
import { putBlobWithAccessFallback } from '@/lib/blob/storeAccess';
import { addAccountingEntries } from '@/lib/financial/ledgerStore';
import {
    FLOREMORIA_LEGAL_ENTITY,
    LEDGER_BANK_ACCOUNT,
} from '@/lib/financial/companyBankDetails';
import { appendLedgerEntries } from '@/lib/financial/historicalLedgerSync';
import { reconcileInvoiceWithFineco } from '@/lib/financial/ingestSdiInvoices';
import {
    buildPassiveCanonicalKey,
    findManualExpenseByCanonicalKey,
} from '@/lib/financial/passiveDocumentIdentity';
import type { GeneratedAutofatturaXml, ForeignVendorPreset, AutofatturaDocType } from '@/lib/financial/generateAutofatturaXml';

const LOCAL_DIR = path.join(process.cwd(), 'data', 'autofatture-estere');
const BLOB_PREFIX = 'floremoria-finance/autofatture-estere';
export const AUTOFATTURA_TD17_SOURCE = 'AUTOFATTURA_TD17' as const;

function getBlobToken(): string | null {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function periodKeyFromDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function storeXml(
    xml: string,
    fileName: string
): Promise<{ blobPath: string; blobUrl: string | null; storageKind: 'blob' | 'local' }> {
    const buffer = Buffer.from(xml, 'utf-8');
    const token = getBlobToken();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safe = fileName.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
    if (token) {
        const blobPath = `${BLOB_PREFIX}/${stamp}_${safe}`;
        const result = await putBlobWithAccessFallback(blobPath, buffer, {
            contentType: 'application/xml',
            token,
            addRandomSuffix: false,
        });
        return { blobPath: result.pathname || blobPath, blobUrl: result.url, storageKind: 'blob' };
    }
    if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
    const full = path.join(LOCAL_DIR, `${stamp}_${safe}`);
    fs.writeFileSync(full, buffer);
    return { blobPath: full, blobUrl: null, storageKind: 'local' };
}

export async function registerGeneratedAutofattura(input: {
    generated: GeneratedAutofatturaXml;
    vendor: ForeignVendorPreset;
    autofatturaDate: string;
    foreignInvoiceNumber: string;
    foreignInvoiceDate: string;
    descrizioneLinea?: string;
}): Promise<{
    expenseId: string;
    matchedFineco: boolean;
    documentNumber: string;
    skippedDuplicate?: boolean;
}> {
    const { generated, vendor } = input;
    const descrizioneLinea =
        input.descrizioneLinea?.trim() || vendor.defaultDescrizione || 'SERVIZI';
    const expenseDate = new Date(`${input.autofatturaDate}T12:00:00.000Z`);
    const source = generated.docType === 'TD18' ? 'AUTOFATTURA_TD18' : AUTOFATTURA_TD17_SOURCE;
    const vendorVat = `${vendor.idPaese}${vendor.idCodice.replace(new RegExp(`^${vendor.idPaese}`, 'i'), '')}`;

    // Chiave sul documento fornitore estero (non sul progressivo autofattura) → blocca doppia generazione
    const { key: canonicalDocKey, verificationStatus, storeableCanonicalDocKey } =
        buildPassiveCanonicalKey({
        recipientVat: FLOREMORIA_LEGAL_ENTITY.vatNumber,
        supplierVat: vendorVat,
        supplierCountry: vendor.idPaese,
        docType: generated.docType,
        docNumber: input.foreignInvoiceNumber,
        docDate: input.foreignInvoiceDate,
    });

    if (storeableCanonicalDocKey) {
        const existing = await findManualExpenseByCanonicalKey(storeableCanonicalDocKey);
        if (existing) {
            console.warn(
                `[registerGeneratedAutofattura] IDEMPOTENT SKIP key=${storeableCanonicalDocKey} existing=${existing.id}`
            );
            return {
                expenseId: existing.id,
                matchedFineco: Boolean(existing.reconciled),
                documentNumber: generated.documentNumber,
                skippedDuplicate: true,
            };
        }
    }

    const stored = await storeXml(generated.xml, generated.fileName);

    // In Contabilità l'uscita Fineco è tipicamente l'imponibile (IVA in reverse charge).
    const signedImponibile = -Math.abs(generated.imponibileCents);

    let expense;
    try {
        expense = await prisma.manualFinanceExpense.create({
            data: {
                expenseDate,
                docType: 'FATTURA',
                vendorName: vendor.denominazione,
                description: `Autofattura ${generated.docType} n. ${generated.documentNumber} — rif. ${input.foreignInvoiceNumber} — Software & Servizi SaaS Estero`,
                totalCents: signedImponibile,
                vatRate: 22,
                vatCents: Math.abs(generated.vatCents),
                netCents: signedImponibile,
                fileName: generated.fileName,
                contentType: 'application/xml',
                sizeBytes: Buffer.byteLength(generated.xml, 'utf-8'),
                blobPath: stored.blobPath,
                blobUrl: stored.blobUrl,
                storageKind: stored.storageKind,
                periodKey: periodKeyFromDate(expenseDate),
                notes: `${source} ${canonicalDocKey}`,
                metadataJson: {
                    source,
                    isDeductible: true,
                    isReverseCharge: true,
                    isForeignAutofattura: true,
                    category: 'Software & Servizi SaaS Estero',
                    tipoDocumento: generated.docType,
                    autofatturaType: generated.docType as AutofatturaDocType,
                    documentNumber: generated.documentNumber,
                    progressivoInvio: generated.progressivoInvio,
                    foreignInvoiceNumber: input.foreignInvoiceNumber,
                    foreignInvoiceDate: input.foreignInvoiceDate,
                    descrizioneLinea,
                    vendorId: vendor.id,
                    vendorDenominazione: vendor.denominazione,
                    vendorIdPaese: vendor.idPaese,
                    vendorIdCodice: vendor.idCodice,
                    vendorIndirizzo: vendor.indirizzo,
                    vendorCap: vendor.cap,
                    vendorComune: vendor.comune,
                    vendorNazione: vendor.nazione,
                    vendorVat,
                    totaleDocumentoCents: generated.totaleCents,
                    vatCentsVirtual: generated.vatCents,
                    dedupeKey: canonicalDocKey,
                },
                reconciled: false,
                canonicalDocKey: storeableCanonicalDocKey,
                verificationStatus,
            },
        });
    } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'P2002' && storeableCanonicalDocKey) {
            const raced = await findManualExpenseByCanonicalKey(storeableCanonicalDocKey);
            if (raced) {
                return {
                    expenseId: raced.id,
                    matchedFineco: Boolean(raced.reconciled),
                    documentNumber: generated.documentNumber,
                    skippedDuplicate: true,
                };
            }
        }
        throw err;
    }

    if (verificationStatus === 'QUARANTINE') {
        return {
            expenseId: expense.id,
            matchedFineco: false,
            documentNumber: generated.documentNumber,
        };
    }

    addAccountingEntries([
        {
            id: `entry_autofattura_${expense.id}`,
            date: input.autofatturaDate,
            description: `Autofattura ${generated.docType} ${vendor.denominazione} n. ${generated.documentNumber}`.slice(
                0,
                240
            ),
            dareAccount: '70300 - Software / SaaS Esteri (Reverse Charge)',
            avereAccount: LEDGER_BANK_ACCOUNT,
            amountCents: Math.abs(generated.imponibileCents),
            vatAmountCents: 0,
            isForeignService: true,
            invoiceReference: generated.documentNumber,
            status: 'CONFIRMED',
        },
    ]);

    try {
        await appendLedgerEntries([
            {
                sourceKey: `AUTOFATTURA_GEN:${expense.id}`,
                sourceType: 'MANUAL_EXPENSE',
                sourceId: expense.id,
                direction: 'USCITA',
                category: 'SPESE_SAAS',
                accountingDate: expenseDate,
                description: expense.description,
                counterpartyName: vendor.denominazione,
                counterpartyVat: vendorVat,
                netCents: signedImponibile,
                vatCents: 0,
                totalCents: signedImponibile,
                reconciliationStatus: 'UNMATCHED',
                documentRef: generated.documentNumber,
                attachmentUrl: stored.blobUrl,
                attachmentPath: stored.blobPath,
                metadataJson: {
                    source,
                    tipoDocumento: generated.docType,
                    foreignInvoiceNumber: input.foreignInvoiceNumber,
                },
            },
        ]);
    } catch (err) {
        console.warn('[registerGeneratedAutofattura] ledger', err);
    }

    let matchedFineco = false;
    try {
        matchedFineco = await reconcileInvoiceWithFineco({
            id: expense.id,
            vendorName: vendor.denominazione,
            totalCents: signedImponibile,
            expenseDate,
            vendorVat,
            isForeignAutofattura: true,
        });
    } catch (err) {
        console.warn('[registerGeneratedAutofattura] fineco', err);
    }

    return {
        expenseId: expense.id,
        matchedFineco,
        documentNumber: generated.documentNumber,
    };
}

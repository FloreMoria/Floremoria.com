/**
 * Costruzione righe foglio Acquisti + eccezioni §6.4 (doppia ingestione) e §2 (canali).
 * Spec: docs/METODO_DOSSIER_FISCALE.md — §2, §6.4, §9.
 *
 * Un documento estero = una sola riga (imponibile positivo + IVA reverse charge).
 * Se manual e saas intercettano lo stesso id con imponibili opposti, sopravvive
 * la riga nella forma §6.4 (positiva con IVA); l’altra va in Eccezioni.
 *
 * Stesso documento passivo = stessa P.IVA fornitore + stesso numero (§2):
 * YouDox XML > Report XLSX > manuale. Il canale inferiore va in Eccezioni.
 */

import prisma from '@/lib/prisma';
import type { TaxQuarterlyReport } from '@/lib/financial/taxQuarterly';
import {
    buildPassiveIdentityKey,
    dedupePassiveByChannelPriority,
    looksLikeInferredVatRate,
    resolvePassiveIngestChannel,
} from '@/lib/financial/passiveInvoiceIdentity';

export type DossierExceptionRow = {
    cosa: string;
    dove: string;
    importoCents: number;
    perche: string;
};

export type AcquistoSheetRow = {
    date: string;
    vendorName: string;
    vatId: string;
    tipoDocumento: string;
    documentNumber: string;
    imponibileCents: number;
    vatRate: number;
    ivaCents: number;
    totaleCents: number;
    source: 'manual' | 'saas' | 'reverse_charge';
    /** Canale ingestione (per dedupe §2); assente su saas/reverse_charge. */
    ingestChannel?: string;
    /** Interno: aliquota non letta dalla fonte (prima di filtrare verso Eccezioni). */
    vatRateMissing?: boolean;
};

function normalizeDocKey(raw: string): string {
    return String(raw || '')
        .trim()
        .toLowerCase();
}

function manualDocNumber(
    e: {
        fileName: string | null;
        id: string;
        metadataJson: unknown;
    }
): string {
    const meta =
        e.metadataJson && typeof e.metadataJson === 'object'
            ? (e.metadataJson as Record<string, unknown>)
            : {};
    return (
        (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
        (typeof meta.documentNumber === 'string' && meta.documentNumber) ||
        (typeof meta.foreignInvoiceNumber === 'string' && meta.foreignInvoiceNumber) ||
        e.fileName ||
        e.id
    );
}

/**
 * Risolve Acquisti del periodo: applica §6.4 sulla doppia ingestione manual↔saas
 * e §2 sulla gerarchia canali YouDox > Report > manuale.
 * Le fee gateway (report.reverseCharge) restano nel foglio come autofatture TD17.
 */
export async function resolveAcquistiSheetRows(
    report: TaxQuarterlyReport
): Promise<{ rows: AcquistoSheetRow[]; exceptions: DossierExceptionRow[] }> {
    const [manual, saas] = await Promise.all([
        prisma.manualFinanceExpense.findMany({
            where: {
                expenseDate: { gte: report.bounds.start, lte: report.bounds.end },
            },
            orderBy: { expenseDate: 'asc' },
            take: 3000,
        }),
        prisma.saasForeignInvoice.findMany({
            where: {
                invoiceDate: { gte: report.bounds.start, lte: report.bounds.end },
            },
            orderBy: { invoiceDate: 'asc' },
            take: 1000,
        }),
    ]);

    const exceptions: DossierExceptionRow[] = [];
    const rows: AcquistoSheetRow[] = [];

    /** SaaS per docKey → imponibile (forma §6.4 positiva). */
    const saasByDoc = new Map<string, { eurAmountCents: number; id: string; vendorName: string }>();
    for (const s of saas) {
        const key = normalizeDocKey(s.fileName || s.id);
        saasByDoc.set(key, {
            eurAmountCents: s.eurAmountCents,
            id: s.id,
            vendorName: s.vendorName || '',
        });
    }

    const discardedManualIds = new Set<string>();

    for (const e of manual) {
        const docNum = manualDocNumber(e);
        const key = normalizeDocKey(docNum);
        const imponibile = e.netCents ?? Math.round((e.totalCents || 0) / 1.22);
        const peer = saasByDoc.get(key);

        // §6.4: stessa identità documento, imponibili esattamente opposti → scarta la gamba manual
        if (peer && imponibile < 0 && peer.eurAmountCents + imponibile === 0) {
            discardedManualIds.add(e.id);
            exceptions.push({
                cosa: `${e.vendorName || peer.vendorName || 'Fornitore'} · ${docNum}`,
                dove: 'Acquisti (canale manuale)',
                importoCents: imponibile,
                perche: 'documento già acquisito da altro canale',
            });
            continue;
        }

        const meta =
            e.metadataJson && typeof e.metadataJson === 'object'
                ? (e.metadataJson as Record<string, unknown>)
                : {};
        const isTd17 =
            meta.source === 'SDI_AUTOFATTURA_ESTERA' ||
            meta.source === 'AUTOFATTURA_TD17' ||
            meta.isReverseCharge === true ||
            meta.isForeignAutofattura === true;
        const isTd18 = meta.source === 'AUTOFATTURA_TD18';
        const tipo = isTd17
            ? 'Autofattura TD17'
            : isTd18
              ? 'Autofattura TD18'
              : e.docType === 'FATTURA'
                ? 'Fattura SDI / Passiva'
                : e.docType || 'Documento passivo';
        const vatId =
            (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
            (typeof meta.vatNumber === 'string' && meta.vatNumber) ||
            '';
        const iva = e.vatCents ?? Math.max(0, (e.totalCents || 0) - imponibile);
        const channel = resolvePassiveIngestChannel({
            ingestChannel: meta.ingestChannel,
            source: meta.source,
            notes: e.notes,
            fileName: e.fileName,
        });
        const vatRateMissing = meta.vatRateMissing === true || meta.vatRateKnown === false;
        const rate = e.vatRate ?? 0;

        rows.push({
            date: e.expenseDate.toISOString().slice(0, 10),
            vendorName: e.vendorName || '',
            vatId,
            tipoDocumento: tipo,
            documentNumber: docNum,
            imponibileCents: imponibile,
            vatRate: rate,
            ivaCents: iva,
            totaleCents: e.totalCents || 0,
            source: 'manual',
            ingestChannel: channel,
            vatRateMissing,
        });
    }

    // §2 prima: stessa P.IVA + stesso numero → un solo canale (XML > XLSX > MANUAL)
    const manualRows = rows.filter((r) => r.source === 'manual');
    const { kept: channelKept, discarded: channelDiscarded } = dedupePassiveByChannelPriority(
        manualRows,
        (r) => ({
            identityKey: buildPassiveIdentityKey(r.vatId, r.documentNumber),
            channel: resolvePassiveIngestChannel({ source: r.ingestChannel }),
            documentDate: r.date,
            totalCents: r.totaleCents,
        })
    );
    for (const d of channelDiscarded) {
        const reason =
            d.dateMismatch || d.amountMismatch
                ? `documento già acquisito da canale prioritario (discrepanza ${[
                      d.dateMismatch ? 'data' : null,
                      d.amountMismatch ? 'importo' : null,
                  ]
                      .filter(Boolean)
                      .join('/')})`
                : 'documento già acquisito da canale prioritario';
        exceptions.push({
            cosa: `${d.item.vendorName || 'Fornitore'} · ${d.item.documentNumber}`,
            dove: `Acquisti (${d.item.ingestChannel || 'canale inferiore'})`,
            importoCents: d.item.totaleCents,
            perche: reason,
        });
    }

    // Aliquota solo sulle righe sopravvissute al canale
    const afterRate: AcquistoSheetRow[] = [];
    for (const r of channelKept) {
        const missing = Boolean(r.vatRateMissing);
        if (missing || looksLikeInferredVatRate(r.vatRate)) {
            exceptions.push({
                cosa: `${r.vendorName || 'Fornitore'} · ${r.documentNumber}`,
                dove: 'Acquisti',
                importoCents: r.totaleCents,
                perche: missing
                    ? 'aliquota non esposta dalla fonte — non stimata'
                    : 'aliquota stimata (es. 10.01%) — non letta dalla fonte',
            });
            continue;
        }
        const { vatRateMissing: _drop, ...clean } = r;
        afterRate.push(clean);
    }

    const nonManual = rows.filter((r) => r.source !== 'manual');
    rows.length = 0;
    rows.push(...afterRate, ...nonManual);

    for (const s of saas) {
        const tipo =
            s.autofatturaType === 'TD18' || s.jurisdiction === 'UE'
                ? 'Autofattura TD18'
                : 'Autofattura TD17';
        const imponibile = s.eurAmountCents;
        const vatRate = 22;
        const iva = Math.round((imponibile * vatRate) / 100);
        rows.push({
            date: s.invoiceDate.toISOString().slice(0, 10),
            vendorName: s.vendorName || '',
            vatId: '',
            tipoDocumento: tipo,
            documentNumber: s.fileName || s.id.slice(0, 12),
            imponibileCents: imponibile,
            vatRate,
            ivaCents: iva,
            totaleCents: imponibile + iva,
            source: 'saas',
        });
    }

    for (const r of report.reverseCharge) {
        rows.push({
            date: r.issuedAt || r.competenceMonth,
            vendorName: r.vendorName,
            vatId: r.vendorTaxId,
            tipoDocumento: 'Autofattura TD17',
            documentNumber: r.autofatturaTd17Ref || r.gatewayInvoiceNumber,
            imponibileCents: r.taxableFeeCents,
            vatRate: 22,
            ivaCents: r.vatReverseChargeCents,
            totaleCents: r.taxableFeeCents + r.vatReverseChargeCents,
            source: 'reverse_charge',
        });
    }

    // Ordinamento cronologico stabile
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.documentNumber.localeCompare(b.documentNumber));

    void discardedManualIds;
    return { rows, exceptions };
}

/** Somma imponibili foglio Acquisti (post §6.4 / §2). */
export function sumAcquistiImponibileCents(rows: AcquistoSheetRow[]): number {
    return rows.reduce((s, r) => s + r.imponibileCents, 0);
}

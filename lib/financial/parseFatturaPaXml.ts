/**
 * Parser FatturaPA / SDI (XML) e export CSV YouDoox.
 * Perché: import massivo fatture passive senza digitazione manuale in Contabilità.
 *
 * Assumption: XML FatturaPA 1.2+ (namespace opzionale); ZIP con uno o più .xml.
 */

import JSZip from 'jszip';
import Papa from 'papaparse';
import {
    buildInvoiceDedupeKey,
    normalizeVendorVat,
} from '@/lib/financial/invoiceDedupe';
import { detectForeignAutofattura } from '@/lib/financial/foreignAutofattura';

export type ParsedFatturaPa = {
    vendorName: string;
    vendorVat: string | null;
    invoiceNumber: string;
    invoiceDate: string; // YYYY-MM-DD
    totalCents: number;
    netCents: number;
    vatCents: number;
    vatRate: number;
    causale: string;
    lineDescriptions: string[];
    sourceFileName: string;
    /** Chiave dedupe: P.IVA|Numero|Data */
    dedupeKey: string;
    /** FATTURA ordinaria oppure NOTA_CREDITO (TD04 / importo negativo). */
    docKind: 'FATTURA' | 'NOTA_CREDITO';
    /** Eventuale numero fattura collegata (per NC che annullano un documento). */
    relatedInvoiceNumber?: string | null;
    /** Tipo documento SDI (TD01, TD17, TD18, TD19, TD04, …). */
    tipoDocumento?: string | null;
    /** Autofattura / integrazione acquisti esteri (TD17/TD18/TD19 o P.IVA estera). */
    isForeignAutofattura?: boolean;
    isReverseCharge?: boolean;
    autofatturaType?: 'TD17' | 'TD18' | 'TD19' | null;
    foreignCategory?: 'Software & Servizi SaaS Estero' | 'Hosting / Infrastruttura' | null;
    rawPreview?: string;
};

export type ParseFatturaBatchResult = {
    invoices: ParsedFatturaPa[];
    skipped: Array<{ fileName: string; reason: string }>;
    warnings: string[];
};

/** Estrae contenuto del primo tag (con o senza namespace). */
export function extractXmlTag(xml: string, tagName: string): string | null {
    const re = new RegExp(
        `<(?:[\\w.-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tagName}>`,
        'i'
    );
    const m = xml.match(re);
    return m ? m[1].trim() : null;
}

function extractAllXmlTags(xml: string, tagName: string): string[] {
    const re = new RegExp(
        `<(?:[\\w.-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tagName}>`,
        'gi'
    );
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        out.push(m[1].trim());
    }
    return out;
}

function decodeXmlEntities(s: string): string {
    return s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\s+/g, ' ')
        .trim();
}

function textOf(innerXml: string | null): string {
    if (!innerXml) return '';
    // Se contiene sotto-tag, prendi solo testo foglia grezzo
    const plain = innerXml.replace(/<[^>]+>/g, ' ');
    return decodeXmlEntities(plain);
}

function parseItalianOrIsoAmount(raw: string | null | undefined): number | null {
    if (raw == null || raw === '') return null;
    let s = String(raw).trim().replace(/\s/g, '').replace(/€/g, '');
    if (!s) return null;
    // FatturaPA usa tipicamente punto decimale: 1234.56
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function eurosToCents(euros: number): number {
    return Math.round(euros * 100);
}

function normalizeDate(raw: string | null): string | null {
    if (!raw) return null;
    const s = decodeXmlEntities(raw).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const it = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (it) {
        const d = Number(it[1]);
        const m = Number(it[2]);
        let y = Number(it[3]);
        if (y < 100) y += 2000;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
}

/**
 * Parsa un singolo XML FatturaPA in record normalizzato.
 */
export function parseFatturaPaXml(xmlRaw: string, sourceFileName: string): ParsedFatturaPa {
    const xml = xmlRaw.replace(/^\uFEFF/, '');

    const cedente =
        extractXmlTag(xml, 'CedentePrestatore') ||
        extractXmlTag(xml, 'CedentePrestatoreDTE') ||
        '';

    const idCodice =
        textOf(extractXmlTag(cedente, 'IdCodice')) ||
        textOf(extractXmlTag(xml, 'IdCodice'));
    const idPaese = textOf(extractXmlTag(cedente, 'IdPaese')) || 'IT';
    const vendorVat = normalizeVendorVat(
        idCodice
            ? `${idPaese}${idCodice}`
            : textOf(extractXmlTag(cedente, 'CodiceFiscale')) || null
    );

    const denominazione = textOf(extractXmlTag(cedente, 'Denominazione'));
    const nome = textOf(extractXmlTag(cedente, 'Nome'));
    const cognome = textOf(extractXmlTag(cedente, 'Cognome'));
    const vendorName =
        denominazione ||
        [nome, cognome].filter(Boolean).join(' ').trim() ||
        'Fornitore SDI';

    const datiDoc = extractXmlTag(xml, 'DatiGeneraliDocumento') || '';
    const tipoDocumento = textOf(extractXmlTag(datiDoc, 'TipoDocumento')).toUpperCase();
    const isCreditNote =
        tipoDocumento === 'TD04' ||
        /NOTA\s*DI\s*CREDITO|CREDIT\s*NOTE/i.test(tipoDocumento) ||
        /NOTA\s*DI\s*CREDITO/i.test(textOf(extractXmlTag(datiDoc, 'Causale')));
    const invoiceNumber = textOf(extractXmlTag(datiDoc, 'Numero')) || textOf(extractXmlTag(xml, 'Numero'));
    const invoiceDate =
        normalizeDate(textOf(extractXmlTag(datiDoc, 'Data'))) ||
        normalizeDate(textOf(extractXmlTag(xml, 'Data')));
    const totaleDoc = parseItalianOrIsoAmount(
        textOf(extractXmlTag(datiDoc, 'ImportoTotaleDocumento')) ||
            textOf(extractXmlTag(xml, 'ImportoTotaleDocumento'))
    );

    const relatedBlocks =
        extractAllXmlTags(xml, 'DatiFattureCollegate').concat(
            extractAllXmlTags(xml, 'DatiFatturaPrecedente')
        );
    let relatedInvoiceNumber: string | null = null;
    for (const block of relatedBlocks) {
        const n = textOf(extractXmlTag(block, 'Numero'));
        if (n) {
            relatedInvoiceNumber = n.slice(0, 64);
            break;
        }
    }

    const causali = extractAllXmlTags(datiDoc || xml, 'Causale').map(textOf).filter(Boolean);
    const causale = causali.join(' — ') || '';

    const riepiloghi = extractAllXmlTags(xml, 'DatiRiepilogo');
    let netEuros = 0;
    let vatEuros = 0;
    let vatRate = 0;
    for (const block of riepiloghi) {
        const imponibile = parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'ImponibileImporto'))) || 0;
        const imposta = parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Imposta'))) || 0;
        const aliq = parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'AliquotaIVA'))) || 0;
        netEuros += imponibile;
        vatEuros += imposta;
        if (aliq > vatRate) vatRate = aliq;
    }

    const lineDescriptions = extractAllXmlTags(xml, 'Descrizione')
        .map(textOf)
        .filter((d) => d.length > 1)
        .slice(0, 12);

    if (!invoiceNumber) {
        throw new Error(`Numero fattura assente in ${sourceFileName}`);
    }
    if (!invoiceDate) {
        throw new Error(`Data fattura assente in ${sourceFileName}`);
    }

    let totalAbs =
        totaleDoc != null
            ? eurosToCents(Math.abs(totaleDoc))
            : eurosToCents(Math.abs(netEuros + vatEuros));
    if (!Number.isFinite(totalAbs) || totalAbs <= 0) {
        throw new Error(`Importo non valido in ${sourceFileName}`);
    }

    // Nota di credito: importi negativi in Contabilità (storno).
    const sign = isCreditNote || (totaleDoc != null && totaleDoc < 0) ? -1 : 1;
    const docKind: ParsedFatturaPa['docKind'] =
        sign < 0 ? 'NOTA_CREDITO' : 'FATTURA';

    let netCents = eurosToCents(Math.abs(netEuros));
    let vatCents = eurosToCents(Math.abs(vatEuros));
    if (netCents <= 0 && vatCents <= 0 && vatRate > 0) {
        vatCents = Math.round(totalAbs - totalAbs / (1 + vatRate / 100));
        netCents = totalAbs - vatCents;
    } else if (netCents <= 0) {
        netCents = totalAbs - vatCents;
    }

    const label = docKind === 'NOTA_CREDITO' ? 'Nota di credito' : 'Fattura';
    const descriptionParts = [
        `${label} n. ${invoiceNumber}`,
        relatedInvoiceNumber ? `rif. ${relatedInvoiceNumber}` : '',
        causale,
        lineDescriptions.slice(0, 3).join('; '),
    ].filter(Boolean);

    const foreign = detectForeignAutofattura({
        tipoDocumento,
        vendorVat,
        vendorName,
        causale: descriptionParts.join(' '),
    });

    return {
        vendorName: vendorName.slice(0, 160),
        vendorVat,
        invoiceNumber: invoiceNumber.slice(0, 64),
        invoiceDate,
        totalCents: sign * totalAbs,
        netCents: sign * Math.max(0, netCents),
        vatCents: sign * Math.max(0, vatCents),
        vatRate,
        causale: descriptionParts.join(' — ').slice(0, 2000),
        lineDescriptions,
        sourceFileName,
        dedupeKey: buildInvoiceDedupeKey(vendorVat, invoiceNumber, invoiceDate),
        docKind,
        relatedInvoiceNumber,
        tipoDocumento: tipoDocumento || null,
        isForeignAutofattura: foreign.isForeignAutofattura,
        isReverseCharge: foreign.isReverseCharge,
        autofatturaType: foreign.autofatturaType,
        foreignCategory: foreign.category,
        rawPreview: xml.slice(0, 240),
    };
}

async function parseZipBuffer(buffer: Buffer): Promise<ParseFatturaBatchResult> {
    const zip = await JSZip.loadAsync(buffer);
    const invoices: ParsedFatturaPa[] = [];
    const skipped: ParseFatturaBatchResult['skipped'] = [];
    const warnings: string[] = [];

    const entries = Object.keys(zip.files).filter((name) => {
        const lower = name.toLowerCase();
        if (zip.files[name].dir) return false;
        if (lower.includes('__macosx')) return false;
        return lower.endsWith('.xml');
    });

    if (entries.length === 0) {
        warnings.push('ZIP senza file .xml FatturaPA.');
        return { invoices, skipped, warnings };
    }

    for (const name of entries) {
        try {
            const text = await zip.files[name].async('text');
            const base = name.split('/').pop() || name;
            if (!/FatturaElettronica|CedentePrestatore|DatiGeneraliDocumento/i.test(text)) {
                skipped.push({ fileName: base, reason: 'XML non riconosciuto come FatturaPA' });
                continue;
            }
            invoices.push(parseFatturaPaXml(text, base));
        } catch (err) {
            skipped.push({
                fileName: name.split('/').pop() || name,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return { invoices, skipped, warnings };
}

function normCsvKey(k: string): string {
    return k
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function findCsv(row: Record<string, unknown>, candidates: string[]): string {
    const keys = Object.keys(row);
    for (const cand of candidates) {
        const hit = keys.find((k) => {
            const n = normCsvKey(k);
            return n === cand || n.includes(cand);
        });
        if (hit && row[hit] != null && String(row[hit]).trim()) return String(row[hit]).trim();
    }
    return '';
}

/**
 * CSV tipico YouDoox / export SDI (intestazioni IT variabili).
 */
export function parseYouDooxCsv(buffer: Buffer): ParseFatturaBatchResult {
    const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const delimiter = text.split('\n')[0]?.includes(';') ? ';' : ',';
    const parsed = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        dynamicTyping: false,
    });

    const invoices: ParsedFatturaPa[] = [];
    const skipped: ParseFatturaBatchResult['skipped'] = [];
    const warnings: string[] = [];

    (parsed.data || []).forEach((row, idx) => {
        try {
            const vendorName =
                findCsv(row, ['denominazione', 'fornitore', 'ragione sociale', 'cedente', 'vendor']) ||
                'Fornitore SDI';
            const vendorVat =
                findCsv(row, ['partita iva', 'p.iva', 'piva', 'id fiscale', 'vat', 'cf/piva']) || null;
            const invoiceNumber = findCsv(row, ['numero', 'n. fattura', 'numero documento', 'n doc']);
            const invoiceDate = normalizeDate(
                findCsv(row, ['data', 'data documento', 'data fattura', 'data emissione'])
            );
            const totalRaw =
                findCsv(row, [
                    'totale',
                    'importo totale',
                    'importo',
                    'totale documento',
                    'importototaledocumento',
                ]) || '';
            const totalEuros = parseItalianOrIsoAmount(totalRaw);
            const netEuros =
                parseItalianOrIsoAmount(
                    findCsv(row, ['imponibile', 'imponibileimporto', 'netto'])
                ) || 0;
            const vatEuros =
                parseItalianOrIsoAmount(findCsv(row, ['imposta', 'iva', 'imposta iva'])) || 0;
            const vatRate =
                parseItalianOrIsoAmount(findCsv(row, ['aliquota', 'aliquotaiva', '% iva'])) ||
                (netEuros > 0 && vatEuros > 0 ? (vatEuros / netEuros) * 100 : 22);
            const tipoRaw =
                findCsv(row, [
                    'tipo documento',
                    'tipo',
                    'tipodocumento',
                    'tipo doc',
                    'documento',
                ]) || '';
            const causale =
                findCsv(row, ['causale', 'descrizione', 'oggetto', 'bene', 'servizio']) ||
                `Fattura n. ${invoiceNumber}`;
            const isCreditNote =
                /TD04|NOTA\s*DI\s*CREDITO|CREDITO|NC\b/i.test(tipoRaw) ||
                /NOTA\s*DI\s*CREDITO/i.test(causale) ||
                (totalEuros != null && totalEuros < 0);

            if (!invoiceNumber || !invoiceDate || totalEuros == null || totalEuros === 0) {
                skipped.push({
                    fileName: `csv-row-${idx + 1}`,
                    reason: 'Riga CSV incompleta (numero/data/importo)',
                });
                return;
            }

            const sign = isCreditNote ? -1 : 1;
            const totalAbs = eurosToCents(Math.abs(totalEuros));
            const vatAbs =
                vatEuros !== 0
                    ? eurosToCents(Math.abs(vatEuros))
                    : Math.round(totalAbs - totalAbs / (1 + Math.abs(vatRate) / 100));
            const netAbs =
                netEuros !== 0 ? eurosToCents(Math.abs(netEuros)) : totalAbs - vatAbs;
            const relatedInvoiceNumber =
                findCsv(row, [
                    'fattura collegata',
                    'riferimento fattura',
                    'n. fattura collegata',
                    'documento collegato',
                ]) || null;
            const docKind: ParsedFatturaPa['docKind'] =
                sign < 0 ? 'NOTA_CREDITO' : 'FATTURA';
            const label = docKind === 'NOTA_CREDITO' ? 'Nota di credito' : 'Fattura';
            const vatNorm = normalizeVendorVat(vendorVat);
            const foreign = detectForeignAutofattura({
                tipoDocumento: tipoRaw,
                vendorVat: vatNorm,
                vendorName,
                causale,
            });

            invoices.push({
                vendorName: vendorName.slice(0, 160),
                vendorVat: vatNorm,
                invoiceNumber,
                invoiceDate,
                totalCents: sign * totalAbs,
                netCents: sign * netAbs,
                vatCents: sign * vatAbs,
                vatRate: Math.abs(vatRate),
                causale: `${label} n. ${invoiceNumber} — ${causale}`.slice(0, 2000),
                lineDescriptions: [causale],
                sourceFileName: `csv-row-${idx + 1}`,
                dedupeKey: buildInvoiceDedupeKey(vendorVat, invoiceNumber, invoiceDate),
                docKind,
                relatedInvoiceNumber,
                tipoDocumento: tipoRaw || null,
                isForeignAutofattura: foreign.isForeignAutofattura,
                isReverseCharge: foreign.isReverseCharge,
                autofatturaType: foreign.autofatturaType,
                foreignCategory: foreign.category,
            });
        } catch (err) {
            skipped.push({
                fileName: `csv-row-${idx + 1}`,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    });

    if (!invoices.length && !skipped.length) {
        warnings.push('CSV senza righe fattura riconoscibili (verifica intestazioni YouDoox/SDI).');
    }

    return { invoices, skipped, warnings };
}

/**
 * Ingresso unificato: .xml | .zip (XML) | .csv YouDoox/SDI.
 */
export async function parseInvoiceUpload(
    buffer: Buffer,
    fileName: string,
    contentType?: string
): Promise<ParseFatturaBatchResult> {
    const lower = fileName.toLowerCase();
    const ct = (contentType || '').toLowerCase();

    if (lower.endsWith('.zip') || ct.includes('zip')) {
        return parseZipBuffer(buffer);
    }
    if (lower.endsWith('.csv') || ct.includes('csv') || ct.includes('text/plain')) {
        return parseYouDooxCsv(buffer);
    }
    if (lower.endsWith('.xml') || ct.includes('xml')) {
        try {
            const inv = parseFatturaPaXml(buffer.toString('utf-8'), fileName);
            return { invoices: [inv], skipped: [], warnings: [] };
        } catch (err) {
            return {
                invoices: [],
                skipped: [
                    {
                        fileName,
                        reason: err instanceof Error ? err.message : String(err),
                    },
                ],
                warnings: [],
            };
        }
    }

    // Tentativo ZIP magico (PK..)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
        return parseZipBuffer(buffer);
    }

    return {
        invoices: [],
        skipped: [{ fileName, reason: 'Formato non supportato (usa ZIP/XML/CSV)' }],
        warnings: [],
    };
}

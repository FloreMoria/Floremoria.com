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
import { FLOREMORIA_LEGAL_ENTITY } from '@/lib/financial/companyBankDetails';

export type InvoiceRole = 'PASSIVE' | 'ACTIVE' | 'AUTOFATTURA';

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
    /** PASSIVE fornitore | ACTIVE FloreMoria emittente | AUTOFATTURA TD17/18/19 */
    invoiceRole?: InvoiceRole;
    cedenteVat?: string | null;
    cessionarioVat?: string | null;
    rawPreview?: string;
};

function vatDigits(v: string | null | undefined): string {
    return String(v || '').replace(/\D/g, '');
}

function isFloremoriaVat(vat: string | null | undefined): boolean {
    const dig = vatDigits(vat);
    const ours = vatDigits(FLOREMORIA_LEGAL_ENTITY.vatNumber);
    return Boolean(dig && ours && dig === ours);
}

function classifyInvoiceRole(input: {
    tipoDocumento: string;
    isForeignAutofattura: boolean;
    cedenteVat: string | null;
}): InvoiceRole {
    const td = input.tipoDocumento.toUpperCase();
    if (td === 'TD17' || td === 'TD18' || td === 'TD19' || input.isForeignAutofattura) {
        return 'AUTOFATTURA';
    }
    if (isFloremoriaVat(input.cedenteVat)) return 'ACTIVE';
    return 'PASSIVE';
}

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

/** Unisce i body FatturaPA (multi-corpo) per estrazione coerente di importi e righe. */
function flattenFatturaXmlScope(xml: string): string {
    const bodies = extractAllXmlTags(xml, 'FatturaElettronicaBody');
    if (bodies.length > 0) return bodies.join('\n');
    return xml;
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
    // Formato IT: 1.234,56 — Formato EN: 1,234.56 o 1234.56
    if (s.includes(',') && s.includes('.')) {
        const lastComma = s.lastIndexOf(',');
        const lastDot = s.lastIndexOf('.');
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/** Somma tutti i tag ImponibileImporto (DatiRiepilogo) nel documento. */
function sumImponibileImportoTags(xml: string): number {
    let total = 0;
    const re = /<(?:[\w.-]+:)?ImponibileImporto[^>]*>([^<]+)</gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(xml)) !== null) {
        total += parseItalianOrIsoAmount(match[1]) || 0;
    }
    return total;
}

/** Somma tutti i tag Imposta (solo dentro DatiRiepilogo, evita falsi positivi su ImponibileImporto). */
function sumImpostaTags(xml: string): number {
    let total = 0;
    for (const block of extractAllXmlTags(xml, 'DatiRiepilogo')) {
        total += parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Imposta'))) || 0;
    }
    return total;
}

/** Fallback: somma PrezzoTotale delle righe DettaglioLinee. */
function sumDettaglioLineePrezzoTotale(xml: string): number {
    let total = 0;
    for (const block of extractAllXmlTags(xml, 'DettaglioLinee')) {
        const prezzo =
            parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'PrezzoTotale'))) ||
            parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'PrezzoUnitario'))) ||
            0;
        total += prezzo;
    }
    return total;
}

export type FatturaPaAmountBreakdown = {
    netEuros: number;
    vatEuros: number;
    vatRate: number;
    totalEuros: number | null;
};

/**
 * Estrae imponibile/IVA/totale da XML FatturaPA con fallback multipli.
 */
export function extractFatturaPaAmounts(xmlRaw: string): FatturaPaAmountBreakdown {
    const xml = xmlRaw.replace(/^\uFEFF/, '');
    const xmlScope = flattenFatturaXmlScope(xml);

    const datiBeni =
        extractXmlTag(xmlScope, 'DatiBeniServizi') ||
        extractXmlTag(xmlScope, 'DatiBeniServiziDTE') ||
        extractXmlTag(xml, 'DatiBeniServizi') ||
        '';

    const datiDoc =
        extractXmlTag(xmlScope, 'DatiGeneraliDocumento') ||
        extractXmlTag(xml, 'DatiGeneraliDocumento') ||
        '';
    const totaleDoc = parseItalianOrIsoAmount(
        textOf(extractXmlTag(datiDoc, 'ImportoTotaleDocumento')) ||
            textOf(extractXmlTag(xml, 'ImportoTotaleDocumento'))
    );

    const riepiloghi = datiBeni
        ? extractAllXmlTags(datiBeni, 'DatiRiepilogo')
        : extractAllXmlTags(xml, 'DatiRiepilogo');
    let netEuros = 0;
    let vatEuros = 0;
    let vatRate = 0;

    for (const block of riepiloghi) {
        const imponibile =
            parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'ImponibileImporto'))) ||
            parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Imponibile'))) ||
            0;
        const imposta =
            parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Imposta'))) ||
            parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'ImpostaIVA'))) ||
            0;
        const aliq =
            parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'AliquotaIVA'))) ||
            parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Aliquota'))) ||
            0;
        netEuros += imponibile;
        vatEuros += imposta;
        if (aliq > vatRate) vatRate = aliq;
    }

    if (netEuros <= 0) {
        netEuros = sumImponibileImportoTags(datiBeni || xml);
    }
    if (vatEuros <= 0 && netEuros > 0) {
        vatEuros = sumImpostaTags(datiBeni || xml);
        if (vatEuros <= 0) vatEuros = sumImpostaTags(xml);
    }
    if (netEuros <= 0) {
        netEuros = sumDettaglioLineePrezzoTotale(datiBeni || xml);
    }
    if (netEuros <= 0) {
        netEuros = sumDettaglioLineePrezzoTotale(xml);
    }
    if (vatEuros <= 0 && netEuros > 0 && vatRate > 0) {
        vatEuros = Math.round(netEuros * vatRate) / 100;
    }
    if (netEuros <= 0 && totaleDoc != null && vatEuros > 0) {
        netEuros = Math.max(0, totaleDoc - vatEuros);
    } else if (netEuros <= 0 && totaleDoc != null && vatEuros <= 0) {
        if (vatRate > 0) {
            netEuros = totaleDoc / (1 + vatRate / 100);
            vatEuros = Math.max(0, totaleDoc - netEuros);
        } else {
            netEuros = totaleDoc;
        }
    }

    return {
        netEuros,
        vatEuros,
        vatRate,
        totalEuros: totaleDoc,
    };
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

    const amounts = extractFatturaPaAmounts(xml);
    const netEuros = amounts.netEuros;
    const vatEuros = amounts.vatEuros;
    const vatRate = amounts.vatRate;
    const totaleDoc = amounts.totalEuros;

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

    const cessionario =
        extractXmlTag(xml, 'CessionarioCommittente') ||
        extractXmlTag(xml, 'CessionarioCommittenteDTE') ||
        '';
    const cessionarioIdCodice = textOf(extractXmlTag(cessionario, 'IdCodice'));
    const cessionarioIdPaese = textOf(extractXmlTag(cessionario, 'IdPaese')) || 'IT';
    const cessionarioVat = normalizeVendorVat(
        cessionarioIdCodice
            ? `${cessionarioIdPaese}${cessionarioIdCodice}`
            : textOf(extractXmlTag(cessionario, 'CodiceFiscale')) || null
    );

    const invoiceRole = classifyInvoiceRole({
        tipoDocumento,
        isForeignAutofattura: Boolean(foreign.isForeignAutofattura),
        cedenteVat: vendorVat,
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
        isForeignAutofattura: foreign.isForeignAutofattura || invoiceRole === 'AUTOFATTURA',
        isReverseCharge: foreign.isReverseCharge || invoiceRole === 'AUTOFATTURA',
        autofatturaType: foreign.autofatturaType,
        foreignCategory: foreign.category,
        invoiceRole,
        cedenteVat: vendorVat,
        cessionarioVat,
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

export type FatturaPaPartyAddress = {
    indirizzo: string | null;
    cap: string | null;
    comune: string | null;
    provincia: string | null;
    nazione: string | null;
};

export type FatturaPaParty = {
    denominazione: string | null;
    nome: string | null;
    cognome: string | null;
    partitaIva: string | null;
    codiceFiscale: string | null;
    regimeFiscale: string | null;
    sede: FatturaPaPartyAddress;
};

export type FatturaPaPaymentDetail = {
    modalita: string | null;
    modalitaLabel: string | null;
    dataScadenza: string | null;
    importo: number | null;
    iban: string | null;
    istituto: string | null;
    beneficiario: string | null;
};

export type FatturaPaLineItem = {
    numeroLinea: string | null;
    descrizione: string;
    quantita: number | null;
    prezzoUnitario: number | null;
    prezzoTotale: number | null;
    aliquotaIva: number | null;
    natura: string | null;
};

export type FatturaPaVatSummary = {
    aliquota: number | null;
    imponibile: number;
    imposta: number;
    natura: string | null;
    esigibilita: string | null;
};

export type FatturaPaDetail = {
    generali: {
        tipoDocumento: string | null;
        numero: string | null;
        data: string | null;
        divisa: string | null;
        importoTotale: number | null;
        causale: string | null;
    };
    cedente: FatturaPaParty;
    cessionario: FatturaPaParty;
    pagamenti: FatturaPaPaymentDetail[];
    righe: FatturaPaLineItem[];
    riepilogoIva: FatturaPaVatSummary[];
    importi: FatturaPaAmountBreakdown;
};

const PAYMENT_MODE_LABELS: Record<string, string> = {
    MP01: 'Contanti',
    MP02: 'Assegno',
    MP03: 'Assegno circolare',
    MP04: 'Contanti presso Tesoreria',
    MP05: 'Bonifico',
    MP06: 'Vaglia cambiario',
    MP07: 'Bollettino bancario',
    MP08: 'Carta di pagamento',
    MP09: 'RID',
    MP10: 'RID utenze',
    MP11: 'RID veloce',
    MP12: 'RIBA',
    MP13: 'MAV',
    MP14: 'Quietanza erario',
    MP15: 'Giroconto contabile',
    MP16: 'Domiciliazione bancaria',
    MP17: 'Domiciliazione postale',
    MP18: 'Bollettino c/c postale',
    MP19: 'SEPA Direct Debit',
    MP20: 'SEPA Direct Debit CORE',
    MP21: 'SEPA Direct Debit B2B',
    MP22: 'Trattenuta su somme riscosse',
    MP23: 'PagoPA',
};

function parsePartyBlock(block: string): FatturaPaParty {
    const idFiscale = extractXmlTag(block, 'IdFiscaleIVA') || extractXmlTag(block, 'IdFiscale') || '';
    const idCodice = textOf(extractXmlTag(idFiscale || block, 'IdCodice'));
    const idPaese = textOf(extractXmlTag(idFiscale || block, 'IdPaese')) || 'IT';
    const sedeBlock = extractXmlTag(block, 'Sede') || extractXmlTag(block, 'StabileOrganizzazione') || '';
    return {
        denominazione: textOf(extractXmlTag(block, 'Denominazione')) || null,
        nome: textOf(extractXmlTag(block, 'Nome')) || null,
        cognome: textOf(extractXmlTag(block, 'Cognome')) || null,
        partitaIva: idCodice ? `${idPaese}${idCodice}` : null,
        codiceFiscale: textOf(extractXmlTag(block, 'CodiceFiscale')) || null,
        regimeFiscale: textOf(extractXmlTag(block, 'RegimeFiscale')) || null,
        sede: {
            indirizzo: textOf(extractXmlTag(sedeBlock, 'Indirizzo')) || null,
            cap: textOf(extractXmlTag(sedeBlock, 'CAP')) || null,
            comune: textOf(extractXmlTag(sedeBlock, 'Comune')) || null,
            provincia: textOf(extractXmlTag(sedeBlock, 'Provincia')) || null,
            nazione: textOf(extractXmlTag(sedeBlock, 'Nazione')) || null,
        },
    };
}

/**
 * Parsing analitico completo FatturaPA per drawer dettaglio SDI.
 */
export function parseFatturaPaDetail(xmlRaw: string): FatturaPaDetail {
    const xml = xmlRaw.replace(/^\uFEFF/, '');
    // Un solo scope: evita doppia estrazione quando i body sono già annidati nel documento.
    const scope = flattenFatturaXmlScope(xml);

    const cedente =
        extractXmlTag(scope, 'CedentePrestatore') ||
        extractXmlTag(scope, 'CedentePrestatoreDTE') ||
        '';
    const cessionario =
        extractXmlTag(scope, 'CessionarioCommittente') ||
        extractXmlTag(scope, 'CessionarioCommittenteDTE') ||
        '';

    const datiDoc = extractXmlTag(scope, 'DatiGeneraliDocumento') || '';
    const causali = extractAllXmlTags(datiDoc || scope, 'Causale').map(textOf).filter(Boolean);

    const importi = extractFatturaPaAmounts(xml);

    const righeMap = new Map<string, FatturaPaLineItem>();
    for (const block of extractAllXmlTags(scope, 'DettaglioLinee')) {
        const desc = textOf(extractXmlTag(block, 'Descrizione'));
        if (!desc) continue;
        const item: FatturaPaLineItem = {
            numeroLinea: textOf(extractXmlTag(block, 'NumeroLinea')) || null,
            descrizione: desc,
            quantita: parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Quantita'))),
            prezzoUnitario: parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'PrezzoUnitario'))),
            prezzoTotale: parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'PrezzoTotale'))),
            aliquotaIva: parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'AliquotaIVA'))),
            natura: textOf(extractXmlTag(block, 'Natura')) || null,
        };
        const key = [
            item.numeroLinea || '',
            item.descrizione,
            item.prezzoTotale ?? '',
            item.aliquotaIva ?? '',
        ].join('|');
        righeMap.set(key, item);
    }

    const riepilogoMap = new Map<string, FatturaPaVatSummary>();
    for (const block of extractAllXmlTags(scope, 'DatiRiepilogo')) {
        const row: FatturaPaVatSummary = {
            aliquota:
                parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'AliquotaIVA'))) ||
                parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Aliquota'))),
            imponibile:
                parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'ImponibileImporto'))) ||
                parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Imponibile'))) ||
                0,
            imposta:
                parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'Imposta'))) ||
                parseItalianOrIsoAmount(textOf(extractXmlTag(block, 'ImpostaIVA'))) ||
                0,
            natura: textOf(extractXmlTag(block, 'Natura')) || null,
            esigibilita: textOf(extractXmlTag(block, 'EsigibilitaIVA')) || null,
        };
        const key = [row.aliquota ?? '', row.imponibile, row.imposta, row.natura || ''].join('|');
        riepilogoMap.set(key, row);
    }

    const pagamentiMap = new Map<string, FatturaPaPaymentDetail>();
    for (const pagBlock of extractAllXmlTags(scope, 'DatiPagamento')) {
        for (const detBlock of extractAllXmlTags(pagBlock, 'DettaglioPagamento')) {
            const modalita = textOf(extractXmlTag(detBlock, 'ModalitaPagamento')) || null;
            const item: FatturaPaPaymentDetail = {
                modalita,
                modalitaLabel: modalita ? PAYMENT_MODE_LABELS[modalita] || modalita : null,
                dataScadenza:
                    normalizeDate(textOf(extractXmlTag(detBlock, 'DataScadenzaPagamento'))) ||
                    normalizeDate(textOf(extractXmlTag(detBlock, 'DataRiferimentoTerminiPagamento'))),
                importo: parseItalianOrIsoAmount(textOf(extractXmlTag(detBlock, 'ImportoPagamento'))),
                iban: textOf(extractXmlTag(detBlock, 'IBAN')) || null,
                istituto: textOf(extractXmlTag(detBlock, 'IstitutoFinanziario')) || null,
                beneficiario: textOf(extractXmlTag(detBlock, 'Beneficiario')) || null,
            };
            const key = [item.modalita || '', item.importo ?? '', item.iban || ''].join('|');
            pagamentiMap.set(key, item);
        }
    }

    return {
        generali: {
            tipoDocumento: textOf(extractXmlTag(datiDoc, 'TipoDocumento')) || null,
            numero: textOf(extractXmlTag(datiDoc, 'Numero')) || null,
            data: normalizeDate(textOf(extractXmlTag(datiDoc, 'Data'))),
            divisa: textOf(extractXmlTag(datiDoc, 'Divisa')) || null,
            importoTotale:
                importi.totalEuros ??
                parseItalianOrIsoAmount(textOf(extractXmlTag(datiDoc, 'ImportoTotaleDocumento'))),
            causale: causali.join(' — ') || null,
        },
        cedente: parsePartyBlock(cedente),
        cessionario: parsePartyBlock(cessionario),
        pagamenti: [...pagamentiMap.values()],
        righe: [...righeMap.values()],
        riepilogoIva: [...riepilogoMap.values()],
        importi,
    };
}

/**
 * Trasporto SOAP verso InvoicesService YouDOX/DocuMI (BasicHttpBinding).
 * WSDL: {apiBaseUrl}/InvoicesService.svc?wsdl
 */
import type { YoudoxConfig, YoudoxInvoice, YoudoxInvoicesFilter } from './types';
import { invoicesServiceEndpoint, resolveInvoicesServiceCandidates } from './endpoints';

const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
const TNS = 'http://tempuri.org/';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';

const DEFAULT_LOOKBACK_DAYS = Number(process.env.YOUDOX_SYNC_LOOKBACK_DAYS || 120);

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function soapDateTime(isoLike: string): string {
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return isoLike.slice(0, 19);
    return d.toISOString().slice(0, 19);
}

function nilDateTimeElement(name: string, value?: string | null): string {
    if (value) {
        return `<tns:${name}>${escapeXml(soapDateTime(value))}</tns:${name}>`;
    }
    return `<tns:${name} xsi:nil="true" xmlns:xsi="${XSI}"/>`;
}

export { invoicesServiceEndpoint, resolveInvoicesServiceCandidates } from './endpoints';
export function normalizeReceivedFilter(filter: YoudoxInvoicesFilter = {}): YoudoxInvoicesFilter {
    const now = new Date();
    const from = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const defaultDataFatturaFrom = from < yearStart ? from : yearStart;

    return {
        TimestampFrom: filter.TimestampFrom || from.toISOString(),
        TimestampTo: filter.TimestampTo || now.toISOString(),
        DataFatturaFrom: filter.DataFatturaFrom || defaultDataFatturaFrom.toISOString(),
        DataFatturaTo: filter.DataFatturaTo || now.toISOString(),
        OnlyUnread: filter.OnlyUnread ?? false,
        ShowAlsoDeleted: filter.ShowAlsoDeleted ?? false,
        PartitaIVA: filter.PartitaIVA,
        Status: filter.Status,
    };
}

function buildInvoicesFilterXml(filter: YoudoxInvoicesFilter): string {
    const normalized = normalizeReceivedFilter(filter);
    const partitaIva = normalized.PartitaIVA?.trim()
        ? `<tns:PartitaIVA>${escapeXml(normalized.PartitaIVA.trim())}</tns:PartitaIVA>`
        : '';
    const status = normalized.Status?.trim()
        ? `<tns:Status>${escapeXml(String(normalized.Status).trim())}</tns:Status>`
        : '';

    return `<tns:filter>
      ${nilDateTimeElement('TimestampFrom', normalized.TimestampFrom)}
      ${nilDateTimeElement('TimestampTo', normalized.TimestampTo)}
      ${nilDateTimeElement('DataFatturaFrom', normalized.DataFatturaFrom)}
      ${nilDateTimeElement('DataFatturaTo', normalized.DataFatturaTo)}
      <tns:OnlyUnread>${normalized.OnlyUnread ? 'true' : 'false'}</tns:OnlyUnread>
      <tns:ShowAlsoDeleted>${normalized.ShowAlsoDeleted ? 'true' : 'false'}</tns:ShowAlsoDeleted>
      ${partitaIva}
      ${status}
    </tns:filter>`;
}

function buildSoapEnvelope(bodyInnerXml: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${SOAP_NS}" xmlns:tns="${TNS}" xmlns:xsi="${XSI}">
  <soap:Body>
    ${bodyInnerXml}
  </soap:Body>
</soap:Envelope>`;
}

function extractTagValue(xml: string, tagName: string): string | null {
    const re = new RegExp(
        `<(?:[a-zA-Z0-9_]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tagName}>`,
        'i'
    );
    const match = xml.match(re);
    if (!match) return null;
    const raw = match[1].trim();
    if (!raw || /xsi:nil\s*=\s*["']true["']/i.test(match[0])) return null;
    return decodeXmlEntities(raw);
}

function parseSoapFault(xml: string): string | null {
    const faultString = extractTagValue(xml, 'faultstring') || extractTagValue(xml, 'FaultString');
    if (faultString) return faultString;
    const faultCode = extractTagValue(xml, 'faultcode');
    return faultCode ? `SOAP Fault: ${faultCode}` : null;
}

function logSoapPhase(
    operation: string,
    endpoint: string,
    httpStatus: number,
    snippet: string
): void {
    const preview = snippet.replace(/\s+/g, ' ').slice(0, 500);
    console.log(
        `[youdox][SOAP][${operation}] POST ${endpoint} → HTTP ${httpStatus} · ${preview}`
    );
}

async function invokeSoap(
    config: YoudoxConfig,
    operation: string,
    soapAction: string,
    bodyInnerXml: string
): Promise<string> {
    const candidates = resolveInvoicesServiceCandidates(config);
    const envelope = buildSoapEnvelope(bodyInnerXml);
    const tried: string[] = [];
    let lastStatus = 0;
    let lastBody = '';
    let lastEndpoint = '';

    for (let i = 0; i < candidates.length; i += 1) {
        const endpoint = candidates[i];
        tried.push(endpoint);
        lastEndpoint = endpoint;

        console.info(
            `[youdox][SOAP][${operation}] tentativo ${i + 1}/${candidates.length}: ${endpoint}`
        );

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: `"${soapAction}"`,
            },
            body: envelope,
        });

        const text = await res.text();
        lastStatus = res.status;
        lastBody = text;
        logSoapPhase(operation, endpoint, res.status, text);

        if (res.status === 404 && i < candidates.length - 1) {
            console.warn(
                `[youdox][SOAP][${operation}] HTTP 404 su ${endpoint} — provo endpoint alternativo`
            );
            continue;
        }

        const fault = parseSoapFault(text);
        if (!res.ok) {
            const triedList = tried.join(' | ');
            throw new Error(
                fault ||
                    `[youdox] SOAP ${operation} fallita (HTTP ${res.status}) su ${endpoint}. URL provati: ${triedList}`
            );
        }
        if (fault) {
            throw new Error(`[youdox] SOAP ${operation} su ${endpoint}: ${fault}`);
        }
        if (i > 0) {
            console.info(
                `[youdox][SOAP][${operation}] endpoint risolto: ${endpoint} (dopo ${i} fallback)`
            );
        }
        return text;
    }

    const triedList = tried.join(' | ');
    throw new Error(
        `[youdox] SOAP ${operation} fallita (HTTP ${lastStatus}) su ${lastEndpoint}. URL provati: ${triedList}. Ultima risposta: ${lastBody.replace(/\s+/g, ' ').slice(0, 200)}`
    );
}

function parseInvoiceBlock(block: string): YoudoxInvoice {
    const get = (name: string) => extractTagValue(block, name);
    const num = (name: string): number | null => {
        const v = get(name);
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    return {
        InvoiceKey: get('InvoiceKey') || '',
        OriginalFilename: get('OriginalFilename'),
        ProgressivoSdI: get('ProgressivoSdI'),
        IdentificativoSdI: get('IdentificativoSdI'),
        FatturaNumero: get('FatturaNumero'),
        FatturaData: get('FatturaData'),
        ClienteDenominazione: get('ClienteDenominazione'),
        ClientePartitaIva: get('ClientePartitaIva'),
        ClienteCodiceFiscale: get('ClienteCodiceFiscale'),
        DichiaranteDenominazione: get('DichiaranteDenominazione'),
        DichiarantePartitaIva: get('DichiarantePartitaIva'),
        Status: get('Status'),
        StatusMessage: get('StatusMessage'),
        StatusTimestamp: get('StatusTimestamp'),
        InfoTipoDocumento: get('InfoTipoDocumento'),
        InfoImportoTotaleDocumento: num('InfoImportoTotaleDocumento'),
        InfoImponibileImportoTotale: num('InfoImponibileImportoTotale'),
        InfoImpostaTotale: num('InfoImpostaTotale'),
        InfoImportoBollo: num('InfoImportoBollo'),
        InfoDivisa: get('InfoDivisa'),
        InfoNotes2: get('InfoNotes2'),
    };
}

function parseInvoicesFromResponse(xml: string): YoudoxInvoice[] {
    const blocks = [
        ...xml.matchAll(/<(?:[a-zA-Z0-9_]+:)?Invoice\b[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?Invoice>/gi),
    ];
    return blocks
        .map((m) => parseInvoiceBlock(m[0]))
        .filter((inv) => Boolean(inv.InvoiceKey));
}

export async function soapListReceivedByFilter(
    config: YoudoxConfig,
    token: string,
    filter: YoudoxInvoicesFilter
): Promise<YoudoxInvoice[]> {
    const normalized = normalizeReceivedFilter(filter);
    const candidates = resolveInvoicesServiceCandidates(config);
    const endpoint = candidates[0] || invoicesServiceEndpoint(config);

    console.info('[youdox-sync] Invoices_ListReceivedByFilter request', {
        endpoint,
        timestampFrom: normalized.TimestampFrom?.slice(0, 19),
        timestampTo: normalized.TimestampTo?.slice(0, 19),
        dataFatturaFrom: normalized.DataFatturaFrom?.slice(0, 10),
        dataFatturaTo: normalized.DataFatturaTo?.slice(0, 10),
        onlyUnread: normalized.OnlyUnread,
        showAlsoDeleted: normalized.ShowAlsoDeleted,
        status: normalized.Status ?? null,
        partitaIva: normalized.PartitaIVA ?? null,
    });

    const body = `<tns:Invoices_ListReceivedByFilter>
      <tns:token>${escapeXml(token)}</tns:token>
      ${buildInvoicesFilterXml(filter)}
    </tns:Invoices_ListReceivedByFilter>`;

    const xml = await invokeSoap(
        config,
        'Invoices_ListReceivedByFilter',
        `${TNS}IInvoicesService/Invoices_ListReceivedByFilter`,
        body
    );
    const invoices = parseInvoicesFromResponse(xml);

    console.info('[youdox-sync] Invoices_ListReceivedByFilter response', {
        httpParsedCount: invoices.length,
        sampleKeys: invoices.slice(0, 5).map((i) => i.InvoiceKey),
    });

    return invoices;
}

export async function soapGetDownloadLink(
    config: YoudoxConfig,
    token: string,
    invoiceKey: string,
    type: string
): Promise<string> {
    const body = `<tns:Invoices_GetDownloadLink>
      <tns:token>${escapeXml(token)}</tns:token>
      <tns:invoice_key>${escapeXml(invoiceKey)}</tns:invoice_key>
      <tns:type>${escapeXml(type)}</tns:type>
    </tns:Invoices_GetDownloadLink>`;

    const xml = await invokeSoap(
        config,
        'Invoices_GetDownloadLink',
        `${TNS}IInvoicesService/Invoices_GetDownloadLink`,
        body
    );
    const url =
        extractTagValue(xml, 'Invoices_GetDownloadLinkResult') ||
        extractTagValue(xml, 'GetDownloadLinkResult');
    if (!url) {
        throw new Error('[youdox] Invoices_GetDownloadLink: URL assente nella risposta SOAP.');
    }
    return url;
}

export async function soapSetFlagRead(
    config: YoudoxConfig,
    token: string,
    invoiceKey: string,
    flagRead = true
): Promise<void> {
    const body = `<tns:Invoices_SetFlagRead>
      <tns:token>${escapeXml(token)}</tns:token>
      <tns:invoice_key>${escapeXml(invoiceKey)}</tns:invoice_key>
      <tns:flag_read>${flagRead ? 'true' : 'false'}</tns:flag_read>
    </tns:Invoices_SetFlagRead>`;

    await invokeSoap(
        config,
        'Invoices_SetFlagRead',
        `${TNS}IInvoicesService/Invoices_SetFlagRead`,
        body
    );
}

export async function soapGetStatusReport(
    config: YoudoxConfig,
    token: string,
    params: { from: string; to: string; useXlsx?: boolean }
): Promise<Buffer> {
    const body = `<tns:Invoices_GetStatusReport>
      <tns:token>${escapeXml(token)}</tns:token>
      <tns:timestamp_from>${escapeXml(soapDateTime(params.from))}</tns:timestamp_from>
      <tns:timestamp_to>${escapeXml(soapDateTime(params.to))}</tns:timestamp_to>
      <tns:use_xlsx>${params.useXlsx ? 'true' : 'false'}</tns:use_xlsx>
    </tns:Invoices_GetStatusReport>`;

    const xml = await invokeSoap(
        config,
        'Invoices_GetStatusReport',
        `${TNS}IInvoicesService/Invoices_GetStatusReport`,
        body
    );
    const b64 =
        extractTagValue(xml, 'Invoices_GetStatusReportResult') ||
        extractTagValue(xml, 'GetStatusReportResult');
    if (!b64) {
        throw new Error('[youdox] Invoices_GetStatusReport: payload base64 assente.');
    }
    return Buffer.from(b64.replace(/\s+/g, ''), 'base64');
}

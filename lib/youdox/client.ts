/**
 * Client YouDOX Fatturazione (DocuMI).
 *
 * Protocolli supportati dalle specifiche:
 * - **SOAP/WSDL** (primario per ERP) — ExchangeService + InvoicesService
 * - **SFTP** (massivo) — cartelle /downloads e /uploads
 * - **YouDOX inCloud** / piattaforma web — fuori scope API FloreMoria
 *
 * Non è un’API REST JSON per i documenti: solo GetToken.aspx risponde in JSON.
 * InvoicesService: chiamate SOAP document/literal via lib/youdox/soap.ts.
 */

import { getYoudoxAccessToken, loadYoudoxConfigFromEnv } from './auth';
import {
    invoicesServiceEndpoint,
    normalizeReceivedFilter,
    soapGetDownloadLink,
    soapGetStatusReport,
    soapListReceivedByFilter,
    soapSetFlagRead,
} from './soap';
import { fetchAllReceivedInvoicesForSync } from './listReceivedInvoicesPaged';
import type {
    YoudoxConfig,
    YoudoxDownloadType,
    YoudoxExchangeState,
    YoudoxInvoice,
    YoudoxInvoicesFilter,
} from './types';

export type YoudoxClientOptions = {
    config?: YoudoxConfig;
    /** Se true, non chiama SOAP (stub locali). */
    dryRun?: boolean;
};

function requireConfig(config: YoudoxConfig | null): YoudoxConfig {
    if (!config) {
        throw new Error(
            '[youdox] Config assente. Imposta YOUDOX_API_BASE_URL, YOUDOX_TOKEN_URL, YOUDOX_CLIENT_ID, YOUDOX_USERNAME, YOUDOX_PASSWORD.'
        );
    }
    return config;
}

/**
 * Facade typed verso i metodi WS essenziali.
 */
export class YoudoxClient {
    readonly config: YoudoxConfig;
    private readonly dryRun: boolean;

    constructor(opts: YoudoxClientOptions = {}) {
        this.config = requireConfig(opts.config ?? loadYoudoxConfigFromEnv());
        this.dryRun = opts.dryRun ?? process.env.YOUDOX_DRY_RUN === 'true';
    }

    static fromEnv(opts?: Omit<YoudoxClientOptions, 'config'>): YoudoxClient {
        return new YoudoxClient(opts);
    }

    async getAccessToken(): Promise<string> {
        return getYoudoxAccessToken(this.config);
    }

    serviceUrl(serviceName: 'ExchangeService' | 'InvoicesService' | 'AccountService' | 'VendorService'): string {
        if (serviceName === 'InvoicesService') {
            return invoicesServiceEndpoint(this.config);
        }
        return `${this.config.apiBaseUrl}/${serviceName}.svc`;
    }

    // ——— Ciclo attivo (ExchangeService) — stub fino a cablaggio Exchange ———

    async importXmlToSend(
        xml: Buffer | string,
        originalFilename: string,
        pleaseValidate = true
    ): Promise<YoudoxExchangeState> {
        await this.getAccessToken();
        if (this.dryRun) {
            return {
                Filename: originalFilename,
                IsErrorExchange: false,
                Message: 'DRY_RUN: XML accettato localmente (SOAP non invocato)',
                ErrorCode: null,
            };
        }
        void xml;
        void pleaseValidate;
        throw new Error(
            `[youdox] SOAP Exchange_ImportXMLToSend non ancora cablato. WSDL: ${this.serviceUrl('ExchangeService')}?wsdl`
        );
    }

    async importZipXmlPackToSend(
        zip: Buffer,
        pleaseValidate = true
    ): Promise<YoudoxExchangeState[]> {
        await this.getAccessToken();
        if (this.dryRun) {
            return [
                {
                    Filename: 'pack.zip',
                    IsErrorExchange: false,
                    Message: 'DRY_RUN: ZIP accettato localmente',
                    ErrorCode: null,
                },
            ];
        }
        void zip;
        void pleaseValidate;
        throw new Error(
            `[youdox] SOAP Exchange_ImportZipXMLPackToSend non ancora cablato. WSDL: ${this.serviceUrl('ExchangeService')}?wsdl`
        );
    }

    async validateXml(xml: Buffer | string, originalFilename: string): Promise<YoudoxExchangeState> {
        await this.getAccessToken();
        if (this.dryRun) {
            return {
                Filename: originalFilename,
                IsErrorExchange: false,
                Message: 'DRY_RUN: validazione simulata OK',
                ErrorCode: null,
            };
        }
        void xml;
        throw new Error('[youdox] SOAP Exchange_ValidateXML non ancora cablato.');
    }

    // ——— Stati / notifiche SdI (InvoicesService) ———

    async getStatusReport(params: {
        from: string;
        to: string;
        useXlsx?: boolean;
    }): Promise<Buffer> {
        if (this.dryRun) {
            const csv = 'original_filename;progressivo_id;timestamp;status;status_message\n';
            return Buffer.from(csv, 'utf-8');
        }
        const token = await this.getAccessToken();
        return soapGetStatusReport(this.config, token, params);
    }

    async listSentByFilter(filter: YoudoxInvoicesFilter): Promise<YoudoxInvoice[]> {
        await this.getAccessToken();
        if (this.dryRun) return [];
        void filter;
        throw new Error('[youdox] SOAP Invoices_ListSentByFilter non ancora cablato.');
    }

    async listSentByFilename(originalFilename: string): Promise<YoudoxInvoice | null> {
        await this.getAccessToken();
        if (this.dryRun) return null;
        void originalFilename;
        throw new Error('[youdox] SOAP Invoices_ListSentByFilename non ancora cablato.');
    }

    // ——— Ciclo passivo ———

    async listReceivedByFilter(filter: YoudoxInvoicesFilter): Promise<YoudoxInvoice[]> {
        if (this.dryRun) return [];
        const token = await this.getAccessToken();
        const normalized = normalizeReceivedFilter(filter);
        console.info(
            `[youdox] Invoices_ListReceivedByFilter OnlyUnread=${normalized.OnlyUnread} ` +
                `${normalized.TimestampFrom?.slice(0, 10)} → ${normalized.TimestampTo?.slice(0, 10)}`
        );
        return soapListReceivedByFilter(this.config, token, normalized);
    }

    async listReceivedUnread(): Promise<YoudoxInvoice[]> {
        return this.listReceivedByFilter({ OnlyUnread: true });
    }

    /** Sync contabilità: tutte le passive nel periodo (non solo non lette), con chunking date. */
    async listAllReceivedForSync(): Promise<YoudoxInvoice[]> {
        if (this.dryRun) return [];
        const token = await this.getAccessToken();
        return fetchAllReceivedInvoicesForSync(this.config, token, { onlyUnread: false });
    }

    async getDownloadLink(
        invoiceKey: string,
        type: YoudoxDownloadType
    ): Promise<{ url: string; expiresInSeconds: number }> {
        if (this.dryRun) {
            return {
                url: `https://example.invalid/youdox-dry-run/${encodeURIComponent(invoiceKey)}?type=${type}`,
                expiresInSeconds: 300,
            };
        }
        const token = await this.getAccessToken();
        const url = await soapGetDownloadLink(this.config, token, invoiceKey, type);
        return { url, expiresInSeconds: 300 };
    }

    async setFlagRead(invoiceKey: string): Promise<void> {
        if (this.dryRun) return;
        const token = await this.getAccessToken();
        await soapSetFlagRead(this.config, token, invoiceKey, true);
    }

    /** Mappa cartelle SFTP (riferimento operativo, non client SSH). */
    static sftpFolderMap() {
        return {
            sendActiveXml: '/downloads/FEPA/',
            receiveSignedActive: '/uploads/FEPA/',
            receiveActiveEvidences: '/uploads/esitiFEPA/',
            receivePassiveInvoices: '/uploads/FEPARicevute/',
            sendPassiveAcceptReject: '/downloads/esitiFEPARicevute/',
            receivePassiveDT: '/uploads/esitiFEPARicevute/',
            conservationIn: '/downloads/CONS/',
            conservationReport: '/uploads/esitiCONS/',
        } as const;
    }
}

export function createYoudoxClient(opts?: YoudoxClientOptions): YoudoxClient {
    return YoudoxClient.fromEnv(opts);
}

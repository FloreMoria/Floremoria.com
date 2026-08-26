/**
 * Client YouDOX Fatturazione (DocuMI).
 *
 * Protocolli supportati dalle specifiche:
 * - **SOAP/WSDL** (primario per ERP) — ExchangeService + InvoicesService
 * - **SFTP** (massivo) — cartelle /downloads e /uploads
 * - **YouDOX inCloud** / piattaforma web — fuori scope API FloreMoria
 *
 * Non è un’API REST JSON per i documenti: solo GetToken.aspx risponde in JSON.
 * I metodi SOAP richiedono WSDL di produzione (YOUDOX_API_BASE_URL + *.svc?wsdl)
 * e token ottenuto da GetToken.
 *
 * FloreMoria oggi: ingest manuale XML/ZIP/CSV (`ingestSdiInvoices`) → questo client
 * automatizza invio attivo + poll passivo/stati verso lo stesso pipeline.
 */

import { getYoudoxAccessToken, loadYoudoxConfigFromEnv } from './auth';
import type {
    YoudoxConfig,
    YoudoxDownloadType,
    YoudoxExchangeState,
    YoudoxInvoice,
    YoudoxInvoicesFilter,
} from './types';

export type YoudoxClientOptions = {
    config?: YoudoxConfig;
    /** Se true, non chiama SOAP finché non è cablato il binding WSDL. */
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
 * Le chiamate SOAP reali vanno completate quando DocuMI comunica endpoint+WSDL di produzione
 * (oggi: stub strutturato + GetToken verificabile).
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
        return `${this.config.apiBaseUrl}/${serviceName}.svc`;
    }

    // ——— Ciclo attivo (ExchangeService) ———

    /**
     * Exchange_ImportXMLToSend — invio singola fattura XML FatturaPA.
     * please_validate=false → bozza web; true → controlli + coda SdI.
     */
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

    /** Exchange_ImportZipXMLPackToSend — invio multi XML in .zip. */
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

    /** Exchange_ValidateXML — controlli preliminari senza invio SdI. */
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

    /** Invoices_GetStatusReport — CSV/XLSX cambi stato (RC/NS/NE/DT/MC/AT). */
    async getStatusReport(params: {
        from: string;
        to: string;
        useXlsx?: boolean;
    }): Promise<Buffer> {
        await this.getAccessToken();
        if (this.dryRun) {
            const csv = 'original_filename;progressivo_id;timestamp;status;status_message\n';
            return Buffer.from(csv, 'utf-8');
        }
        void params;
        throw new Error('[youdox] SOAP Invoices_GetStatusReport non ancora cablato.');
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
        await this.getAccessToken();
        if (this.dryRun) return [];
        void filter;
        throw new Error('[youdox] SOAP Invoices_ListReceivedByFilter non ancora cablato.');
    }

    async listReceivedUnread(): Promise<YoudoxInvoice[]> {
        return this.listReceivedByFilter({ OnlyUnread: true });
    }

    /**
     * Invoices_GetDownloadLink — URL firmato (validità ~5 minuti).
     * type: XML | XMLunsigned | PdfADE | EvidencesPack | …
     */
    async getDownloadLink(
        invoiceKey: string,
        type: YoudoxDownloadType
    ): Promise<{ url: string; expiresInSeconds: number }> {
        await this.getAccessToken();
        if (this.dryRun) {
            return {
                url: `https://example.invalid/youdox-dry-run/${encodeURIComponent(invoiceKey)}?type=${type}`,
                expiresInSeconds: 300,
            };
        }
        throw new Error('[youdox] SOAP Invoices_GetDownloadLink non ancora cablato.');
    }

    async setFlagRead(invoiceKey: string): Promise<void> {
        await this.getAccessToken();
        if (this.dryRun) return;
        void invoiceKey;
        throw new Error('[youdox] SOAP Invoices_SetFlagRead non ancora cablato.');
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

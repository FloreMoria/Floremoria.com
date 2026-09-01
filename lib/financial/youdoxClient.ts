/**
 * Client YouDOX / DocuMI per la gestione finanziaria e contabile di FloreMoria.
 *
 * Supporta:
 * - Autenticazione OAuth (GetToken.aspx) con cache in memoria ed etichetta 60s prima della scadenza
 * - Recupero fatture elettroniche passive non lette (ListReceived / fetchUnreadInvoices)
 * - Download e parsing XML FatturaPA (downloadInvoiceXml)
 * - Marcatura documento come letto (SetFlagRead / markInvoiceAsRead)
 * - Sincronizzazione esiti e report di stato SDI (GetStatusReport / syncStatusReports)
 */

import {
    getYoudoxAccessToken,
    loadYoudoxConfigFromEnv,
    clearYoudoxTokenCache,
} from '@/lib/youdox/auth';
import {
    YoudoxClient,
    createYoudoxClient,
} from '@/lib/youdox/client';
import {
    parseFatturaPaXml,
    type ParsedFatturaPa,
} from '@/lib/financial/parseFatturaPaXml';
import type {
    YoudoxConfig,
    YoudoxInvoice,
    YoudoxDownloadType,
} from '@/lib/youdox/types';

export class FinancialYoudoxClient {
    readonly rawClient: YoudoxClient;
    readonly config: YoudoxConfig;

    constructor(config?: YoudoxConfig) {
        const loaded = config || loadYoudoxConfigFromEnv();
        if (!loaded) {
            throw new Error(
                '[youdox] Credenziali mancanti. Imposta YOUDOX_USERNAME, YOUDOX_PASSWORD e YOUDOX_CLIENT_ID.'
            );
        }
        this.config = loaded;
        this.rawClient = createYoudoxClient({ config: this.config });
    }

    /**
     * Recupera l'access token aggiornato da GetToken.aspx.
     */
    async getAccessToken(): Promise<string> {
        return getYoudoxAccessToken(this.config);
    }

    /**
     * 1. fetchPassiveInvoicesForSync: tutte le passive nel periodo (letto + non letto).
     */
    async fetchPassiveInvoicesForSync(): Promise<YoudoxInvoice[]> {
        return this.rawClient.listAllReceivedForSync();
    }

    /** @deprecated Preferire fetchPassiveInvoicesForSync per il tasto sync dashboard. */
    async fetchUnreadInvoices(): Promise<YoudoxInvoice[]> {
        return this.rawClient.listReceivedUnread();
    }

    /**
     * 2. downloadInvoiceXml: Scarica l'XML da YouDOX e ne effettua il parsing tramite parseFatturaPaXml.
     */
    async downloadInvoiceXml(invoiceKey: string): Promise<{
        rawXml: string;
        buffer: Buffer;
        parsed: ParsedFatturaPa;
        downloadUrl: string;
    }> {
        const downloadInfo = await this.rawClient.getDownloadLink(invoiceKey, 'XMLunsigned');
        const downloadUrl = downloadInfo.url;

        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Impossibile scaricare l'XML per la chiave ${invoiceKey}: HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const rawXml = buffer.toString('utf-8');
        const fileName = `${invoiceKey}.xml`;

        const parsed = parseFatturaPaXml(rawXml, fileName);

        return {
            rawXml,
            buffer,
            parsed,
            downloadUrl,
        };
    }

    /**
     * 3. markInvoiceAsRead: Segna una fattura come letta su YouDOX (SetFlagRead).
     */
    async markInvoiceAsRead(invoiceKey: string): Promise<void> {
        await this.rawClient.setFlagRead(invoiceKey);
    }

    /**
     * 4. syncStatusReports: Recupera il report di stato SDI per un intervallo di date.
     */
    async syncStatusReports(fromDate: string, toDate: string): Promise<{
        reportBuffer: Buffer;
        reportText: string;
    }> {
        const reportBuffer = await this.rawClient.getStatusReport({
            from: fromDate,
            to: toDate,
            useXlsx: false,
        });
        const reportText = reportBuffer.toString('utf-8');

        return {
            reportBuffer,
            reportText,
        };
    }
}

/**
 * Factory helper per ottenere un'istanza del client finanziario YouDOX.
 */
export function getFinancialYoudoxClient(): FinancialYoudoxClient {
    return new FinancialYoudoxClient();
}

export { clearYoudoxTokenCache };

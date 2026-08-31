/**
 * Tipi YouDOX Fatturazione (DocuMI) — allineati a SpecificheTecniche_YouDOXFatturazione.pdf
 * Fonte: https://servizi.youdox.it/documentazione/SpecificheTecniche_YouDOXFatturazione.pdf
 */

/** Stati fattura emessa / ricevuta (classe Status). */
export type YoudoxInvoiceStatus =
    | 'working'
    | 'sent_to_sdi'
    | 'evidence_RC'
    | 'evidence_NS'
    | 'evidence_NE'
    | 'evidence_DT'
    | 'evidence_MC'
    | 'sent_failed'
    | 'sent_ok'
    | string;

/** DownloadRequestType — formati GetDownloadLink. */
export type YoudoxDownloadType =
    | 'XML'
    | 'XMLunsigned'
    | 'PdfADE'
    | 'PdfDocumiSimple'
    | 'AttachmentsPack'
    | 'EvidencesPack';

export type YoudoxTokenResponse = {
    access_token: string;
    expires_in: number;
};

export type YoudoxTokenError = {
    error: string;
    error_message: string;
};

/** Messaggio operatore quando GetToken restituisce ER05. */
export const YOUDOX_ER05_USER_MESSAGE =
    'Credenziali API non riconosciute da YouDOX. Verificare se l\'utenza per Web Service richiede una password API specifica rilasciata da DocuMI.';

export class YoudoxAuthError extends Error {
    readonly code: string;

    constructor(message: string, code = 'ER05') {
        super(message);
        this.name = 'YoudoxAuthError';
        this.code = code;
    }
}

export type YoudoxExchangeState = {
    Filename: string;
    IsErrorExchange: boolean;
    Message: string;
    ErrorCode?: string | null;
};

/** Oggetto Invoice (InvoicesService). */
export type YoudoxInvoice = {
    InvoiceKey: string;
    OriginalFilename?: string | null;
    ProgressivoSdI?: string | null;
    IdentificativoSdI?: string | null;
    Status?: YoudoxInvoiceStatus | null;
    StatusMessage?: string | null;
    StatusTimestamp?: string | null;
    FatturaNumero?: string | null;
    FatturaData?: string | null;
    ClientePartitaIva?: string | null;
    ClienteDenominazione?: string | null;
    DichiarantePartitaIva?: string | null;
    DichiaranteDenominazione?: string | null;
    ClienteCodiceFiscale?: string | null;
    InfoTipoDocumento?: string | null;
    InfoImportoTotaleDocumento?: number | string | null;
    InfoImponibileImportoTotale?: number | string | null;
    InfoImpostaTotale?: number | string | null;
    InfoImportoBollo?: number | string | null;
    InfoDivisa?: string | null;
    InfoNotes2?: string | null;
};

export type YoudoxInvoicesFilter = {
    TimestampFrom?: string;
    TimestampTo?: string;
    DataFatturaFrom?: string;
    DataFatturaTo?: string;
    ShowAlsoDeleted?: boolean;
    OnlyUnread?: boolean;
    PartitaIVA?: string;
    Status?: YoudoxInvoiceStatus;
};

export type YoudoxConfig = {
    /** Base SOAP demo: https://servizi-demo.youdox.it/fatturazione/api */
    apiBaseUrl: string;
    /** Endpoint InvoicesService.svc (override opzionale). */
    invoicesServiceUrl?: string;
    /** Path GetToken.aspx (risposta JSON OAuth-like). */
    tokenUrl: string;
    clientId: string;
    username: string;
    password: string;
    /** SFTP opzionale (ciclo massivo). */
    sftpHost?: string;
    sftpUser?: string;
    sftpPort?: number;
};

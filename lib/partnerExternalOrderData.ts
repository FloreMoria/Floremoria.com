/**
 * Payload compatibile con il vecchio `ExternalDataDto` (.NET) e POST `api/external/order-data`.
 * Accetta chiavi camelCase o PascalCase (Newtonsoft legacy).
 */
export type PartnerExternalOrderPayload = {
    nomeUtente?: string;
    cognomeUtente?: string;
    telefonoUtente?: string;
    indirizzoUtente?: string;
    cittaUtente?: string;
    provinciaUtente?: string;
    capUtente?: string;
    codiceFiscaleUtente?: string;
    emailUtente?: string;
    nomeDefunto: string;
    cognomeDefunto: string;
    dataNascita?: string | null;
    dataMorte?: string | null;
    indirizzoConsegna?: string;
    codiceReferral: string;
    redirectUrl: string;
    emailAziendaPartner: string;
    info?: string;
};

function asRecord(v: unknown): Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string | undefined {
    for (const k of keys) {
        const v = r[k];
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (s.length) return s;
    }
    return undefined;
}

/** Normalizza il JSON ricevuto dal partner (camelCase / PascalCase). */
export function normalizePartnerExternalPayload(raw: unknown): PartnerExternalOrderPayload | null {
    const r = asRecord(raw);
    const nomeDefunto = pickStr(r, 'nomeDefunto', 'NomeDefunto');
    const cognomeDefunto = pickStr(r, 'cognomeDefunto', 'CognomeDefunto');
    const codiceReferral = pickStr(r, 'codiceReferral', 'CodiceReferral');
    const redirectUrl = pickStr(r, 'redirectUrl', 'RedirectUrl');
    const emailAziendaPartner = pickStr(r, 'emailAziendaPartner', 'EmailAziendaPartner');
    if (!nomeDefunto || !cognomeDefunto || !codiceReferral || !redirectUrl || !emailAziendaPartner) {
        return null;
    }
    return {
        nomeUtente: pickStr(r, 'nomeUtente', 'NomeUtente'),
        cognomeUtente: pickStr(r, 'cognomeUtente', 'CognomeUtente'),
        telefonoUtente: pickStr(r, 'telefonoUtente', 'TelefonoUtente'),
        indirizzoUtente: pickStr(r, 'indirizzoUtente', 'IndirizzoUtente'),
        cittaUtente: pickStr(r, 'cittaUtente', 'CittaUtente'),
        provinciaUtente: pickStr(r, 'provinciaUtente', 'ProvinciaUtente'),
        capUtente: pickStr(r, 'capUtente', 'CAPUtente', 'CapUtente'),
        codiceFiscaleUtente: pickStr(r, 'codiceFiscaleUtente', 'CodiceFiscaleUtente'),
        emailUtente: pickStr(r, 'emailUtente', 'EmailUtente'),
        nomeDefunto,
        cognomeDefunto,
        dataNascita: pickStr(r, 'dataNascita', 'DataNascita') ?? null,
        dataMorte: pickStr(r, 'dataMorte', 'DataMorte') ?? null,
        indirizzoConsegna: pickStr(r, 'indirizzoConsegna', 'IndirizzoConsegna'),
        codiceReferral,
        redirectUrl,
        emailAziendaPartner,
        info: pickStr(r, 'info', 'Info'),
    };
}

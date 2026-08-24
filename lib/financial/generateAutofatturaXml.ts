/**
 * Generatore XML FatturaPA v1.2 (FPR12) per Autofatture Estere TD17/TD18.
 * Allineato al modello commercialista FloreMoria / YouDoox (SoggettoEmittente CC).
 *
 * Assumption: CodiceDestinatario ufficiale = K0ROACV (non "KOROACV").
 */

import prisma from '@/lib/prisma';
import { FLOREMORIA_LEGAL_ENTITY } from '@/lib/financial/companyBankDetails';

export type AutofatturaDocType = 'TD17' | 'TD18';

export type ForeignVendorPreset = {
    id: string;
    label: string;
    denominazione: string;
    idPaese: string;
    idCodice: string;
    indirizzo: string;
    cap: string;
    comune: string;
    nazione: string;
    /** Descrizione default linea beni/servizi */
    defaultDescrizione: string;
    defaultDocType: AutofatturaDocType;
};

/** Preset fornitori SaaS / esteri noti (anagrafiche tipiche per autofattura). */
export const AUTOFATTURA_VENDOR_PRESETS: ForeignVendorPreset[] = [
    {
        id: 'openai',
        label: 'OpenAI Ireland Ltd',
        denominazione: 'OpenAI Ireland Limited',
        idPaese: 'IE',
        idCodice: '4143435AH',
        indirizzo: '1st Floor, The Liffey Trust Center 117',
        cap: '00000',
        comune: 'Dublin',
        nazione: 'IE',
        defaultDescrizione: 'SERVIZI',
        defaultDocType: 'TD17',
    },
    {
        id: 'vercel',
        label: 'Vercel Inc.',
        denominazione: 'Vercel Inc.',
        idPaese: 'US',
        idCodice: 'US981468807',
        indirizzo: '440 N Barranca Ave #4133',
        cap: '91723',
        comune: 'Covina',
        nazione: 'US',
        defaultDescrizione: 'SERVIZI HOSTING / EDGE',
        defaultDocType: 'TD17',
    },
    {
        id: 'google',
        label: 'Google Ireland Ltd',
        denominazione: 'Google Ireland Limited',
        idPaese: 'IE',
        idCodice: '6388047V',
        indirizzo: 'Gordon House, Barrow Street',
        cap: '00000',
        comune: 'Dublin',
        nazione: 'IE',
        defaultDescrizione: 'SERVIZI CLOUD',
        defaultDocType: 'TD17',
    },
    {
        id: 'stripe',
        label: 'Stripe Payments Europe',
        denominazione: 'Stripe Payments Europe Limited',
        idPaese: 'IE',
        idCodice: '3206488LH',
        indirizzo: '1 Grand Canal Street Lower, Grand Canal Dock',
        cap: '00000',
        comune: 'Dublin',
        nazione: 'IE',
        defaultDescrizione: 'SERVIZI PAGAMENTI',
        defaultDocType: 'TD17',
    },
    {
        id: 'meta',
        label: 'Meta Platforms',
        denominazione: 'Meta Platforms Ireland Limited',
        idPaese: 'IE',
        idCodice: '9692928F',
        indirizzo: 'Merrion Road',
        cap: '00000',
        comune: 'Dublin',
        nazione: 'IE',
        defaultDescrizione: 'SERVIZI PUBBLICITARI',
        defaultDocType: 'TD17',
    },
];

export type GenerateAutofatturaInput = {
    docType: AutofatturaDocType;
    /** Data autofattura (emissione) YYYY-MM-DD */
    autofatturaDate: string;
    /** Numero fattura PDF estera originale */
    foreignInvoiceNumber: string;
    /** Data fattura estera originale YYYY-MM-DD */
    foreignInvoiceDate: string;
    /** Imponibile in centesimi EUR (senza IVA) */
    imponibileCents: number;
    vendor: ForeignVendorPreset;
    /** Override descrizione linea (default da preset) */
    descrizioneLinea?: string;
    /** Numero documento già allocato (es. 000001-2026-EST) */
    documentNumber: string;
    /** ProgressivoInvio già allocato */
    progressivoInvio: string;
};

export type GeneratedAutofatturaXml = {
    xml: string;
    fileName: string;
    documentNumber: string;
    progressivoInvio: string;
    imponibileCents: number;
    vatCents: number;
    totaleCents: number;
    docType: AutofatturaDocType;
};

function escapeXml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function euro2(cents: number): string {
    return (Math.round(cents) / 100).toFixed(2);
}

function assertIsoDate(d: string, label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        throw new Error(`${label} non valida (atteso YYYY-MM-DD)`);
    }
}

/**
 * Alloca il prossimo Numero documento `00000N-YYYY-EST` e ProgressivoInvio.
 * Atomico su Neon: INSERT … ON CONFLICT + SELECT … FOR UPDATE nella stessa transazione.
 * Perché: due generate parallele non devono ottenere lo stesso progressivo TD17/TD18.
 */
export async function allocateAutofatturaEstSequence(year?: number): Promise<{
    documentNumber: string;
    progressivoInvio: string;
    seq: number;
}> {
    const y = year ?? new Date().getFullYear();
    const key = `finance.autofattura.est.seq.${y}`;

    const next = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
            INSERT INTO system_state (key, value, updated_at)
            VALUES (${key}, '0', NOW())
            ON CONFLICT (key) DO NOTHING
        `;
        const rows = await tx.$queryRaw<Array<{ value: string | null }>>`
            SELECT value FROM system_state WHERE key = ${key} FOR UPDATE
        `;
        const current = Math.max(0, parseInt(String(rows[0]?.value || '0'), 10) || 0);
        const seq = current + 1;
        await tx.systemState.update({
            where: { key },
            data: { value: String(seq) },
        });
        return seq;
    });

    const documentNumber = `${String(next).padStart(6, '0')}-${y}-EST`;
    // ProgressivoInvio FatturaPA: max 10 char alfanumerici
    const progressivoInvio = `A${String(next).padStart(5, '0')}${String(y).slice(-2)}`.slice(0, 10);
    return { documentNumber, progressivoInvio, seq: next };
}

export function getVendorPreset(id: string): ForeignVendorPreset | null {
    return AUTOFATTURA_VENDOR_PRESETS.find((p) => p.id === id) || null;
}

/**
 * Genera XML FatturaPA FPR12 per autofattura TD17/TD18 (SoggettoEmittente = CC).
 */
export function generateAutofatturaXml(input: GenerateAutofatturaInput): GeneratedAutofatturaXml {
    assertIsoDate(input.autofatturaDate, 'Data autofattura');
    assertIsoDate(input.foreignInvoiceDate, 'Data fattura estera');
    if (!input.foreignInvoiceNumber.trim()) {
        throw new Error('Numero fattura estera obbligatorio');
    }
    if (!Number.isFinite(input.imponibileCents) || input.imponibileCents <= 0) {
        throw new Error('Imponibile non valido');
    }

    const imponibileCents = Math.round(input.imponibileCents);
    const vatCents = Math.round((imponibileCents * 22) / 100);
    const totaleCents = imponibileCents + vatCents;

    const v = input.vendor;
    const descrizione = (input.descrizioneLinea || v.defaultDescrizione || 'SERVIZI').slice(0, 1000);
    const idCodiceCedente = v.idCodice.replace(/^US/i, '').replace(new RegExp(`^${v.idPaese}`, 'i'), '');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.agenziaentrate.gov.it/wps/wcm/connect/nsilib/documenti/eFatturaPA/FatturaPA_v1.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${escapeXml(FLOREMORIA_LEGAL_ENTITY.vatNumber)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${escapeXml(input.progressivoInvio)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${escapeXml(FLOREMORIA_LEGAL_ENTITY.sdiCode)}</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>${escapeXml(v.idPaese)}</IdPaese>
          <IdCodice>${escapeXml(idCodiceCedente)}</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>${escapeXml(v.denominazione)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>RF18</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${escapeXml(v.indirizzo)}</Indirizzo>
        <CAP>${escapeXml(v.cap)}</CAP>
        <Comune>${escapeXml(v.comune)}</Comune>
        <Nazione>${escapeXml(v.nazione)}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${escapeXml(FLOREMORIA_LEGAL_ENTITY.vatNumber)}</IdCodice>
        </IdFiscaleIVA>
        <CodiceFiscale>${escapeXml(FLOREMORIA_LEGAL_ENTITY.taxCode)}</CodiceFiscale>
        <Anagrafica>
          <Denominazione>FLOREMORIA SRL</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>VIA BELLINZONA 82/B</Indirizzo>
        <CAP>22100</CAP>
        <Comune>COMO</Comune>
        <Provincia>CO</Provincia>
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
    <SoggettoEmittente>CC</SoggettoEmittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${escapeXml(input.docType)}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${escapeXml(input.autofatturaDate)}</Data>
        <Numero>${escapeXml(input.documentNumber)}</Numero>
        <ImportoTotaleDocumento>${euro2(totaleCents)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
      <DatiFattureCollegate>
        <IdDocumento>${escapeXml(input.foreignInvoiceNumber.trim().slice(0, 20))}</IdDocumento>
        <Data>${escapeXml(input.foreignInvoiceDate)}</Data>
      </DatiFattureCollegate>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>${escapeXml(descrizione)}</Descrizione>
        <PrezzoUnitario>${euro2(imponibileCents)}</PrezzoUnitario>
        <PrezzoTotale>${euro2(imponibileCents)}</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>${euro2(imponibileCents)}</ImponibileImporto>
        <Imposta>${euro2(vatCents)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>
`;

    const safeVendor = v.denominazione.replace(/[^\w]+/g, '_').slice(0, 40);
    const fileName = `Autofattura_${input.docType}_${input.documentNumber}_${safeVendor}.xml`;

    return {
        xml: xml.trim() + '\n',
        fileName,
        documentNumber: input.documentNumber,
        progressivoInvio: input.progressivoInvio,
        imponibileCents,
        vatCents,
        totaleCents,
        docType: input.docType,
    };
}

/**
 * Agent CFO Alberto — System Prompt Master operativo.
 * Allineato a docs/architecture/ai_cfo_team_specification.md (Master Skill).
 * L'LLM non è fonte di verità normativa: obbligatorio Tier 1–3 + disclaimer professionista.
 */

export type AlbertoCfoCompanyMeta = {
    legalName?: string;
    vatNumber?: string;
    taxCode?: string;
    companyType?: string;
    innovationStatus?: string;
    fiscalYear?: string | number;
    reportingCurrency?: string;
    notes?: string;
    /** ISO date della verifica fonti / contesto (Europe/Rome consigliata). */
    asOfDate?: string;
};

export type AlbertoCfoRuntimeContext = {
    company: Required<
        Pick<
            AlbertoCfoCompanyMeta,
            | 'legalName'
            | 'vatNumber'
            | 'taxCode'
            | 'companyType'
            | 'innovationStatus'
            | 'fiscalYear'
            | 'reportingCurrency'
        >
    > &
        Pick<AlbertoCfoCompanyMeta, 'notes' | 'asOfDate'>;
    prompt: string;
};

/** Metadati aziendali default FloreMoria (sovrascrivibili via getAlbertoCfoContext). */
export const FLOREMORIA_CFO_DEFAULT_META: Required<
    Pick<
        AlbertoCfoCompanyMeta,
        | 'legalName'
        | 'vatNumber'
        | 'taxCode'
        | 'companyType'
        | 'innovationStatus'
        | 'fiscalYear'
        | 'reportingCurrency'
    >
> & { notes: string } = {
    legalName: 'FloreMoria S.r.l.',
    vatNumber: process.env.FLOREMORIA_VAT_NUMBER?.trim() || 'DA_COMPLETARE',
    taxCode: process.env.FLOREMORIA_TAX_CODE?.trim() || 'DA_COMPLETARE',
    companyType: 'S.r.l. — società di capitali italiana',
    innovationStatus:
        'Startup Innovativa (riferimenti: DL 179/2012 art. 25; L. 193/2024) — verificare permanenza in sezione speciale su Registro Imprese',
    fiscalYear: new Date().getFullYear(),
    reportingCurrency: 'EUR',
    notes:
        'Prodotto: omaggi floreali su tombe con foto di conferma. Contabilità operativa: IVA floreale 10%, accessori/servizi 22%, sync Stripe e prospetto trimestrale in /dashboard/finance.',
};

/**
 * System Prompt Master — Alberto AI CFO Innovation.
 * Usare come system message nelle chiamate LLM dedicate al CFO.
 */
export const ALBERTO_CFO_SYSTEM_PROMPT = `Sei ALBERTO, Senior CFO, Tax Advisor e Financial Controller di FloreMoria S.r.l. (Startup Innovativa italiana / tech).

## Identità e missione
- Non sei un chatbot generico: sei il CFO strategico interno. Trasformi numeri in decisioni, proteggi la cassa e massimizzi il valore aziendale nel rispetto della conformità fiscale.
- Non sostituisci il professionista abilitato (commercialista / consulente del lavoro / avvocato tributarista). Ogni valutazione rilevante include la clausola di salvaguardia.
- Il prodotto FloreMoria è presenza commemorativa testimoniata (fiori + foto): ogni scelta finanziaria deve rispettare dignità del brand (SOFIA/ALMA) senza dark pattern.

## Gerarchia delle fonti (verifica dinamica anti-allucinazione)
In caso di conflitto prevale il tier superiore. Cita sempre fonte nominata e data di aggiornamento della verifica.

### Tier 1 — Primarie
- Normattiva / Gazzetta Ufficiale (in particolare DL 179/2012 art. 25, L. 193/2024)
- Agenzia delle Entrate
- MIMIT
- Invitalia
- Registro Imprese
- Unione Europea (atti rilevanti)

### Tier 2 — Istituzionali operative
- Circolari, risoluzioni, provvedimenti e FAQ ufficiali AdE
- Guide e disposizioni ministeriali MIMIT / Invitalia

### Tier 3 — Professionali di supporto (mai sopra Tier 1–2)
- Eutekne, Euroconference, IPSOA, Il Sole 24 Ore, FiscoOggi
- Ordini professionali (solo come supporto)

Se non puoi verificare una norma o un numero: dichiaralo, classifica come stima/ipotesi e, se necessario, ESCALATE.

## 8 moduli professionali integrati
1. Tax Advisor — IVA 10% fiori / omaggi floreali; IVA 22% servizi/accessori; IRES; IRAP; F24; ritenute; deducibilità; fiscalità estera / reverse charge dove applicabile.
2. Accounting — Partita doppia; prima nota; scritture di assestamento (ratei/risconti, cespiti); cassa vs competenza; coerenza bilancio.
3. CFO — Cash flow; EBITDA; Burn rate; Runway; Working Capital; CAC/LTV; distinzione Conto Economico vs Stato Patrimoniale vs Cassa.
4. Startup Innovativa — Requisiti dimensionali/temporali L. 193/2024; permanenza sezione speciale; R&S; personale qualificato; brevetti/software; incentivi collegati allo status.
5. Equity & Fundraising — Cap table; pre/post-money; diluizione; SAFE; Work for Equity; ESOP; seed / Series A.
6. Finanza Agevolata — Smart&Start; crediti d'imposta R&S/Innovazione; de minimis; verifica disponibilità sportelli prima di raccomandare candidature.
7. Controlling — Budget vs Actual; scostamenti KPI (Revenue, margini, runway); marginalità per canale/prodotto; scenari ottimistici/pessimistici.
8. Risk & Compliance — Alert liquidità; anomalie contabili; scadenzario; rating rischio:
   🔴 CRITICO | 🟠 ALTO | 🟡 MEDIO | 🟢 BASSO

## Metodo operativo obbligatorio (6 step)
1. Understand — perimetro societario, periodo, domanda, dati disponibili/mancanti.
2. Verify — fonti Tier 1→2→3; nessun inventare.
3. Calculate — numeri espliciti (centesimi/EUR, aliquote, runway, diluizione).
4. Diagnose — cause, scostamenti, rischi.
5. Recommend — azioni prioritarie, trade-off, impatto su cassa e conformità.
6. Escalate — conferma professionista abilitato, dato mancante, o rischio 🔴/🟠 non chiudibile in autonomia.

## Regola fondamentale (Aureo-Normativa)
- DIVIETO ASSOLUTO di inventare norme, circolari, importi, scadenze o benefici.
- Distingui SEMPRE in modo esplicito:
  1) Norma vigente
  2) Interpretazione / Circolari AdE
  3) Prassi applicativa
  4) Valutazione / Stima interna
- Clausola di salvaguardia obbligatoria su output fiscali/normativi rilevanti:
  «Valutazione preliminare soggetta a conferma del professionista abilitato.»
- Obiettivo: massimizzazione del valore aziendale e protezione della cassa nel rispetto della conformità fiscale.

## Formato di risposta consigliato
- Sintesi esecutiva (3–6 righe)
- Analisi per modulo rilevante
- Calcoli (tabellari se utili)
- Classificazione rischio (emoji + livello)
- Raccomandazioni numerate
- Fonti (tier, nome, data verifica)
- Clausola di salvaguardia quando applicabile

## Limiti
- Non firmare dichiarazioni, F24, bilanci o istanze in nome della società.
- Non promettere ammissione a bandi o esiti fiscali certi.
- Non esporre secret, chiavi API o dati bancari completi nei log di conversazione.`;

/**
 * Costruisce il contesto runtime Alberto + prompt pronto all'iniezione LLM
 * (system prompt + blocco metadati aziendali FloreMoria).
 */
export function getAlbertoCfoContext(
    overrides?: AlbertoCfoCompanyMeta
): AlbertoCfoRuntimeContext {
    const asOfDate =
        overrides?.asOfDate?.trim() ||
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Rome',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date());

    const company = {
        legalName: overrides?.legalName?.trim() || FLOREMORIA_CFO_DEFAULT_META.legalName,
        vatNumber: overrides?.vatNumber?.trim() || FLOREMORIA_CFO_DEFAULT_META.vatNumber,
        taxCode: overrides?.taxCode?.trim() || FLOREMORIA_CFO_DEFAULT_META.taxCode,
        companyType: overrides?.companyType?.trim() || FLOREMORIA_CFO_DEFAULT_META.companyType,
        innovationStatus:
            overrides?.innovationStatus?.trim() || FLOREMORIA_CFO_DEFAULT_META.innovationStatus,
        fiscalYear: overrides?.fiscalYear ?? FLOREMORIA_CFO_DEFAULT_META.fiscalYear,
        reportingCurrency:
            overrides?.reportingCurrency?.trim() || FLOREMORIA_CFO_DEFAULT_META.reportingCurrency,
        notes: overrides?.notes?.trim() || FLOREMORIA_CFO_DEFAULT_META.notes,
        asOfDate,
    };

    const companyBlock = [
        '## Contesto aziendale FloreMoria (metadati iniettati)',
        `- Ragione sociale: ${company.legalName}`,
        `- P.IVA: ${company.vatNumber}`,
        `- Codice fiscale: ${company.taxCode}`,
        `- Forma: ${company.companyType}`,
        `- Status innovazione: ${company.innovationStatus}`,
        `- Anno fiscale di riferimento: ${company.fiscalYear}`,
        `- Valuta: ${company.reportingCurrency}`,
        `- As-of (Europe/Rome): ${company.asOfDate}`,
        company.notes ? `- Note operative: ${company.notes}` : null,
        '',
        'Usa questi metadati come contesto; se un campo è DA_COMPLETARE o dubbio, Verify + Escalate invece di inventare.',
    ]
        .filter((line) => line !== null)
        .join('\n');

    return {
        company,
        prompt: `${ALBERTO_CFO_SYSTEM_PROMPT}\n\n${companyBlock}`,
    };
}

export default {
    ALBERTO_CFO_SYSTEM_PROMPT,
    FLOREMORIA_CFO_DEFAULT_META,
    getAlbertoCfoContext,
};

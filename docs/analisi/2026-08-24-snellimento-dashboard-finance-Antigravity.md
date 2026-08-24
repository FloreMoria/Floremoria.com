# Relazione di Analisi e Proposta di Snellimento — Dashboard Contabilità (/dashboard/finance)

**Data**: 24 Agosto 2026  
**Autore**: Antigravity (Advanced Agentic Coding — Google DeepMind)  
**Modalità**: Sola Lettura (Nessuna modifica al codice sorgente dell'applicazione)  

---

## Executive Summary

La dashboard Contabilità di FloreMoria (`/dashboard/finance`) rappresenta l'hub centrale della gestione amministrativa e fiscale della società. Integra dati da molteplici fonti eterogenee (FinecoBank, Stripe, PayPal, SDI YouDoox XML/XLSX, Neon DB PostgreSQL) per garantire il tracciamento completo delle entrate e-commerce, delle uscite per i fioristi partner, delle spese SaaS estere in reverse charge e del calcolo dell'EBITDA e delle imposte stimate (IRES/IRAP).

L'analisi in sola lettura dell'attuale codice sorgente (`app/dashboard/finance/page.tsx` - 85 KB, `TaxQuarterlyPanel.tsx` - 31 KB, e 12 componenti correlati in `components/dashboard/`) ha evidenziato che la dashboard offre un'eccellente copertura contabile, ma presenta **significative ridondanze visive e duplicazioni di tabelle**, che allungano eccessivamente la pagina (oltre 1.300 righe di JSX) e creano frammentazione nell'esperienza utente.

Questa relazione mppa l'architettura attuale, individua le duplicazioni ed elabora una proposta di accorpamento in **5 Tab Tematici Unificati**, preservando al 100% la solidità dei dati reali e tutte le funzionalità operative.

---

## 1. Mappatura Completa della Dashboard Attuale

### 1.1 Header & Azioni Generali
- **Pulsanti d'azione (Top Bar)**:
  1. *Registra Spesa / Documento*: Apre la modale `ManualExpenseModal`.
  2. *Sincronizza*: Ricarica il ledger finanziario locale via `GET /api/dashboard/finance`.
  3. *Riconcilia Ordini Manuali*: Invia richiesta `POST /api/dashboard/finance` con azione `process_manual_orders`.
  4. *Esporta CSV*: Genera il file CSV della Prima Nota per il commercialista.
  5. *Esporta JSON*: Genera il dump JSON strutturato della Prima Nota.
  6. *Gestione Fornitori*: Link diretto alla pagina `/dashboard/fornitori`.
- **Fonte Dati**: Invocazioni API verso `/api/dashboard/finance` e generazione file client-side.

### 1.2 Top Row: 5 Card KPI Contabili
1. **Saldo FinecoBank**: Mostra il saldo contabile (con supporto a modifica manuale inline e timestamp di allineamento).  
   *Fonte Dati*: `SystemState` (Neon DB) / `manualBalanceCents` + `ledger.transactions`.
2. **Entrate Totali**: Somma dei movimenti bancari/gateway positivi.  
   *Fonte Dati*: `ledger.transactions` + Stripe/PayPal sync.
3. **Uscite Totali**: Somma dei movimenti negativi (fioristi, SaaS, imposte, spese).  
   *Fonte Dati*: `ledger.transactions`.
4. **Spese SaaS / Estere**: Totale spese software estere soggette a reverse charge (TD17/TD18). Cliccandoci si apre il drawer `SaasForeignExpensesPanel`.  
   *Fonte Dati*: Scritture `Software` in `ledger.accountingEntries` + `saasTotalEurCents`.
5. **Tasso Riconciliazione**: Percentuale di transazioni bancarie abbinate a fatture/ordini rispetto al totale.  
   *Fonte Dati*: Calcolato a runtime da `ledger.transactions`.

### 1.3 Sezione FinecoBank & Rendiconti (`BankStatementsPanel`)
- **Riquadro Coordinate Bancarie**: IBAN, SWIFT/BIC SEPA/SWIFT, dati societari FloreMoria S.r.l.
- **Componente `BankStatementsPanel`**:
  - Drag & Drop upload file (PDF, CSV, XLSX estratti conto Fineco).
  - Bottone "Incolla Movimenti da Home Banking" (Modale `pasteOpen` con parser testo e deduplicazione automatica).
  - Filtro per Anno (es. 2026, 2025, Tutti) e per Stato (`MATCHED`, `UNMATCHED`).
  - Tabella Rendiconti Caricati (`StatementDoc[]`).
  - Tabella Movimenti Estratti con esito abbinamento AI e Modale `openMatchModal` per suggerimenti automatici e match con ordini fioristi, fatture SDI o categorie.
- **Fonte Dati**: Endpoint `/api/dashboard/finance/bank-statements` (tabella PostgreSQL `BankStatementDocument` e `BankStatementLine`).

### 1.4 Box Sintetici Guida (3 Card Colorate)
- Card informative su "Entrate native" (Stripe/PayPal), "Uscite maturate" (fioristi), "Quadratura bancaria" (matching Fineco).

### 1.5 Sezione Importazione Documenti (Grid 3 Colonne)
1. `SdiInvoicesUploadBox`: Upload XML fatture SDI da fornitori italiani.
2. `ReceivedInvoicesXlsxUploadBox`: Upload report XLSX fatture passive SDI.
3. `ForeignAutofattureUploadBox`: Upload XML/XLSX autofatture estere TD17/TD18/TD19 per YouDoox/SDI.
- **Fonte Dati**: Endpoints `/api/dashboard/finance/invoices/upload`, `upload-xlsx`, `upload-foreign`.

### 1.6 Sistema a Schede (7 Tab Attuali)
1. **Tab `transactions` ("Movimenti bancari")**:  
   Componente `BankMovementsStatementTable`. Mostra la tabella dei movimenti Fineco reali e incollati manuali.  
   *Fonte Dati*: `/api/dashboard/finance/bank-statements?view=movements&year=2026`.
2. **Tab `accounting` ("Scritture di Prima Nota")**:  
   Componente `PrimaNotaTable`. Mostra la tabella delle scritture contabili in-memory (Dare/Avere, IVA, Lordo, Riferimento fattura).  
   *Fonte Dati*: `ledger.accountingEntries`.
3. **Tab `florist-invoices` ("Fatture in attesa dai fioristi")**:  
   Componente `FloristMissingInvoicesPanel`. Elenco fioristi con ordini evasi privi di fattura passiva abbinata, con precompilazione rapida in `ManualExpenseModal`.  
   *Fonte Dati*: `/api/dashboard/finance/florist-missing-invoices`.
4. **Tab `historical` ("Archivio Storico Fiscale")**:  
   Componente `HistoricalFiscalArchivePanel`. Registro contabile permanente in database Neon PG (`FinancialLedgerEntry`).  
   *Fonte Dati*: `/api/dashboard/finance/historical-ledger`.
5. **Tab `statements` ("Bilancio & Conto Economico")**:  
   Prospetto EBITDA, Ricavi da vendite, Costi fioristi, Commissioni Stripe, Software SaaS, Costi Marketing, Stato Patrimoniale (Attività/Passività) e Stima Imposte IRES (24%) e IRAP (3.9%).  
   *Fonte Dati*: Calcolato da `statements` tramite `/api/dashboard/finance`.
6. **Tab `gateways` ("Stato Stripe & PayPal")**:  
   - Card Saldi real-time Stripe e PayPal.
   - `PaypalCsvUploadBox`.
   - Pulsanti di sincronizzazione API dal 01/01/2026.
   - Componente `GatewaySyncTable` (transazioni unificate gateway con lordo/fee/netto e provenienza Stripe COM/EU / PayPal).
   - Tabella "Log Recenti Tentativi di Pagamento (Stripe)" (`gatewayData.stripe.transactions`).  
   *Fonte Dati*: `/api/dashboard/finance/gateways` e `/api/dashboard/finance/sync/*`.
7. **Tab `tax` ("Chiusura Trimestrale & Fisco")**:  
   Componente `TaxQuarterlyPanel`. Prospetto IVA trimestrale Q1-Q4, calcolo F24, credito/debito IVA e adempimenti.  
   *Fonte Dati*: API `/api/dashboard/finance/tax-quarterly`.

### 1.7 Widget Scadenziario & Adempimenti S.r.l.
- Tabella scadenze aziendali (IVA, F24, Esterometro, Bilancio, Startup Innovativa) con allerta imminente (10 giorni), filtri per categoria e modifica stato inline.
- **Fonte Dati**: `lib/financial/compliance/deadlines.ts` e `ledger.completedDeadlineIds` / `ledger.deadlineStatusById`.

### 1.8 Modali & Drawer Secondari
- `SaasForeignExpensesPanel`: Drawer laterale per le spese SaaS estere.
- `ManualExpenseModal`: Modale di inserimento spesa manuale / fattura.
- `PasteModal` (interno a `BankStatementsPanel`): Modale per incollare il testo grezzo dei movimenti bancari Fineco.
- `MatchModal` (interno a `BankStatementsPanel`): Modale di abbinamento guidato movimento <-> ordine/fattura/categoria.

---

## 2. Individuazione Ridondanze e Duplicazioni

L'ispezione analitica del flusso dati e del layout evidenzia **4 macro-duplicazioni** che appesantiscono la dashboard:

### 2.1 Duplicazione dei Movimenti Bancari (Fineco)
- **Problema**: I movimenti bancari Fineco compaiono in due punti separati della stessa pagina:
  1. Nel blocco superiore `BankStatementsPanel` (subito sotto le coordinate bancarie), che include la tabella dei movimenti con filtri per anno e pulsanti di abbinamento.
  2. Nel Tab 1 ("Movimenti bancari" -> `BankMovementsStatementTable`), che richiama esattamente il medesimo endpoint (`/api/dashboard/finance/bank-statements?view=movements`).
- **Impatto Visivo**: L'amministratore si trova di fronte a due tabelle quasi identiche per gli stessi movimenti bancari, creando confusione su quale tabella utilizzare per la riconciliazione.

### 2.2 Duplicazione della Prima Nota e del Registro Storico
- **Problema**: La contabilità mostra 3 viste distinte per i dati di Prima Nota:
  1. Tab 2 ("Scritture di Prima Nota" -> `PrimaNotaTable`): mostra le scritture in-memory dal ledger temporaneo.
  2. Tab 4 ("Archivio Storico Fiscale" -> `HistoricalFiscalArchivePanel`): mostra la tabella delle scritture permanenti salvate nel Neon DB (`FinancialLedgerEntry`).
  3. Tab 5 ("Bilancio & Conto Economico"): mostra un banner informativo che rinvia all'Archivio Storico Permanente per i filtri e l'export.
- **Impatto Visivo**: Tre tab distinti per consultare la medesima struttura contabile (scritture Dare/Avere e fatture).

### 2.3 Duplicazione dei Log Gateway (Stripe & PayPal)
- **Problema**: Nel Tab 6 ("Stato Stripe & PayPal"), la pagina renderizza:
  1. `GatewaySyncTable`: tabella completa e deduplicata di tutti i movimenti Stripe (COM + EU) e PayPal dal 01/01/2026.
  2. Subito sotto, un'ulteriore tabella denominata "Log Recenti Tentativi di Pagamento (Stripe)" (`gatewayData.stripe.transactions`), che ridoppia in formato grezzo le sessioni di pagamento Stripe.
- **Impatto Visivo**: Ridondanza di tabelle nella scheda dei gateway e prolungamento superfluo dello scroll.

### 2.4 Dispersione dei Riquadri di Upload Documenti
- **Problema**: I box di upload dei file (`SdiInvoicesUploadBox`, `ReceivedInvoicesXlsxUploadBox`, `ForeignAutofattureUploadBox`, `PaypalCsvUploadBox`, `BankStatementsPanel`) sono distribuiti in parti diverse della pagina: alcuni sopra le schede, altri dentro le schede, altri dentro i modali.
- **Impatto Visivo**: L'utente deve scorrere in alto e in basso per trovare dove caricare un determinato file (es. XML SDI vs XLSX vs Autofatture vs CSV PayPal).

---

## 3. Proposta Concreta di Snellimento & Accorpamento

Per snellire la dashboard mantenendo al 100% la ricchezza dei dati e tutti i controlli contabili, si propone una riorganizzazione in **5 Tab Tematici Unificati**, rimuovendo le tabelle duplicate ed eliminando lo scroll superfluo.

```
+-----------------------------------------------------------------------------------+
|  HEADER: Titolo + Azioni (Registra Spesa, Sincronizza, Riconcilia, Esporta)        |
+-----------------------------------------------------------------------------------+
|  5 KPI CARD CONTABILI (Saldo Fineco, Entrate, Uscite, Spese SaaS, Riconciliazione) |
+-----------------------------------------------------------------------------------+
|  SISTEMA A 5 TAB UNIFICATI:                                                      |
|  [1. Banca & Fineco] [2. Prima Nota & Storico] [3. Fatture & Spese]               |
|  [4. Gateway Stripe/PayPal] [5. Bilancio, Imposte & Scadenziario]                 |
+-----------------------------------------------------------------------------------+
```

### 3.1 Struttura dei 5 Tab Unificati

#### TAB 1: Movimenti & Estratto Conto Bancario (FinecoBank)
- **Cosa accorpa**:
  - Riquadro Coordinate Bancarie (IBAN / SWIFT).
  - Box Upload Rendiconto Fineco (Drag & Drop PDF/CSV + Bottone Incolla Movimenti da Home Banking).
  - **Tabella Unificata Movimenti Bancari**: Una sola tabella integrata (con filtro per Anno 2026/2025/Tutti, ricerca testuale, cambio categoria inline ed esito riconciliazione AI).
- **Cosa si elimina**: Si elimina la seconda tabella ridondante (`BankMovementsStatementTable` disgiunta).

#### TAB 2: Prima Nota & Registro Storico Fiscale
- **Cosa accorpa**:
  - Vista unificata delle scritture contabili Dare/Avere (integra la `PrimaNotaTable` temporanea e l'`HistoricalFiscalArchivePanel` permanente).
  - Filtri avanzati per esercizio fiscale, tipologia di scrittura (incasso, spesa, fiorista, autofattura).
  - Pulsanti di esportazione ufficiali per il commercialista (**Esporta CSV** ed **Esporta JSON**).
- **Cosa si elimina**: Si elimina la separazione artificiale tra "Scritture di Prima Nota" e "Archivio Storico Fiscale".

#### TAB 3: Fatture, Spese & Autofatture (SDI / Fioristi / SaaS)
- **Cosa accorpa**:
  - Grid compatto a 3 colonne con i box di upload:
    1. XML Fatture Passive SDI (`SdiInvoicesUploadBox`).
    2. Report XLSX SDI (`ReceivedInvoicesXlsxUploadBox`).
    3. Autofatture Estere TD17/TD18/TD19 (`ForeignAutofattureUploadBox`).
  - Tabella delle **Fatture in attesa dai fioristi** (`FloristMissingInvoicesPanel`) per l'abbinamento rapido con un clic.
  - Pulsante per aprire il drawer **Spese SaaS / Estere** (`SaasForeignExpensesPanel`).

#### TAB 4: Gateway di Pagamento (Stripe & PayPal)
- **Cosa accorpa**:
  - Card Saldi Real-Time Stripe (COM + EU) e PayPal.
  - Pulsanti di Sincronizzazione API automatici dal 01/01/2026.
  - Box Upload CSV PayPal (`PaypalCsvUploadBox`) per lo storico pregresso.
  - Tabella Unificata Gateway (`GatewaySyncTable`) con dettaglio Lordo / Fee / Netto e badge provenienza.
- **Cosa si elimina**: Si elimina la tabella duplicata dei "Log Recenti Tentativi di Pagamento (Stripe)", in quanto le medesime informazioni sono già presenti e meglio strutturate in `GatewaySyncTable`.

#### TAB 5: Bilancio, Imposte & Scadenziario S.r.l.
- **Cosa accorpa**:
  - **Conto Economico Gestionale** (EBITDA, Ricavi Vendite, Costi Fioristi/SaaS/Marketing).
  - **Stato Patrimoniale** (Attività, Passività, Capitale Sociale).
  - **Stima Accantonamenti Fiscali** (IRES 24%, IRAP 3.9%, Utile Netto) con Export per FidoCommercialista.
  - **Chiusura Trimestrale IVA & Fisco** (`TaxQuarterlyPanel` per Q1, Q2, Q3, Q4 ed F24).
  - **Widget Scadenziario & Adempimenti S.r.l.** (Startup Innovativa, IVA, Bilancio).

---

## 4. Matrice di Comparazione: Prima vs Dopo

| Elemento Dashboard | Stato Attuale | Proposta Snellita | Beneficio |
| :--- | :--- | :--- | :--- |
| **Tabella Movimenti Fineco** | Presente sia sopra i tab che dentro il Tab 1 | Unificata nel **Tab 1 (Banca & Fineco)** | Riconciliazione in un unico punto, zero confusione |
| **Prima Nota & Registro Neon** | Divisi in Tab 2 (Prima Nota) e Tab 4 (Storico) | Unificati nel **Tab 2 (Prima Nota & Storico)** | Consultazione contabile fluida e bilanciata |
| **Upload Documenti SDI & TD17** | Sparsi nella pagina principale e nei tab | Raggruppati nel **Tab 3 (Fatture & Spese)** | Hub unico per il caricamento di tutte le fatture passive |
| **Log Tentativi Stripe** | Tabella isolata ridondante nel Tab 6 | Integrato in **`GatewaySyncTable`** | Eliminazione di 100+ righe di scroll inutile |
| **Scadenziario S.r.l.** | Posizionato in fondo dopo uno scroll lunghissimo | Integrato nel **Tab 5 (Bilancio & Scadenziario)** | Visibilità immediata insieme alla chiusura trimestrale IVA |
| **Numero di Tab** | 7 Tab sparsi | **5 Tab tematici ordinati** | Navigazione rapida, pulita e moderna |

---

## 5. Conclusioni e Prossimi Passi

Questa proposta di snellimento **conserva il 100% della logica contabile e dei dati reali**, eliminando esclusivamente la ridondanza visiva e il sovraccarico di componenti. 

Dopo la tua approvazione, potremo procedere con l'implementazione del refactoring in modo sicuro e senza alcuna regressione sui dati o sugli endpoint API.

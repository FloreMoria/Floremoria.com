# Inventario dashboard Contabilità e Finanza

**Data:** 2026-09-22  
**Ambito:** sola lettura — nessuna modifica UI/codice in questo intervento  
**Pagina:** `/dashboard/finance` («Gestione Finanziaria e Prima Nota AI»)  
**Fonte mapping:** `app/dashboard/finance/page.tsx`, pannelli in `components/dashboard/*`, API sotto `app/api/dashboard/finance/*`

---

## Legenda colonne

| Colonna | Significato |
|--------|-------------|
| **ID** | Identificativo inventario (non è un ID prodotto) |
| **Nome / percorso** | Etichetta UI + dove si trova |
| **Cosa mostra** | Frase in italiano per non programmatori |
| **Fonte dati** | Tabella/funzione di dominio |
| **API / funzione** | Endpoint o builder che alimenta la UI |
| **R/W** | Sola lettura o con azioni |
| **Cat.** | A fiscale · B gestionale · C controllo · D altro |
| **Mantenimento** | Dipendenza da fonti instabili / stato noto |

---

## 1 — Elenco sezioni

| ID | Nome visualizzato e percorso | Cosa mostra | Fonte dati | API / funzione | R/W | Cat. | Mantenimento |
|----|------------------------------|-------------|------------|----------------|-----|------|--------------|
| H01 | **Scarica Dossier Fiscale (.xlsx)** — header, sempre visibile | Scarica un Excel multi-foglio con i numeri del periodo per archivio/commercialista (uso interno completo) | Dossier fiscale aggregato (corrispettivi, acquisti, banca, gateway, controlli) | `GET /api/dashboard/finance/tax-quarterly?format=xlsx` (anche da TaxQuarterlyPanel) | Azione (download) | A | Dipende da completezza upload banca + sync gateway + passivo; se fonti incomplete il file esce comunque ma con buchi |
| H02 | **Registra Spesa / Documento** — header | Apre il modulo per registrare una spesa/fattura con allegato | Spese manuali → ledger / Prima Nota | `ManualExpenseModal` → `POST` spese manuali (`/api/dashboard/finance/manual-expenses` e correlati) | Azione (scrittura) | A | Stabile se usato; non dipende dal sync gateway |
| H03 | **Sincronizza** — header | Rilancia sync gateway (Stripe/PayPal) e ricarica contabilità | Sync gateway + ledger | `POST /api/dashboard/finance/sync/stripe`, `…/sync/paypal` + `GET /api/dashboard/finance` | Azione | B | **Fonte in lavorazione / instabile:** timeout, range incrementale, PayPal a chunk; può lasciare dati incompleti |
| H04 | **Gestione Fornitori** — header (link) | Porta all’anagrafica fornitori/partner fuori da questa pagina | Anagrafica fornitori | Link `/dashboard/fornitori` | Navigazione | D | Domanda: «dove aggiorno i dati fiscali dei fornitori?» — fuori dashboard Contabilità |
| G01 | **Controlli dossier C1–C15** — cima pagina (`DossierControlsBadge`) | Semaforo dell’ultima esecuzione dei controlli di quadratura (pass / fail / non verificabile) con valori misurati | Snapshot controlli fiscali (banca, PN, corrispettivi, gateway, fee, IVA/Erario) | `GET` stato controlli + riesecuzione via API dossier controls (`lib/financial/dossierFiscalControls.ts` C1–C15) | Lettura + azione «riesegui» | C | C13/C14/C15 legati a sync gateway, fattura fee partner, Erario; se fonti incomplete → fail o «non verificabile» |
| G02 | **Lista di lavoro · fatture fiorista** — cima (`FloristInvoiceWorkListPanel`) | Elenco fioristi/ordini per cui manca ancora la fattura dopo il pagamento | Ordini pagati senza documento fiorista | `GET /api/dashboard/finance/florist-invoice-work-list` | Lettura (+ aggiorna) | B | Affidabile sui pagamenti; incompleto se stati ordine/doc non aggiornati |
| G03 | **Fineco e IBAN · Dati societari** — riquadro sotto i controlli | Ragione sociale, sede, P.IVA, REA, capitale, Codice SDI, IBAN/BIC Fineco (copia) | Costanti aziendali | `FLOREMORIA_LEGAL_ENTITY`, `FLOREMORIA_FINECO_BANK` (no API live) | Lettura + copia | D | Domanda: «quali sono i dati ufficiali e l’IBAN da dare a qualcuno?» — statico, non «rompe» |
| G04 | **Saldo Fineco** — stesso riquadro | Saldo reale del conto che inserisci a mano (allineato a una data) | `SystemState` saldo Fineco | `GET/POST /api/dashboard/finance` + `POST /api/dashboard/finance/fineco-balance` | Lettura + modifica | B | **Manuale:** se non aggiornato, la fascia di quadratura mente |
| Q01 | **Differenza Saldo Banca** — fascia KPI | Quanto scarta il saldo reale Fineco dal saldo «di libro» calcolato dagli estratti | Estratti bancari + saldo manuale | `financeQuadratura` via `GET /api/dashboard/finance` (`quadratura.balanceDiffCents`) | Sola lettura (click apre edit saldo) | C | Dipende da upload estratti **e** saldo manuale aggiornato |
| Q02 | **Movimenti non abbinati** — fascia KPI | Quante righe di estratto non sono ancora abbinate | Righe `BankStatementLine` UNMATCHED | `quadratura.unmatchedTotal` (`financeQuadratura`) | Sola lettura | C | Stabile se estratti caricati; sale se riconciliazione arretrata |
| Q03 | **Documenti mancanti** — fascia KPI | Quanti documenti fiorista attesi risultano ancora in attesa | Contatore attese fiorista in quadratura | `quadratura.missingDocuments` | Sola lettura | C | Può **divergere** dalla lista lavoro e dal registro passivo (fonti/conteggi diversi) |
| Q04 | **Partite da classificare (17900)** — fascia KPI | Importo sul conto «partite da classificare» + eventuale quarantena documenti | Ledger / cuenta 17900 + documenti in quarantena | `quadratura.daClassificareCents` (+ `quarantineDocumentCount`) | Sola lettura | C | **Instabile** se attribuzione bonifici/payout incompleta |
| T01 | **Banca Fineco — Upload / archivio estratti** — tab Banca (`BankStatementsPanel` variant `tab1`) | Carica PDF/CSV/XLSX o paste; elenco estratti archiviati | Documenti e linee estratto Fineco | `/api/dashboard/finance/bank-statements` (+ upload/paste/delete) | Azioni (upload, delete, re-riconcilia) | A | Stabile come contenitore; qualità dipende dal parser |
| T02 | **Movimenti estratto conto** — tab Banca | Tabella di tutte le righe movimento (data, causale, importo, match) con ricerca | Linee estratto | `GET …/bank-statements?view=movements` (`BankMovementsStatementTable`) | Lettura + azioni match su riga | B | Completo solo per periodi caricati |
| T03 | **Da riconciliare** — tab omonimo (`ManualReconciliationPanel`) | Coda unica delle scoperte: suggerimenti, conferma abbinamento, categorie, annulla | Linee UNMATCHED + candidati (ordini, spese, categorie) | `…/reconciliation/pending`, suggestions, PATCH linee, manual-expenses | Azioni (riconciliazione) | B | **Cuore operativo in lavorazione:** attribuzione bonifici; se sbagli qui, KPI e C1/C2 ne risentono |
| T04 | **Prima Nota** — tab (`PrimaNotaTable`) + Esporta JSON | Libro scritture (entrate/uscite, conti, riferimenti) | Registro storico / historical ledger (+ entries locali) | `GET /api/dashboard/finance/historical-ledger` (+ export) | Lettura + export; eventuali correzioni via API ledger | A | Dipende da cosa è stato riconciliato/sincronizzato; può sembrare «vuoto» se fonti non scritte |
| T05 | **Upload fatture SDI / YouDOX (XML)** — tab Passivo | Importa fatture elettroniche ricevute | Fatture passive / spese da XML | Upload box → API import SDI/YouDOX | Azione | A | Dipende da sync/upload YouDOX (noto come area fragile se canale esterno non gira) |
| T06 | **Upload report XLSX ricevute** — tab Passivo | Importa elenchi fatture da foglio Excel | Stesso passivo tabellare | `ReceivedInvoicesXlsxUploadBox` | Azione | A | Stabile se file corretto |
| T07 | **Upload autofatture estere / reverse charge** — tab Passivo | Carica/gestisce documenti esteri e autofatture | Autofatture estere | `ForeignAutofattureUploadBox` / API autofatture | Azione | A | Stabile come contenitore; adempimento manuale |
| T08 | **Gestione SaaS / Spese estere** — tab Passivo (drawer + totale in badge) | Archivio fatture SaaS estere (Cursor, Vercel, ecc.) con totali e ZIP | Tabella fatture SaaS | `/api/dashboard/finance/saas-invoices` (+ upload/download) | Azioni | A | Stabile; totale anche in CE come costi SaaS |
| T09 | **Registro fatture / ricevute fioristi** — tab Passivo (`FloristMissingInvoicesPanel`) | Per ogni ordine con compenso: stato documento, allegato, match, bonifico Fineco; export Excel | Ordini + documenti fiorista + eventuale abbinamento banca | `/api/dashboard/finance/florist-missing-invoices` | Azioni (stato, match, export, associa) | A | Sovrapposto a G02/Q03 ma con dettaglio più ampio; rischio doppio conteggio concettuale |
| W01 | **Stripe Real-time Balance** — tab Gateway | Soldi Stripe disponibili e in attesa di payout (live) | API Stripe balance | `GET /api/dashboard/finance/gateways` | Sola lettura | B | Live gateway; può non coincidere con quadratura DB |
| W02 | **PayPal Balance** — tab Gateway | Saldo PayPal disponibile/pending (se configurato) | API PayPal | stesso `…/gateways` | Sola lettura | B | PayPal = conto di pagamento (non ciclo vendite); sync spesso incompleto |
| W03 | **Upload CSV PayPal** — tab Gateway | Importa export CSV quando l’API non basta | Movimenti PayPal da CSV | `PaypalCsvUploadBox` → sync/upload CSV | Azione | A | Workaround per buchi sync |
| W04 | **Sincronizzazione API Gateway** — tab Gateway | Pulsanti sync Stripe COM+EU / PayPal (incrementale e YTD) + ultimo sync e n° record | Persistenza sync + meta | `POST/GET …/sync/stripe`, `…/sync/paypal` | Azioni | B | **Fonte instabile / in lavorazione** (timeout, YTD lungo) |
| W05 | **Stripe Connect – partner** — tab Gateway (`ConnectPartnerChannelPanel`) | Quarto canale: movimenti Connect partner e registrazione manuale incassi | Canale Connect / partner fee | `/api/dashboard/finance/connect-partner` | Lettura + registrazione manuale | B | **In lavorazione:** lettura API Connect incompleta; spesso inserimento manuale |
| W06 | **Tabella sync gateway unificata** — tab Gateway (`GatewaySyncTable`) | Elenco movimenti Stripe COM/EU, PayPal, Connect (incasso/fee/payout) con match banca | Store sync gateway + Connect | `GET …/sync/gateways` + connect-partner | Lettura (+ filtri) | B | **Vista operativa ≠ registro fiscale**; filtri non cambiano i totali commercialista; rischio confusione con corrispettivi |
| W07 | **Quadratura Stripe (commissioni + payout)** — dentro GatewaySyncTable | Card che confronta movimenti sync Stripe vs aspettative di quadratura wallet | Gateway sync rows + regole `gatewayQuadratura` | Calcolo client/server da sync gateways | Sola lettura | C | **Fonte diversa da C13 e da saldo Fineco**; se diverge, non è chiaro quale sia «giusto» |
| W08 | **Quadratura PayPal (fee, payout, SaaS, carta)** — dentro GatewaySyncTable | Stessa idea per PayPal | Sync PayPal + regole quadratura | come sopra | Sola lettura | C | PayPal fuori ciclo vendite; facilmente incompleta |
| W09 | **Log grezzi checkout Stripe** — tab Gateway (details) | Sessioni/pagamenti checkout recenti (esito, cliente, importo) | Log/sessioni checkout Stripe | `GET …/gateways` (`stripe.transactions`) | Lettura | D | Domanda: «questo pagamento checkout è andato a buon fine?» — debug, non documento fiscale |
| F01 | **Scadenziario & Adempimenti S.r.l.** — tab Fisco | Elenco scadenze IVA, esterometro, bilancio, obblighi startup con filtri | Calendario compliance statico/codificato | `getUpcomingDeadlines()` (client) | Lettura | A | Non legge DB contabile; non «rompe» ma non verifica se l’adempimento è stato fatto |
| F02 | **C11 — Pagamenti ↔ ordini da collegare** — tab Fisco (`PaymentOrderWorkListPanel`) | Lista di lavoro: pagamenti senza ordine / da collegare a mano | Gateway vs ordini | `/api/dashboard/finance/payment-order-work-list` | Azioni (collegamento) | B | Correlato a controllo C11 ma **non è il semaforo**; può restare piena se sync incompleto |
| F03 | **Chiusura trimestrale / azioni Registro & Dossier** — tab Fisco (`TaxQuarterlyPanel` header) | Selettore periodo + download Registro Corrispettivi commercialista, Dossier interno, ZIP ricevute, sync Stripe fee | Tax register / dossier builders | `…/commercialista-corrispettivi`, `…/tax-quarterly`, `…/download-receipts-zip`, `…/stripe-sync` | Azioni | A | Registro commercialista dipende da filtro vendite (F1+F2); dossier interno più ampio |
| F04 | **Registro economico & corrispettivi** — tab Fisco (tabella) | Per ogni ordine del periodo: imponibili, IVA, fee, fiorista, liquidazione, **margine**; modifica riga | Tax register (ordini filtrati periodo) | `GET /api/dashboard/finance/tax-register` (+ PATCH) | Lettura + modifica riga | A | Fonte fiscale ufficiale UI; **non** è la tabella sync gateway |
| F05 | **Fatture commissioni Stripe / fee PayPal** — tab Fisco | Elenco fatture fee Stripe del periodo (importo, IVA RC, PDF) | Fatture Stripe syncate | tax-quarterly / stripe invoices (+ PDF route) | Lettura + download PDF | A | Vuoto finché non fai Sync Stripe fee |
| F06 | **Fatture Mensili PayPal (commissioni)** — tab Fisco | Aggregato commissioni PayPal per periodo | Aggregati fee PayPal | payload tax-quarterly / tax-register correlato | Sola lettura | A | Dipende da sync/CSV PayPal |
| F07 | **Fatture fee master partner (C14)** — tab Fisco (`PartnerFeeInvoicesPanel`) | Registra fattura mensile master e mostra maturato / fattura / Connect / esito C14 | Partner fee month close | `/api/dashboard/finance/partner-fee-invoices` | Azioni | A | C14 «non verificabile» senza fattura; Connect deve essere allineato |
| F08 | **Conto Economico Gestionale (EBITDA)** — tab Fisco | Ricavi, costi fioristi/Stripe/SaaS/marketing, EBITDA | Statements gestionali (spesso da historical ledger) | `calculateFinancialStatements()` via `GET /api/dashboard/finance` (`statements.contoEconomico`) | Sola lettura | B | **Fonte diversa dal tax-register**; sottovoce «Ordini Manuali & B2B» usa anche somma ledger `stats.income` |
| F09 | **Stato Patrimoniale Gestionale** — tab Fisco | Cassa Fineco, crediti clienti, debiti fornitori/tributari, patrimonio, capitale | Statements SP | stesso `statements.statoPatrimoniale` | Sola lettura | B | **Cassa può divergere** dal Saldo Fineco manuale / quadratura |
| F10 | **Stima Accantonamenti Fiscali (IRES & IRAP)** — tab Fisco | Stima IRES, IRAP, utile netto + export JSON «FidoCommercialista» | Derivato dagli statements | stesso `statements.stimaImposte` | Lettura + export JSON | B | Stima gestionale, non dichiarazione ufficiale |
| F11 | **Archivio Storico Fiscale** — tab Fisco (details) | Consultazione/scritture del registro storico permanente (Neon) | Historical ledger immutabile | `/api/dashboard/finance/historical-ledger` | Lettura (+ eventuali POST pannello) | A | Base CE se `source=historical_ledger`; incompleto se periodi non consolidati |

**Totale sezioni inventariate: 42**

---

## 2 — Doppioni (stesso dato / stesso totale)

### Gruppi (anche stessa fonte)

| Gruppo | Sezioni coinvolte | Numero / concetto in comune | Stessa fonte? |
|--------|-------------------|----------------------------|---------------|
| **D1 — Scoperte da abbinare** | Q02 Movimenti non abbinati · badge tab «Da riconciliare» · shortcut Banca→riconcilia · T03 coda Da riconciliare | Conteggio righe UNMATCHED | **Sì in intenzione** (`quadratura` / `reconciliation/pending`); verificare allineamento badge vs KPI se periodi filtrati diversi |
| **D2 — Fatture fiorista mancanti** | Q03 Documenti mancanti · G02 Lista lavoro fiorista · T09 Registro fatture fioristi (contatore «in attesa») | «Quanti documenti fiorista mancano» | **Fonti diverse** (vedi Critici) |
| **D3 — Dossier Excel** | H01 Scarica Dossier header · F03 download Dossier in TaxQuarterlyPanel | Stesso tipo di export dossier periodo | **Sì** (stessa famiglia API tax-quarterly xlsx) |
| **D4 — Fee gateway documentate** | F05 Fatture Stripe · F06 Fee PayPal · voce CE «Commissioni Stripe» · W07 quadratura fee Stripe | Totale commissioni periodo | **Miste** (fatture sync vs CE statements vs quadratura sync) |
| **D5 — Controlli vs liste di lavoro** | G01 C11 (semaforo) · F02 lista C11 · G01 C14 · F07 pannello fee partner | Coerenza perimetro pagamenti / fee partner | Semaforo vs lista: **stesso tema, UI diverse**; C14 e F07 collegati ma F07 scrive la fattura che C14 legge |
| **D6 — Libro scritture** | T04 Prima Nota · F11 Archivio Storico · alimentazione F08/F09 se historical | Righe ledger / totali CE | **Stessa famiglia** historical-ledger, viste diverse |
| **D7 — Saldo cassa Fineco** | G04 Saldo Fineco · Q01 «Reale» in Differenza · F09 Disponibilità liquide | Saldo banca | **Fonti diverse** (vedi Critici) |
| **D8 — Ricavi / corrispettivi** | F04 Registro economico · export commercialista F03 · F08 Ricavi CE · sottovoce CE vs `stats.income` ledger | Totale vendite / corrispettivi periodo | **Fonti diverse** (vedi Critici) |
| **D9 — Transito Stripe** | G01 C10/C13 · W06 tabella sync · W07 Quadratura Stripe · W01 balance live | Saldo/cicli transito Stripe | **Fonti diverse** (controllo fiscale vs sync DB vs API live) |

### Critici — stesso numero (o stesso concetto numerico) da fonti diverse

Questi sono i casi in cui, se i valori divergono, **una delle due letture è sbagliata o fuori perimetro e oggi non c’è un arbitro unico in UI**.

| Critico | Sezioni | Concetto | Fonti a confronto | Nota |
|---------|---------|----------|-------------------|------|
| **X1** | F04 Registro corrispettivi ↔ F08 Ricavi CE ↔ (sottovoce) ledger `stats.income` | Totale ricavi / vendite | `tax-register` / commercialista filter ↔ `calculateFinancialStatements()` ↔ somma `ledger.transactions` | Già emerso in sessione: vista gateway ≠ fiscalità; CE gestionale ≠ registro commercialista |
| **X2** | G04 Saldo Fineco ↔ Q01 saldo calcolato ↔ F09 cassa SP | Saldo banca | Manuale SystemState ↔ somma estratti/quadratura ↔ statements SP | Tre «casse» possibili |
| **X3** | Q03 Documenti mancanti ↔ G02 lista lavoro ↔ T09 registro fioristi | Conteggi documenti/compensi in attesa | `financeQuadratura.missingDocuments` ↔ `florist-invoice-work-list` ↔ `florist-missing-invoices` | Tre API; numeri possono non coincidere |
| **X4** | W01 Stripe live balance ↔ W07 Quadratura Stripe ↔ G01 C13 | Soldi ancora in Stripe / transito | API live ↔ sync DB + regole ↔ controllo C13 su saldo dichiarato | Live ≠ libro ≠ controllo dossier |
| **X5** | F05/F06 fee documentate ↔ F08 costi Stripe CE ↔ colonne fee in F04 | Commissioni gateway | Fatture Stripe/PayPal ↔ statements ↔ tax-register per ordine | Stesso «costo fee» aggregato in modi diversi |
| **X6** | W06 tabella sync (totali filtrati) ↔ F04/F03 corrispettivi fiscali | «Quanto abbiamo incassato» | Gateway sync rows ↔ registro corrispettivi (F1+F2) | **Non sono lo stesso perimetro**; rischio interpretativo alto |

---

## 3 — Classificazione per scopo (una sola categoria)

| Cat. | Significato | ID sezioni | N° |
|------|-------------|-----------|----|
| **A** | Adempimento fiscale | H01, H02, T01, T04, T05, T06, T07, T08, T09, W03, F01, F03, F04, F05, F06, F07, F11 | **17** |
| **B** | Decisione gestionale | H03, G02, G04, T02, T03, W01, W02, W04, W05, W06, F02, F08, F09, F10 | **14** |
| **C** | Controllo / allarme | G01, Q01, Q02, Q03, Q04, W07, W08 | **7** |
| **D** | Nessuna delle tre | H04, G03, W09 | **3** |

### Dettaglio categoria D (domanda a cui risponde)

| ID | Domanda |
|----|---------|
| H04 | «Dove gestisco l’anagrafica fornitori?» (navigazione fuori pagina) |
| G03 | «Quali sono ragione sociale, P.IVA, SDI e IBAN ufficiali da copiare?» |
| W09 | «Questa sessione di checkout Stripe è andata a buon fine o è fallita?» (debug operativo, non produce documento né decisione di chiusura) |

---

## 4 — Sintesi costo di mantenimento (fonti instabili)

| Area | Sezioni più esposte | Stato |
|------|---------------------|--------|
| Attribuzione bonifici / Da riconciliare | T03, Q01–Q04, G01 C1–C2, T04 | Operativa ma **lavorazione continua**; backlog scoperte = KPI rossi |
| Riconciliazione ricavi / corrispettivi vs gateway | F04, F03, W06, X1, X6 | **Rischio interpretativo alto**; gateway non è il fiscale |
| Sync gateway Stripe/PayPal/Connect | H03, W04, W05, W01–W02, W07–W08, G01 C10/C13 | **Instabile / incompleto** (timeout, YTD, Connect spesso manuale) |
| YouDOX / passivo esterno | T05 | Dipende da canale esterno |
| Saldo Fineco manuale | G04, Q01, F09 | **Rotto concettualmente se non aggiornato** (non è un bug UI, è dato stale) |
| CE/SP/IRES gestionali | F08–F10 | Completi solo quanto lo è lo historical ledger; **non** sostituto del commercialista |

---

## 5 — Conteggio consegna

| Metrica | Valore |
|---------|--------|
| Sezioni totali | **42** |
| Categoria A | **17** |
| Categoria B | **14** |
| Categoria C | **7** |
| Categoria D | **3** |
| Gruppi doppioni | **9** (D1–D9) |
| Critici cross-fonte | **6** (X1–X6) |

---

*Inventario descrittivo. Nessuna sezione è stata nascosta, disabilitata o rimossa dalla dashboard.*

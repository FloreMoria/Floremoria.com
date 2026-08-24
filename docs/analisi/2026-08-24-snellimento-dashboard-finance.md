# Analisi snellimento dashboard Contabilità (`/dashboard/finance`)

**Data:** 24 agosto 2026  
**Autore:** Cursor (sola lettura — nessun file applicativo modificato)  
**Percorso analizzato:** `app/dashboard/finance/page.tsx` (~1337 righe JSX), `TaxQuarterlyPanel.tsx`, 12+ componenti in `components/dashboard/`, API in `app/api/dashboard/finance/`  
**Obiettivo:** ridurre ridondanze visive/funzionali **senza** indebolire tracciabilità, dedup, match bancario e controlli fiscali.

---

## Executive summary

La pagina è un hub fiscale completo (Fineco + Stripe + PayPal + SDI/YouDoox + registro Neon + scadenziario S.r.l.), ma **la home è troppo lunga**: KPI, coordinate IBAN, upload estratto **con tabella movimenti già dentro**, tre box upload fatture, **7 tab**, poi **scadenziario sempre visibile in fondo**.

Il problema principale non è la mancanza di dati: è che **lo stesso fatto economico compare in 2–4 superfici** (estratto Fineco vs tab Movimenti; JSON ledger locale vs `FinancialLedgerEntry` Neon; CE gestionale vs Archivio storico vs Chiusura trimestrale; tre viste gateway).

**Principio proposto:** una sola “fonte di verità visiva” per tipo di fatto (banca, prima nota, passivo SDI, gateway, fisco), con ingest e riconciliazione **vicini alla tabella che si usa**, non duplicati sopra e sotto.

---

## 1. Mappatura completa della dashboard attuale

Ordine di rendering in `page.tsx` (scroll top → bottom).

### 1.1 Header e barra azioni (sempre visibile)

| Elemento | Ruolo | Dati / effetto |
|---|---|---|
| Titolo «Gestione Finanziaria e Prima Nota AI» | Branding | Statico |
| Sottotitolo | Spiega Stripe/PayPal + Fineco | Statico |
| **Registra Spesa / Documento** | Apre `ManualExpenseModal` | POST ` /api/dashboard/finance/manual-expenses` → spesa manuale + file |
| **Sincronizza** | Ricarica ledger | GET `/api/dashboard/finance` |
| **Riconcilia Ordini Manuali** | Job riconciliazione | POST `/api/dashboard/finance` `process_manual_orders` → `lib/financial/reconciler` + ledger JSON |
| **Esporta CSV / JSON** | Export Prima Nota | **Client-side** da `ledger.accountingEntries` (file `financial_ledger.json`, **non** Neon) |
| Link **Gestione Fornitori** | Navigazione | `/dashboard/fornitori` |

### 1.2 Cinque KPI card (sempre visibili)

Calcolate in `stats` useMemo da `ledger.transactions` (JSON) + override saldo Fineco + max(SaaS da scritture JSON, totale SaaS da API).

| KPI | Cosa mostra | Fonte reale |
|---|---|---|
| **Saldo FinecoBank** (editabile) | Saldo cassa operativo | Preferenza: PUT `/api/dashboard/finance/fineco-balance` → `SystemState`. Fallback: somma `ledger.transactions` (JSON) |
| **Entrate Totali** | Somma transazioni > 0 | `financial_ledger.json` via GET finance |
| **Uscite Totali** | Somma transazioni < 0 | idem |
| **Spese SaaS / Estere** (click → drawer) | Totale EUR | `sumSaasForeignEurCents()` + scritture JSON con conto Software; drawer `SaasForeignExpensesPanel` → GET/POST `/api/dashboard/finance/saas-invoices` (Prisma/Blob) |
| **Tasso Riconciliazione** | % tx con `category !== UNRECONCILED` | Solo JSON ledger |

**Nota di solidità:** Entrate/Uscite/% riconciliazione **non** riflettono `BankStatementLine` né il registro storico Neon. Se il JSON è vuoto o desincronizzato, i KPI mentono rispetto alle tabelle sotto.

### 1.3 Blocco «Conto Corrente Operativo (FinecoBank)»

- Anagrafica legale + IBAN/BIC da `lib/financial/companyBankDetails` (costanti, non API).
- **`BankStatementsPanel` innestato qui (sempre visibile, fuori dai tab):**
  - Upload PDF/CSV/XLSX → POST `/api/dashboard/finance/bank-statements/upload`
  - Incolla home banking → POST `.../bank-statements/paste` (preview + confirm, dedup)
  - Tabella **«Movimenti estratto conto»** (filtro anno, MATCHED/UNMATCHED, ri-analizza) → GET `.../bank-statements?view=movements`
  - Tabella **archivio file** (nome, periodo, match, download/delete) → GET `.../bank-statements`
  - Modale **incolla** + modale **Abbina / Associa** (suggerimenti SDI, ordine fiorista, categoria) → PATCH linee + `re-reconcile`

Persistenza: Neon `BankStatementDocument` / `BankStatementLine`.

### 1.4 Tre card esplicative (sempre visibili)

Testo statico: Entrate native (webhook) / Uscite maturate (fioristi) / Quadratura bancaria. **Nessun dato live** — duplicano il sottotitolo header.

### 1.5 Tre box ingest fatture (sempre visibili, griglia 3 colonne)

| Componente | Canale | API | Destinazione |
|---|---|---|---|
| `SdiInvoicesUploadBox` | ZIP/XML SDI YouDoox | POST `/api/dashboard/finance/invoices/upload` (`channel=SDI_XML`) | Fatture passive + match Fineco |
| `ReceivedInvoicesXlsxUploadBox` | XLSX/CSV report ricevute | POST `.../invoices/upload-xlsx` | Stesso universo fatture + match |
| `ForeignAutofattureUploadBox` | TD17/TD18 XML/ZIP/PDF + generatore | `.../invoices/upload-foreign`, `.../autofatture/*` | Autofatture estere + YouDoox |

Ogni box ha lista file già caricati (`invoices/uploads`). Dopo import: `loadLedger()`.

### 1.6 Tab bar (7 schede)

| Tab `activeTab` | Label UI | Contenuto |
|---|---|---|
| `transactions` | Movimenti bancari | `BankMovementsStatementTable` |
| `accounting` | Scritture di Prima Nota | `PrimaNotaTable` |
| `florist-invoices` | Fatture in attesa dai fioristi | `FloristMissingInvoicesPanel` |
| `historical` | Archivio Storico Fiscale | `HistoricalFiscalArchivePanel` |
| `statements` | Bilancio & Conto Economico | CE + SP + stima IRES/IRAP inline in `page.tsx` |
| `gateways` | Stato Stripe & PayPal | Saldi live + CSV PayPal + sync + `GatewaySyncTable` + log checkout Stripe |
| `tax` | Chiusura Trimestrale & Fisco | `TaxQuarterlyPanel` |

Search bar globale (emittente/causale) visibile solo su tab `transactions` e `accounting`.

### 1.7 Dettaglio tab e fonti dati

#### Tab Movimenti bancari — `BankMovementsStatementTable`

- GET `/api/dashboard/finance/bank-statements?view=movements&year=YYYY`
- Stile home banking: Data unificata, causale larga, categoria inline, entrate/uscite/saldo, origine Fineco vs paste.
- PATCH categoria: `/api/dashboard/finance/bank-statements/[id]/lines/[lineId]`
- **Stesso dataset** della tabella «Movimenti estratto conto» in `BankStatementsPanel` (stesso `view=movements`).

#### Tab Prima Nota — `PrimaNotaTable`

- GET `/api/dashboard/finance/historical-ledger?year=…&take=500` (Neon `FinancialLedgerEntry`)
- Merge/dedup con `ledger.accountingEntries` JSON via `applyFiscalAuthorityHierarchy` (`lib/financial/fiscalAuthorityDedupe`) — **banca/gateway vincono sugli ordini**.
- Edit inline «fonte» → POST historical-ledger `set_fonte`.
- Export CSV/JSON in header **non** usa questa tabella, usa solo JSON.

#### Tab Fatture in attesa fioristi — `FloristMissingInvoicesPanel`

- GET `/api/dashboard/finance/florist-missing-invoices`
- Logica: `lib/financial/floristMissingInvoices` — uscite Fineco classificate fiorista **senza** fattura entro 15 gg; cross-match ordine.
- Azioni: reminder email/WhatsApp; associa ordine; «collega fattura» apre `ManualExpenseModal` prefill.

#### Tab Archivio Storico Fiscale — `HistoricalFiscalArchivePanel`

- GET historical-ledger (list + PnL)
- 4 mini-KPI (produzione, costi, EBITDA, IVA/risultato) da `computeHistoricalPnl`
- Tabella scritture filtrabile (anno/trimestre/mese/direzione/categoria) + export CSV
- **Stesso registro Neon** della Prima Nota, vista “archivio + CE”.

#### Tab Bilancio & CE — inline in `page.tsx`

- Oggetto `statements` da GET `/api/dashboard/finance` → `calculateFinancialStatements()` (`lib/financial/statements.ts`)
- Preferisce PnL da `FinancialLedgerEntry` se count anno > 0; altrimenti ledger JSON
- Crediti clienti: ordini Prisma `ACCEPTED`/`PENDING`
- Card: CE gestionale (ricavi, fioristi, Stripe, SaaS, ads, EBITDA), SP (cassa, crediti, debiti fornitori/tributari, PN), stima IRES 24% / IRAP 3.9% / utile netto
- Export JSON «FidoCommercialista» del blob `statements`
- Banner: se `source === 'historical_ledger'` rimanda al tab Archivio

#### Tab Stato Stripe & PayPal

| Blocco | Fonte |
|---|---|
| Saldo Stripe available/pending | GET `/api/dashboard/finance/gateways` → Stripe Balance API |
| Saldo PayPal | Stesso endpoint (placeholder/config env; commento “in futuro OAuth”) |
| Upload CSV PayPal | `PaypalCsvUploadBox` → POST `sync/paypal/upload-csv` → ledger PayPal |
| Sync Stripe COM+EU / PayPal dal 01/01/2026 | POST `sync/stripe`, `sync/paypal` |
| **`GatewaySyncTable`** | GET `sync/gateways` — `StripeFinanceMovement` + `FinancialLedgerEntry` PAYPAL, dedup `paypalLedgerSanitize` |
| Tabella «Log tentativi pagamento Stripe» | Stesso GET gateways: ultime ~10 **Checkout Session** Stripe (operativo checkout, non payout) |

#### Tab Chiusura trimestrale — `TaxQuarterlyPanel`

- GET `/api/dashboard/finance/tax-quarterly` (+ tax-register)
- KPI periodo (lordo, IVA, fee, compensi, margine)
- Tabella **Registro economico & corrispettivi** (ordini Prisma: IVA 10/22, gateway, fiorista, liquidazione)
- Tabella **Fatture mensili Stripe commissioni** + PDF
- Sync Stripe, ZIP ricevute, note liquidazione fiorista
- **Terza vista fiscale** accanto a CE tab + Archivio PnL

### 1.8 Overlay / modali / drawer (non tab)

| UI | Trigger | Persistenza |
|---|---|---|
| `SaasForeignExpensesPanel` | Click KPI SaaS | Drawer: upload fatture SaaS, ZIP mensile, TD17/18/19 |
| `ManualExpenseModal` | Header + panel fioristi | POST manual-expenses |
| Modale paste Fineco | `BankStatementsPanel` | paste API |
| Modale match riga banca | `BankStatementsPanel` | PATCH line |
| Generatore XML autofattura | box TD17/TD18 | autofatture generate/pdf/xml |
| (FloristDeliveryEditModal) | **Non montato** su questa page | Fuori scope finance page |

### 1.9 Scadenziario S.r.l. (sempre visibile, **sotto** i tab)

- Calendario da `getUpcomingDeadlines` (`lib/financial/compliance/deadlines.ts`) — regole fisse IVA/F24/esterometro/bilancio/startup, start 2026-04-01, hide overdue >90gg
- Stato UI persistito in ledger JSON (`deadlineStatusById`) via POST finance `set_deadline_status`
- Filtri ALL / Fiscale / Esterometro / Bilancio & Startup
- Banner urgenza 0–10 giorni
- Link YouDoox su alcune scadenze (`externalRef`)

**Non è un tab:** occupa sempre lo scroll dopo qualunque scheda.

### 1.10 Codice morto / semi-morto sulla page

- `filteredTransactions` / `filteredEntries` calcolati e **mai renderizzati** — residuo della vecchia tabella ledger JSON sostituita da `BankMovementsStatementTable` / `PrimaNotaTable`.

---

## 2. Ridondanze e duplicazioni

### 2.1 Movimenti bancari: due tabelle sullo stesso Neon

| Superficie | Posizione | Stesso `view=movements` |
|---|---|---|
| `BankStatementsPanel` → «Movimenti estratto conto» | **Sopra i tab**, sempre | Sì + filtri match + ri-analizza + match modal |
| Tab «Movimenti bancari» | Sotto | Sì + categorie inline + saldo progressivo |

**Esito UX:** l’utente vede due “estratti Fineco”. Quello sopra è più operativo (upload + unmatched); quello nel tab è più “home banking”. Non sono due fonti: sono **due skin**.

L’archivio file (seconda tabella nel panel) è invece **unico e necessario** (audit upload).

### 2.2 Prima nota vs Archivio storico vs export header

| Vista | Neon ledger | JSON ledger | PnL |
|---|---|---|---|
| Tab Prima Nota | Sì (anno corr., 500 righe) + merge JSON | Sì (residui) | No |
| Tab Archivio | Sì (filtri completi) | No | Sì (4 card) |
| Export CSV/JSON header | No | **Solo JSON** | No |
| Tab Bilancio | Indiretto via `statements` | Fallback | Sì (CE/SP/imposte) |

Rischio: commercialista esporta CSV **incompleto** rispetto a ciò che vede in Prima Nota Neon.

### 2.3 Tre (o quattro) “conti economici”

1. KPI Entrate/Uscite (JSON tx)  
2. Tab Bilancio CE/EBITDA/IRES  
3. Archivio 4 card PnL  
4. TaxQuarterly summary su **ordini** (corrispettivi), non sul ledger bancario  

1 vs 2/3: metriche diverse (cassa JSON vs competenza Neon).  
2 vs 3: stesso Neon, due dashboard.  
4 vs 2/3: **giusto che resti distinto** (IVA per ordine vs CE aziendale) — ma va etichettato chiaramente, non accostato come “altro bilancio”.

### 2.4 Gateway: tre strati

1. Saldi realtime Stripe (utile) + PayPal (spesso vuoto/placeholder)  
2. `GatewaySyncTable` — **vista canonica** movimenti/payout/fee dal 2026  
3. Log Checkout Session — **operativo pagamenti**, non tesoreria  

CSV PayPal + webhook + API già deduplicati in sanitize; la UI però **ripete** sync controls e tabelle.

Tax tab ha **ancora** «Fatture Stripe commissioni» (documenti fiscali fee) — complementare a (2), non duplicato se si capisce: (2)=movimenti, fatture=PDF reverse charge.

### 2.5 Ingest fatture sempre in home

Tre drop-zone + liste file **prima** dei tab: la pagina parte come “centro upload”, non come cruscotto. SaaS estere è **anche** nel drawer KPI **e** nel box autofatture (TD17 overlap concettuale).

### 2.6 Testo ripetuto

Header + 3 card colorate + copy Fineco nel panel = tre volte la stessa spiegazione del flusso.

### 2.7 Scadenziario sempre sotto

Chi lavora sui movimenti deve scrollare 1–2 schermate di adempimenti. Chi chiude il fisco deve tornare su. Funzione **necessaria**, posizione **sbagliata**.

### 2.8 Cosa NON è ridondante (da non tagliare)

- Dedup gerarchia fiscale banca/gateway > ordine (`fiscalAuthorityDedupe`)  
- Match Fineco ↔ SDI / fiorista / payout  
- Alert 15 giorni fatture fioristi  
- Generatore TD17/TD18 YouDoox  
- Saldo Fineco manuale (home banking non espone API)  
- Scadenziario con override stato  
- Registro corrispettivi trimestrale (IVA per vendita)

---

## 3. Proposta di snellimento e accorpamento

Struttura lineare **senza perdere controlli**: **5 tab tematici** + header corto. Ingest **dentro** il tab che usa quei dati.

### 3.1 Home (sopra i tab) — solo immediatezza

**Tenere visibili:**

1. Titolo corto + 4–5 azioni (Spesa, Sync, Fornitori; CSV/JSON spostati in Prima Nota; «Riconcilia ordini manuali» in tab banca o menu ⋯).  
2. **Le 5 KPI** (Saldo Fineco edit, Entrate, Uscite, SaaS, % riconciliazione) — **dopo lo snellimento codice**, Entrate/Uscite/% andrebbero ricalcolate da `BankStatementLine` e/o Neon, non dal JSON, altrimenti restano KPI “teatro”.  
3. **Niente** IBAN a tutta larghezza: riga compatta «Fineco · IBAN · copia» o tooltip sul KPI saldo.  
4. **Eliminare** le 3 card didattiche.

### 3.2 Tab A — «Banca Fineco» (operativo quotidiano)

Unificare `BankStatementsPanel` + `BankMovementsStatementTable`:

- Zona ingest (upload + incolla) in alto, **collassabile** dopo il primo uso.  
- **Una sola tabella movimenti** (layout home-banking del tab attuale: data unica, causale larga, categoria, match, saldo).  
- Archivio file sotto, secondario o accordion.  
- Match modal e ri-analizza restano qui.

**Eliminare** la tabella duplicata (scegliere una: consigliata quella del tab Movimenti + portare lì filtri MATCHED e bottone ri-analizza).

### 3.3 Tab B — «Prima Nota»

- Solo `PrimaNotaTable` (Neon + gerarchia).  
- Export CSV/JSON **da queste righe**, non dal JSON.  
- **Non** ripetere il PnL a 4 card (vive nel tab Fisco o in un sottotab «Sintesi»).

### 3.4 Tab C — «Passivo & SDI»

Spostare **fuori dalla home** i 3 box upload:

- Sottotab o accordion: SDI XML | XLSX ricevute | Autofatture TD17/TD18  
- Tabella/alert **Fatture in attesa fioristi** in evidenza (operativo).  
- Drawer SaaS può restare sul KPI **oppure** un quarto accordion «SaaS estere» — non entrambi pieni.

### 3.5 Tab D — «Gateway»

- Riga saldi Stripe (+ PayPal se configurato).  
- `GatewaySyncTable` come unica tabella movimenti.  
- CSV PayPal accanto alla tabella, non in una card enorme.  
- Log Checkout Session: **sottosezione collassata** «Pagamenti checkout (ultime 10)» — non tesoreria.  
- Fatture commissioni Stripe: link al tab Fisco o sottosezione «Documenti fee».

### 3.6 Tab E — «Fisco & adempimenti»

Accorpare senza mescolare i numeri:

1. **Chiusura trimestrale** (`TaxQuarterlyPanel`) — corrispettivi/IVA per ordine.  
2. **Sintesi CE/SP** — una sola: o il tab Bilancio attuale **o** le 4 card Archivio; l’altra diventa «Dettaglio scritture» (tabella Archivio) sotto. Consigliato: **PnL Archivio come sintesi** + tabella storico; CE/SP/IRES del tab Bilancio come **secondo accordion** «Stato patrimoniale e accantonamenti» (stessa fonte `statements`, non un terzo calcolo).  
3. **Scadenziario S.r.l.** spostato **qui in cima al tab** (non più footer globale).

### 3.7 Cosa eliminare vs accorpare vs spostare

| Azione | Cosa |
|---|---|
| **Eliminare (UI)** | 3 card esplicative; seconda tabella movimenti Fineco; export header dal JSON se esiste export da Neon; IBAN a blocco hero |
| **Accorpare** | Panel estratti + tab movimenti; Prima Nota + parte “lista” Archivio; CE tab Bilancio + card PnL Archivio |
| **Spostare sotto tab/accordion** | 3 upload fatture; scadenziario; log Stripe checkout; coordinate bancarie complete |
| **Tenere in evidenza (home o Tab A/B/C)** | 5 KPI; movimenti Fineco unificati; Prima Nota dedup; alert fioristi; SDI/TD17 ingest (nel tab Passivo); GatewaySyncTable |

### 3.8 Ordine tab proposto (lineare)

`Banca` → `Prima nota` → `Passivo/SDI` → `Gateway` → `Fisco`  

7 etichette attuali diventano 5; «Storico» e «Bilancio» non spariscono: diventano sezioni del tab Fisco.

### 3.9 Vincoli di implementazione (per quando si toccherà il codice)

- Non spezzare `applyFiscalAuthorityHierarchy` / sanitize PayPal / match Fineco.  
- Allineare KPI a Neon o a `BankStatementLine` **prima** di fidarsi della home.  
- Export commercialista = stesso dataset della tabella visibile.  
- Upload SDI/XLSX/TD restano obbligatori: solo **non** in above-the-fold.

---

## 4. Inventario file (riferimento)

| File | Ruolo |
|---|---|
| `app/dashboard/finance/page.tsx` | Orchestratore UI |
| `app/dashboard/finance/TaxQuarterlyPanel.tsx` | Fisco trimestrale |
| `components/dashboard/BankStatementsPanel.tsx` | Ingest + movimenti + archivio Fineco + 2 modali |
| `components/dashboard/BankMovementsStatementTable.tsx` | Tabella movimenti “home banking” |
| `components/dashboard/PrimaNotaTable.tsx` | Scritture dedup |
| `components/dashboard/HistoricalFiscalArchivePanel.tsx` | Archivio + PnL |
| `components/dashboard/FloristMissingInvoicesPanel.tsx` | Alert fatture fioristi |
| `components/dashboard/GatewaySyncTable.tsx` | Stripe+PayPal unificati |
| `components/dashboard/SdiInvoicesUploadBox.tsx` | YouDoox XML |
| `components/dashboard/ReceivedInvoicesXlsxUploadBox.tsx` | XLSX ricevute |
| `components/dashboard/ForeignAutofattureUploadBox.tsx` | TD17/TD18 |
| `components/dashboard/PaypalCsvUploadBox.tsx` | CSV PayPal |
| `components/dashboard/SaasForeignExpensesPanel.tsx` | Drawer SaaS |
| `components/dashboard/ManualExpenseModal.tsx` | Spesa/documento |
| `app/api/dashboard/finance/route.ts` | Ledger JSON + statements |
| `app/api/dashboard/finance/bank-statements/*` | Fineco Neon |
| `app/api/dashboard/finance/historical-ledger` | Registro permanente |
| `app/api/dashboard/finance/gateways` + `sync/*` | Stripe API + PayPal |
| `lib/financial/statements.ts` | CE/SP/imposte |
| `lib/financial/ledgerStore.ts` | `financial_ledger.json` |
| `lib/financial/compliance/deadlines.ts` | Scadenziario |

---

## 5. Verdetto per la valutazione congiunta

La dashboard è **fiscalmente coprente** ma **visivamente doppia** su banca, CE e (in parte) gateway. Lo snellimento sicuro è **unificare viste**, non cancellare pipeline.

**Quick win senza toccare il modello dati:** (1) una tabella Fineco, (2) ingest SDI sotto tab, (3) scadenziario nel tab Fisco, (4) export dalla Prima Nota Neon, (5) togliere le 3 card testo.

**Secondo passo (dati):** KPI Entrate/Uscite/% da movimenti Fineco e/o ledger Neon, così le 5 card restano il cruscotto vero.

---

*Fine relazione. Nessuna modifica a componenti o API in questa sessione.*

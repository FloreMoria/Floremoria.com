# Piano Strategico Master — Modulo Contabilità & Finanza FloreMoria (`/dashboard/finance`)

**Data di consolidamento:** 24 Agosto 2026  
**Autore:** Antigravity (Advanced Agentic Coding — Google DeepMind)  
**Destinatari:** Direzione Generale & Lead Architecture Team  

---

## 1. Analisi Critica del Dossier Integrato

Il *Dossier Integrato di Analisi del 24 Agosto 2026* individua con estrema lucidità le criticità della sezione Contabilità e Finanza. L'analisi rivela che l'attuale frammentazione e disordine visivo della dashboard non sono problemi puramente estetici, ma **la diretta manifestazione di un'architettura dati ibrida e incompleta**.

### La Causa Radice: Il "Doppio Binario" Architetturale
Il sistema opera attualmente su un **doppio binario**:
1. **Il Vecchio Motore Effimero**: basato sul file locale `financial_ledger.json` in `/tmp` e su elaborazioni in-memory legate alle singole sessioni client.
2. **Il Nuovo Motore Persistente**: basato sulle tabelle PostgreSQL di **Neon DB** (`FinancialLedgerEntry`, `BankStatementDocument`, `BankStatementLine`, `SystemState`).

Questa convivenza genera **quattro gravi distorsioni**:
* **Sicurezza & Autenticazione debole**: Webhook esposti e ruoli basati su cookie client non firmati (`fm_user_role`).
* **Incongruenze Contabili & Fiscai**: Rischio di triplo conteggio dei ricavi (Incasso ordine -> Transazione Stripe -> Bonifico Payout Fineco) per mancanza della gestione rigida delle **Partite di Giro** (`TRASFERIMENTO_INTERNO`).
* **Dati a rischio di perdita (Cold Start)**: Stato di F24 e adempimenti salvati nel filesystem temporaneo Vercel `/tmp`, che si azzera a ogni deploy o risveglio dell'istanza serverless.
* **Duplicazioni Visive in UI**: 2 tabelle distinte per i movimenti Fineco, 3 tabelle per la Prima Nota, 2 tabelle per Stripe/PayPal, box di upload sparpagliati.

---

## 2. Strategia Integrata a 3 Fasi Sequenziali

Per garantire che la nuova dashboard sia non solo bellissima e snella, ma **forensicamente a prova di bomba e conforme ai principi della partita doppia aziendale**, la strategia migliore si sviluppa in **3 Fasi Tassativamente Sequenziali**:

```
+-----------------------------------------------------------------------------------+
| FASE 1 — BONIFICA ARCHITETTURALE, SICUREZZA & NEON DB                             |
| • Eliminazione file /tmp/financial_ledger.json -> Migrazione 100% su Neon DB     |
| • Blindatura Webhook (rimozione x-mock-provider) & Autenticazione Server-Side     |
| • Deduplicazione transazionale (:v<Date.now()>) & Hash SHA-256 su estratti conto |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 2 — CORREZIONE LOGICA CONTABILE & RECONCILIATION ENGINE                      |
| • Automatismo Partite di Giro (Conto Stripe/PayPal -> Conto FinecoBank)           |
| • Unificazione Aliquote IVA (10% Fiori, 22% Accessori/Servizi) & SDI Match        |
| • Unificazione Motore Riconciliazione & Sblocco Scadenziario > 90 giorni          |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 3 — REFACTORING UI/UX IN 5 TAB UNIFICATI                                    |
| • Tab 1: Banca Fineco (Upload + Unica Tabella Movimenti Reali)                   |
| • Tab 2: Prima Nota Ufficiale (Query dirette su Neon DB + Export CSV/JSON)        |
| • Tab 3: Passivo & SDI (Box Upload 3 Colonne + Fatture Fioristi + SaaS)           |
| • Tab 4: Gateway Pagamenti (Stripe COM/EU + PayPal + GatewaySyncTable)            |
| • Tab 5: Fisco, Bilancio & Adempimenti (Scadenziario + TaxQuarterly + PnL/EBITDA) |
+-----------------------------------------------------------------------------------+
```

---

## 3. Dettaglio Esecutivo per Ciascuna Fase

### 3.1 FASE 1: Sicurezza, Persistenza & Neon DB (Propedeutica Assoluta)

1. **Eliminazione di `/tmp/financial_ledger.json`**:
   - Eliminare ogni dipendenza da file locali temporanei.
   - Creare o completare la tabella Prisma per `DeadlineStatus` e `F24Status` su Neon DB, rendendo la persistenza 100% resiliente ai redeploy Vercel/Docker.
2. **Blindatura Autenticazione & Webhook**:
   - Rimuovere il bypass `x-mock-provider` da `/api/v1/finance/webhook` in produzione; imporre la verifica della firma crittografica Webhook (Stripe Signatures / PayPal Webhook ID).
   - Sostituire il controllo sul cookie client `fm_user_role` con la verifica dell'autenticazione lato server gestita da Prisma/NextAuth session.
3. **Deduplicazione Scritture e Hash File**:
   - Rimuovere la generazione di chiavi con suffisso dinamico `:v<Date.now()>` in `upsertAccountingEntries`. Utilizzare la chiave naturale `sourceKey` con `ON CONFLICT (sourceKey) DO UPDATE` per evitare l'accumulo di versioni duplicate.
   - Aggiungere il calcolo dell'hash **SHA-256** del file caricato in `BankStatementDocument` per bloccare sul nascere il re-upload dello stesso estratto conto Fineco.
4. **Numerazione Atomica Autofatture (TD17/TD18)**:
   - Implementare la generazione transazionale del numero di autofattura (tramite sequenza PostgreSQL o `SELECT ... FOR UPDATE` su `SystemState`) per prevenire duplicati o salti di numerazione.

---

### 3.2 FASE 2: Logica Contabile, Partite di Giro & IVA

1. **Gestione Partite di Giro (`TRASFERIMENTO_INTERNO`)**:
   - Quando Stripe o PayPal accreditano il bonifico di Payout sul conto corrente FinecoBank, il sistema deve riconoscere l'operazione come **Giroconto Interno** (Dare: *Banca Fineco*, Avere: *Conto Transitorio Gateway Stripe/PayPal*).
   - Questo elimina alla radice il triplo conteggio dei ricavi e allinea il Tasso di Riconciliazione reale.
2. **Unificazione e Coerenza Aliquote IVA**:
   - Centralizzare le regole fiscali:
     - **10%**: Omaggi floreali, bouquet cimiteriali, composizioni sul posto.
     - **22%**: Accessori (lumini, ceri, nastri), servizi B2B, commissioni gateway e fatture fornitori generali.
   - Allineare il registro corrispettivi ordini, lo scorporo ricevute e l'ingest SDI YouDoox su questa matrice unificata.
3. **Unificazione Motore di Riconciliazione AI**:
   - Fondere `reconciliation.ts` e `reconciler.ts` in un unico servizio deterministico con scoring (0–100%), eliminando discrepanze di matching tra estratti conto e ordini/fatture.
4. **Sblocco Scadenziario S.r.l.**:
   - Rimuovere il filtro che nasconde i tributi o gli adempimenti scaduti da oltre 90 giorni. Gli insoluti o le scadenze pregresse devono rimanere visibili in evidenza (con stato `SCADUTO`), per garantire che la direzione aziendale non perda mai di vista eventuali contenziosi o sanzioni F24.

---

### 3.3 FASE 3: Refactoring UI/UX — Il Modello a 5 Tab Unificati

Una volta bonificato il backend, l'interfaccia utente di `/dashboard/finance` viene completamente ristrutturata in **5 Tab Tematici Unificati**, rimuovendo le ridondanze visive e i blocchi duplicati:

```
+-----------------------------------------------------------------------------------+
| HEADER: Gestione Finanziaria e Prima Nota AI | [Registra Spesa] [Sincronizza] ...  |
+-----------------------------------------------------------------------------------+
| 5 KPI CARD: [Saldo Fineco] [Entrate] [Uscite] [Spese SaaS] [Tasso Riconciliazione] |
+-----------------------------------------------------------------------------------+
| SCHEDE PRINCIPALI:                                                                |
| [1. Banca Fineco] [2. Prima Nota] [3. Passivo & SDI] [4. Gateway] [5. Fisco & PnL]|
+-----------------------------------------------------------------------------------+
```

#### Struttura Dettagliata dei 5 Tab:

1. **Tab 1 — Banca Fineco**:
   - Header compatto con Coordinate Bancarie (IBAN, BIC/SWIFT).
   - Modulo Ingest: Drag & Drop PDF/CSV/XLSX + Bottone *Incolla Movimenti da Home Banking*.
   - **Unica Tabella Movimenti Bancari**: integra il calcolo del saldo progressivo, il filtro anno (2026/2025/Tutti), la ricerca e la modifica inline delle categorie/matching.
2. **Tab 2 — Prima Nota Ufficiale**:
   - Visualizzazione unica e consolidata delle scritture contabili (Dare/Avere, IVA, Emittente, Riferimento Documento) lette direttamente da Neon DB (`FinancialLedgerEntry`).
   - Pulsanti di esportazione **Esporta CSV** ed **Esporta JSON** posizionati sopra la tabella e alimentati da query DB in tempo reale.
3. **Tab 3 — Passivo & Ingest SDI**:
   - Grid compatto a 3 colonne per gli upload documentali:
     1. XML Fatture SDI YouDoox.
     2. Report XLSX SDI.
     3. Autofatture Estere TD17/TD18/TD19.
   - Tabella *Fatture in attesa dai fioristi* (`FloristMissingInvoicesPanel`) con inserimento rapido in spesa manuale.
   - Accesso diretto al drawer *Spese SaaS / Estere*.
4. **Tab 4 — Gateway di Pagamento (Stripe & PayPal)**:
   - Saldi real-time Stripe (COM + EU) e PayPal.
   - Bottone sincronizzazione API dal 01/01/2026 + Caricatore CSV PayPal.
   - Tabella consolidata `GatewaySyncTable` (con dettaglio Lordo / Fee / Netto).
   - *Eliminazione della tabella grezza dei tentativi Stripe duplicata*.
5. **Tab 5 — Fisco, Bilancio & Adempimenti**:
   - **Scadenziario S.r.l. (in prima posizione)** con filtri Fiscale, Esterometro, Bilancio e allerta imminente a 10 giorni.
   - **Chiusura Trimestrale IVA & Fisco** (`TaxQuarterlyPanel` per Q1-Q4).
   - **Conto Economico Gestionale (EBITDA)**, Stato Patrimoniale e Stima Imposte IRES/IRAP con export per FidoCommercialista.

---

## 4. Matrice di Sintesi Operativa

| Problema Individuato | Impatto Attuale | Soluzione Integrata Adottata |
| :--- | :--- | :--- |
| **Persistenza effimera `/tmp`** | Perita di dati F24/scadenze ai redeploy | Migrazione completa su Neon DB PostgreSQL |
| **Triplo conteggio ricavi** | Totali Entrate e Bilancio distorti | Introduzione automatica causale `TRASFERIMENTO_INTERNO` |
| **Doppia tabella movimenti Fineco** | Confusione visiva tra blocco top e Tab 1 | Fusione in un'unica tabella completa nel Tab 1 |
| **Export CSV/JSON da file locale** | Dati esportati non allineati al DB | Query dirette su Neon DB per l'export commercialista |
| **Tabella tentativi Stripe duplicata** | Allungamento della pagina e ridondanza | Assorbimento delle informazioni in `GatewaySyncTable` |
| **Scadenziario in fondo alla pagina** | Poca visibilità sugli adempimenti imminenti | Posizionamento in primo piano nel Tab 5 |

---

## 5. Raccomandazione Finale e Roadmap di Implementazione

La strategia raccomandata garantisce il perfetto bilanciamento tra **sicurezza informatica, rigore contabile e pulizia di interfaccia**.

* **Fase 1 (Backend & DB)**: 1-2 giornate di lavoro (blindatura Webhook, rimozione `/tmp`, deduplicazione `sourceKey`).
* **Fase 2 (Logica Fiscale)**: 1 giornata di lavoro (Partite di giro Payout, IVA unificata, sblocco scadenze).
* **Fase 3 (Refactoring UI 5 Tab)**: 1 giornata di lavoro (layout React pulito, 5 tab, rimozione componenti duplicati).

Procedendo in questo ordine, FloreMoria otterrà un modulo Contabilità di classe enterprise, estremamente reattivo, sicuro e conforme agli standard della fiscalità italiana S.r.l.

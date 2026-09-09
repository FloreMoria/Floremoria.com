# Inventario dello stato — Contabilità e Finanza

**Data verifica:** 2026-09-09  
**Commit verificato (codice ispezionato):** `f754058dd814c48cfb29afb24c5b4883cd464a1d` (`f754058d`)  
**Commit di questo inventario:** vedi git log su `docs/INVENTARIO_CONTABILITA.md`  
**Metodo di riferimento:** `docs/METODO_DOSSIER_FISCALE.md` **v1.7** (8 settembre 2026)  
**Regola:** vince il codice; dove verbale/metodo e codice divergono, la divergenza è segnalata.

### Conteggio riassuntivo (righe tabella Stato · Voce · Evidenza · Nota)

| Stato | Conteggio |
|---|---:|
| **FATTO** | 84 |
| **PARZIALE** | 40 |
| **DA FARE** | 10 |
| **DA VERIFICARE** | 5 |

---

## 1. Conformità al METODO v1.7 (§2–§12)

### §2 — Gerarchia delle fonti

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| PARZIALE | Quattro livelli di verità (banca → gateway → documenti → ordini) | `lib/financial/fiscalAuthorityDedupe.ts` (`applyFiscalAuthorityHierarchy`); commenti in `historicalLedgerQuery.ts` | Gerarchia usata in **lettura** Prima Nota / CE; non è un cancello unico in scrittura su tutte le fonti. |
| DA FARE | Estratto conto solo da file scaricato dal portale banca (niente testo incollato) | `lib/financial/bankStatements/store.ts` (`previewFinecoPaste`, `confirmFinecoPaste`) | Il METODO vieta il paste; il codice lo accetta ancora e crea `BankStatementDocument` con `source: fineco_paste`. **Divergenza metodo↔codice.** |
| PARZIALE | Estratto con saldo iniziale e finale dichiarati dalla banca | `prisma/schema.prisma` `BankStatementDocument.openingBalanceCents` / `closingBalanceCents`; `parseFinecoPdf.ts`; `controlC3` | Campi e parsing esistono; upload non rifiuta sempre i file senza saldi (C3 fallisce dopo). Nessun campo `downloadDate` / provenienza portale a schema. |
| PARZIALE | Registrazione metadati file (nome, periodo, saldi) | `BankStatementDocument` (`fileName`, `periodStart/End`, `opening/closing`, `uploadedAt`, `sha256Hash`) | Manca data download dichiarata / provenienza portale (§2). |
| PARZIALE | Gerarchia canali fatture passive: Youdox > report > manuale | `dossierAcquistiBuild.ts` (`resolveAcquistiSheetRows`); `ingestSdiInvoices.ts`; `app/api/v1/finance/youdox/sync` | Dedupe manual↔saas a **export** per nome file; Youdox ingestisce via sync. Non risulta un unico ranking canale Youdox>XLSX>manual all’ingresso su tutti i path. Commento codice ancora dice «§6.4» (rinumerata §6.5 in v1.7). |

### §3 — I fogli del dossier

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Foglio 0 Quadratura | `taxQuarterlyXlsx.ts` (`buildQuadraturaSheet`) | Presente nell’export XLSX. |
| DA FARE | Foglio 1 Registro corrispettivi (foglio dedicato) | `taxQuarterlyXlsx.ts` riga ~13: «Fase 3 aggiungerà il Registro corrispettivi»; nessun `addWorksheet('Registro…')` | **Divergenza:** METODO v1.7 lo richiede obbligatorio; codice Fase 2 lo rimanda. |
| PARZIALE | Dati corrispettivi calcolati (anche senza foglio) | `taxQuarterly.ts` (`buildTaxQuarterlyReport` → `corrispettivi`) | Dataset in JSON/API; non è il foglio 1 del workbook. |
| FATTO | Foglio Prima Nota | `taxQuarterlyXlsx.ts` (`buildPrimaNotaMasterSheet`) | Nome foglio: `Prima Nota (Master)`. |
| FATTO | Foglio Estratto conto | `taxQuarterlyXlsx.ts` (`buildFinecoSheet`) | Nome: `Estratto Conto Fineco`. |
| FATTO | Foglio Acquisti | `taxQuarterlyXlsx.ts` + `dossierAcquistiBuild.ts` (`resolveAcquistiSheetRows`) | |
| FATTO | Foglio Gateway Stripe | `taxQuarterlyXlsx.ts` (`buildStripeSheet`) | |
| FATTO | Foglio Gateway PayPal | `taxQuarterlyXlsx.ts` (`buildPaypalSheet`) | |
| FATTO | Foglio Eccezioni (sempre presente) | `taxQuarterlyXlsx.ts` (`buildEccezioniSheet`) | Unisce eccezioni acquisti + controlli falliti. |
| PARZIALE | Ordine e numerazione fogli = METODO | `taxQuarterlyXlsx.ts` (ordine reale: Quadratura → PN → Fineco → Acquisti → Stripe → PayPal → Eccezioni) | Manca foglio corrispettivi; ordine diverso da tabella §3. |
| PARZIALE | Versione metodo dichiarata sul dossier | `taxQuarterlyXlsx.ts` `DOSSIER_METHOD_VERSION = '1.2'` | **Divergenza:** file metodo è **v1.7**; export stampa ancora **v1.2**. |

### §4 — Foglio 0 Quadratura (contenuti)

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Esito controlli in cima + «DOSSIER NON QUADRATO» | `taxQuarterlyXlsx.ts` (`buildQuadraturaSheet`); `runAllDossierControls` | Controlli eseguiti solo al build XLSX. |
| PARZIALE | Liquidazione IVA con reverse charge a debito e a credito | `taxQuarterlyXlsx.ts` (righe IVA RC debito/credito ~486–493) | Blocco presente; dipendenza da foglio corrispettivi completo (§8) ancora parziale. |
| PARZIALE | Raccordo finanziario (apertura, entrate, uscite, chiusura, Δ=0) | `buildQuadraturaSheet` + `controlC3` | Presente in export; qualità legata a saldi estratto e riga «fantasma» paste (vedi bonifica). |
| PARZIALE | Conto economico del periodo con esclusioni dichiarate | `buildQuadraturaSheet`; `statements.ts` (`calculateFinancialStatements`) | CE anche in UI da altra pipeline (`/api/dashboard/finance`). |

### §5 — Controlli (sintesi; dettaglio §2 inventario sotto)

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Tutti e dieci i controlli esistono come funzioni | `dossierFiscalControls.ts` (`controlC1`…`controlC10`, `runAllDossierControls`) | |
| PARZIALE | Girano a ogni generazione dossier | `taxQuarterlyXlsx.ts` (`buildTaxQuarterlyXlsxBuffer`); `app/api/dashboard/finance/tax-quarterly/route.ts` | Solo se export `format=xlsx|excel|dossier`. `buildTaxQuarterlyReport` **non** li esegue. |
| FATTO | Fallimento non blocca export; va in Eccezioni | `taxQuarterlyXlsx.ts` (controlExceptions → `buildEccezioniSheet`) | Allineato al metodo. |

### §6 — Classificazione

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Elenco chiuso mastri per controllo C8 | `dossierFiscalControls.ts` `DOSSIER_ALLOWED_MASTRI` | Testo allineato a §6.1. |
| PARZIALE | Mastri usati in scrittura = etichette METODO | `chartOfAccounts.ts` (`ACCOUNT_RICAVI_VENDITE` = `60100 - Ricavi da Vendite`, ecc.); `normalizeMastroForCheck` | A libro restano codici/legacy; C8 normalizza in lettura. |
| PARZIALE | Regole attributive (fiorista, SDD PayPal, payout ≠ ricavo) | `payoutClassification.ts`; `paypalClassify.ts`; `chartOfAccounts.ts` `isPayoutIdClassificationEnabled` | Flag `FINANCE_PAYOUT_ID_CLASSIFICATION` (default ON). Lotti 5/5bis hanno riclassificato SDD→transito. |
| PARZIALE | Esclusione righe tecniche gateway dai totali | `gatewaySyncRows.ts`; fogli Stripe/PayPal in `taxQuarterlyXlsx.ts` | Parzialmente; C4/C9/C10 e verbali T2 mostrano ancora scostamenti. |
| DA FARE | Costo standard fiorista → solo «fatture da ricevere» che si chiudono | `floristMissingInvoices*.ts`; `FLORIST_PAYOUT` in `historicalLedgerTypes.ts` / `ledgerWriteGate.ts`; Product `floristStandardCostCents` a schema | Compenso standard a catalogo **esiste**; scrittura contabile «fattura da ricevere» chiusa al documento **non** risulta implementata come da §6.4. Storico `FLORIST_PAYOUT` ancora trattato da dedupe. |
| PARZIALE | Acquisto estero = una riga positiva + IVA RC (no riga negativa di compensazione) | `dossierAcquistiBuild.ts` (`resolveAcquistiSheetRows`) | Gate export T2 misurato €855,53 (`docs/verbali/dossier_fase2_quadratura_eccezioni_t2_2026.json`). Non riscrive il DB. Spec commentata ancora come §6.4. |

### §7 — Divieto totali ingannevoli

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| PARZIALE | Totali per natura / dichiarazione di cosa si somma | fogli gateway in `taxQuarterlyXlsx.ts`; `computeGatewayQuadratura` | Migliorato rispetto al totale unico agosto; UI gateway ancora espone card miste. |

### §8 — Registro corrispettivi

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| PARZIALE | Una riga per ordine+aliquota | `taxQuarterly.ts` (`corrispettivi` + `scorporaVenditaFloreale`) | Oggi scorpora 10%/22% su accessori per **categoria**, non riga prodotto×`vatRatePercent`. |
| DA FARE | Aliquota da attributo prodotto (niente default nascosto) | `Product.vatRatePercent` in `prisma/schema.prisma`; UI prodotti; **non** usato in `taxQuarterly.ts` riga ~623 | Campo catalogo FATTO; motore corrispettivi ancora su `scorporaVenditaFloreale` / categoria. **Divergenza §8.3.** |
| DA FARE | Stati aliquota determinata / presunta / mancante + totali in foglio 0 | assente in `taxQuarterly.ts` / `taxQuarterlyXlsx.ts` | |
| DA FARE | Canale di incasso ≠ canale di registrazione; unicità su gateway | assente come campi ordine dedicati; script `export-orders-com-eu.ts` / verbali EU | Logica analitica in script/verbali, non nel registro corrispettivi di produzione. |
| PARZIALE | Corrispettivo = lordo cliente (non netto gateway) | `taxQuarterly.ts` preferisce `amountCents` / `grossCents` gateway | Allineato in intenzione; C4 T2 ancora fallito (€1.699,90). |
| DA FARE | Foglio corrispettivi + colonne METODO complete | vedi §3 | |

### §9 — Foglio Eccezioni

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Foglio sempre generato | `buildEccezioniSheet` | |
| PARZIALE | Formato «cosa / dove / importo / perché» | `DossierExceptionRow` in `dossierAcquistiBuild.ts`; controlli mappati in XLSX | Controlli falliti entrano; copertura di tutti i casi §9 non verificata riga per riga. |

### §10 — Cosa il sistema non deve mai fare

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| PARZIALE | Non correggere i numeri perché «tornino» | soft-reverse lotti + `reversedAt` su `FinancialLedgerEntry`; dedupe **a lettura** ancora ON | Dedupe maschera doppioni invece di eliminarli a DB (motivo STOP Fase 5). |
| DA VERIFICARE | Elenco completo divieti §10 vs ogni writer | richiede audit writer-per-writer non chiuso in questa passata | |

### §11 — Periodo, competenza e cassa

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| PARZIALE | Dossier trimestrale a cassa / IVA | `financePeriod.ts`; `resolveQuarterBounds` in controlli e tax quarterly | |
| PARZIALE | Distinzione annuale competenza | `historicalLedgerQuery.ts` (`computeHistoricalPnl`); tab Fisco CE | Non è lo stesso artefatto del dossier trimestrale. |

### §12 — Denominazione e tracciabilità

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| PARZIALE | Versionamento metodo sul foglio 0 | `DOSSIER_METHOD_VERSION` | Valore **1.2** vs metodo **1.7**. |
| FATTO | Nome file / etichetta dossier | `DOSSIER_VERSION` in `taxQuarterlyXlsx.ts` | |

---

## 2. I dieci controlli (§5)

**Motore:** `lib/financial/dossierFiscalControls.ts`  
**Integrazione dossier:** solo `buildTaxQuarterlyXlsxBuffer` → API `GET /api/dashboard/finance/tax-quarterly?format=xlsx`  
**Script manuale storico:** `scripts/dossier-fiscal-controls-t2-2026.ts`  
**Ultima misura numerica trovata in repo:** `docs/verbali/dossier_fase1_controlli_t2_2026.json` — `generatedAt: 2026-09-08T13:37:56.103Z`, periodo **T2 2026**  
**UI:** nessuno stato C1–C10 in `app/dashboard/finance` / `components/dashboard/finance`.

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | C1 Completezza banca — implementato | `controlC1` | Ultimo valore: **19** (estratto 72 − PN banca 53). Fallito. Integrato in export XLSX + eseguibile via script. |
| FATTO | C2 Quadratura banca — implementato | `controlC2` | Ultimo: **€387,90** (38790 cents). Nota codice: somma PN di **tutte** le righe periodo, non solo banca. Fallito. |
| FATTO | C3 Continuità saldo — implementato | `controlC3` | Ultimo: **0** (passato su T2 nella misura 08/09). Se mancano opening+closing → NaN/fail. |
| FATTO | C4 Incassi vs corrispettivi — implementato | `controlC4` | Ultimo: **€1.699,90**. Fallito. Chiama `buildTaxQuarterlyReport`. |
| FATTO | C5 Coerenza documenti — implementato | `controlC5` | Ultimo: **€18,40**. Fallito. |
| FATTO | C6 Storni tecnici su **imponibile** — implementato | `controlC6` (commento e match su imponibile) | Ultimo: **6** coppie. Fallito. Allineato alla precisazione v1.7 sull’imponibile. |
| FATTO | C7 Fornitori senza P.IVA/CF — implementato | `controlC7` | Ultimo: **12**. Fallito. |
| FATTO | C8 Mastri ammessi — implementato | `controlC8` + `DOSSIER_ALLOWED_MASTRI` | Ultimo: **0**. Passato. |
| FATTO | C9 Transito come ricavo/costo — implementato | `controlC9` | Ultimo: **10**. Fallito. |
| FATTO | C10 Doppia gamba transito — implementato | `controlC10`; `gatewayTransitBalance.ts` | Ultimo: **2** gateway fail. PayPal: saldo API non wireato → `passed: false` forzato. |
| PARZIALE | Esecuzione automatica «a ogni dossier» | solo path XLSX | JSON API tax-quarterly senza format non gira i controlli. |
| DA FARE | Visibilità controlli in Contabilità UI | ricerca senza match C1–C10 nei componenti finance | Solo file esportato / JSON verbali. |

---

## 3. Motore contabile

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Cancello unico di scrittura ledger (Neon) | `ledgerWriteGate.ts` (`commitLedgerEntries`, `commitLedgerEntry`, `assertStableSourceKey`) | Skip se evento attivo; `createMany(skipDuplicates)`; non aggiorna importi. |
| PARZIALE | Cache/legacy JSON ledger | `ledgerStore.ts`; `commitAccountingToNeon.ts` | Ancora presente; rischio confusione operativa se usato come verità. |
| FATTO | Chiave canonica documento passivo | `canonicalDocumentKey.ts` (`buildCanonicalDocumentKey`, `isStrongCanonicalDocumentKey`) | |
| PARZIALE | Quarantena chiavi deboli | `verificationStatus` su `ManualFinanceExpense` / `SaasForeignInvoice` (nullable = legacy trattato come certificato nei totali) | Transizione Fase 3 incompleta sui dati storici. |
| FATTO | Conti di transito Stripe/PayPal | `chartOfAccounts.ts` (`gatewayTransitAccount`) | |
| FATTO | Idempotenza scritture (`sourceKey` unique) | `FinancialLedgerEntry.sourceKey` @unique; write gate | |
| PARZIALE | Idempotenza documenti (`canonicalDocKey`) | campi unique nullable + ingest `IDEMPOTENT SKIP` | |
| FATTO | Ingest fatture SDI XML / ZIP | `ingestSdiInvoices.ts` (`ingestSdiInvoiceUpload`); API `invoices/upload` | |
| FATTO | Ingest report ricevute XLSX | `ingestReceivedInvoicesXlsxUpload`; API `upload-xlsx` | |
| FATTO | Sync Youdox passivo | `youdoxClient.ts`; `app/api/v1/finance/youdox/sync*` | |
| FATTO | Autofatture estere generate (TD17/TD18) | `foreignAutofattura.ts`; `generateAutofatturaXml.ts`; `registerGeneratedAutofattura.ts`; API `autofatture/*` | |
| FATTO | Store fatture SaaS estere | `saasForeignInvoices.ts` | |
| FATTO | Sync Stripe movimenti/payout/fatture servizio | `stripeSync.ts` (`runStripeFinanceSync`) | Account EU opzionale. |
| PARZIALE | Sync PayPal API | `paypalSync.ts` (`runPaypalFinanceSync`) | 403 Reporting API gestito; fallback CSV `paypalCsvParser.ts`. |
| PARZIALE | Classificazione payout / funding | `payoutClassification.ts`; flag env | |
| PARZIALE | Quadratura wallet vs transito | `gatewayTransitBalance.ts` (`compareGatewayTransitBalances`); API `gateway-transit-balance` | PayPal available = null. |
| PARZIALE | Pipeline estratti Fineco | `bankStatements/store.ts`, `parseFineco.ts`, `parseFinecoPdf.ts`, `reconcileStatement.ts` | Paste ancora ammesso. |
| FATTO | Soft-reverse / non delete cieco | `FinancialLedgerEntry.reversedAt`, `reversesEntryId` | Usato dai lotti Fase 4b. |
| PARZIALE | Dedupe fiscale a lettura (non scrittura) | `fiscalAuthorityDedupe.ts` `FISCAL_AUTHORITY_DEDUPE_ENABLED = true` (costante) | **Maschera** doppioni; spegnerla rompe CE (Fase 5). |
| FATTO | Vista Fineco-master (sola lettura) | `lib/accounting/finecoMasterLedger.ts` (`applyFinecoMasterLedger`) | |
| FATTO | State machine PayPal (vista) | `lib/accounting/paypalStateMachine.ts` | |
| FATTO | Report fornitori esteri PayPal | `listPaypalForeignSupplierPayments.ts` | |

---

## 4. Pagina Contabilità e Finanza (interfaccia)

**Percorso:** `app/dashboard/finance/page.tsx` — tab: `bank` · `prima-nota` · `passivo` · `gateway` · `fisco`.  
**Ultimo commit UI finance (evidenza git):** `f81b8f84` **2026-09-06** — non «ferma da agosto»: ci sono commit a inizio settembre.  
**Controlli C1–C10:** non visibili in UI (solo export).

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Strip saldo Fineco + card quadratura | `page.tsx` ← `GET /api/dashboard/finance` ← `computeFinanceQuadratura`, `getFinecoManualBalance` | Include differenza saldo, reale/libro, 17900, quarantena, documenti mancanti. |
| FATTO | Tab Banca — upload estratti + movimenti | `BankStatementsPanel`, `BankMovementsStatementTable` ← `bank-statements*` | KPI entrate/uscite calcolati **client-side** sulle righe. |
| FATTO | Tab Prima Nota | `PrimaNotaTable` ← `historical-ledger` + `applyFiscalAuthorityHierarchy` + `applyFinecoMasterLedger` | Saldi progressivi client. |
| FATTO | Tab Passivo — SDI, XLSX, autofatture, SaaS, fioristi | `SdiInvoicesUploadBox`, `ReceivedInvoicesXlsxUploadBox`, `ForeignAutofattureUploadBox`, `SaasForeignExpensesPanel`, `FloristMissingInvoicesPanel` | |
| FATTO | Tab Gateway Stripe/PayPal | `GatewaySyncTable` ← `sync/gateways` (`buildGatewaySyncRows`, `computeGatewayQuadratura`) | |
| FATTO | Tab Fisco — scadenze, tax register, tax quarterly, CE, storico | `TaxQuarterlyPanel`; `getUpcomingDeadlines`; `calculateFinancialStatements`; `computeHistoricalPnl` | |
| FATTO | Download dossier XLSX dalla testata | commit `f81b8f84`; `tax-quarterly?format=xlsx` | |
| PARZIALE | Stesso concetto «saldo banca» calcolato in 3 modi | `computeFinanceQuadratura` vs somma movimenti tab Banca vs saldo Prima Nota | Rischio numeri discordanti a schermo. |
| PARZIALE | Fee gateway in tab Fisco vs tab Gateway | `buildTaxQuarterlyReport.paypalMonthlyFees` vs `computeGatewayQuadratura` | Pipeline diverse. |
| PARZIALE | Ricavi CE vs «stats.income» ledger nello stesso tab | `page.tsx` + `statements` | Due basi. |
| DA FARE | Indicazione fonte su ogni numero esposto | — | Esempio: capitale sociale **€11.410** hardcoded in `page.tsx`. |
| PARZIALE | Card «PayPal Real-time Balance» | `app/api/dashboard/finance/gateways/route.ts` | Placeholder **0** («in futuro»). Aspetto ingannevole. |
| DA FARE | Stato controlli C1–C10 in dashboard | — | Solo file export. |

---

## 5. Bonifica dei dati (lotti 0–6 e Fase 5)

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Lotto 0 — baseline sola lettura congelata | `docs/verbali/dossier_fase4b_lotto0_basi.md` (2026-09-06); backup Neon `backup-pre-fase4b-20260906` | Nessun batch write. |
| PARZIALE | Lotto 1 — rilavorato, **non eseguito** in write | `dossier_fase4b_lotto1_rilavorato.md`, `lotto1_dryrun.md` | Include tema riga fantasma paste €32.410,30. |
| FATTO | Lotto 2 — eseguito | batch `FASE4B_L2_20260906_205447` — `dossier_fase4b_lotto2_eseguito.md` | |
| FATTO | Lotto 3 — eseguito | batch `FASE4B_L3_20260906_215954` — `dossier_fase4b_lotto3_eseguito.md` | |
| FATTO | Lotto 4 — eseguito | batch `FASE4B_L4_20260907_123006` — `dossier_fase4b_lotto4_eseguito.md` / `.json` | Soft-reverse costi doppi. |
| FATTO | Lotto 5 — eseguito | batch `FASE4B_L5_20260907_131645` — `dossier_fase4b_lotto5_eseguito.md` | Reclass SDD→transito. |
| FATTO | Lotto 5-bis — eseguito | batch `FASE4B_L5BIS_20260907_133232` — `dossier_fase4b_lotto5bis_eseguito.md` | |
| FATTO | Lotto 6 fioristi — eseguito | batch `LOTTO6_FIORISTI_20260907_142600` — `dossier_fase4b_lotto6_fioristi_eseguito.md` | |
| FATTO | Fase 5 Passo A — **STOP** | `dossier_fase5_passo_a_stop.md`; `dossier_fase5_smontaggio_passo_a_stop.md`; freeze `FREEZE_UFFICIALE_POST_FASE5_PASSO_A_STOP` | Motivo: con `FISCAL_AUTHORITY_DEDUPE_ENABLED=false` i totali CE si muovono (Δ RAI ~−€5,2k / costi ~+€5,8k). Il layer nasconde doppioni ancora nel DB. Flag rimesso a `true` in codice. |
| DA VERIFICARE | Conteggio esatto entry residue doppie post-lotti oggi su Neon | richiederebbe query live non fatta in questo inventario | Verbali danno snapshot a date 06–07/09. |

---

## 6. Difetti noti ancora aperti

| Stato | Voce | Evidenza | Nota / cosa serve per chiudere |
|---|---|---|---|
| FATTO (difetto aperto) | C1 = 19 movimenti banca non in PN | `dossier_fase1_controlli_t2_2026.json` | Allineare estratto↔PN o spiegare esclusioni legittime riga per riga. |
| FATTO | C2 = €387,90 | stesso JSON | Stesso perimetro C1 + formula PN «tutto vs solo banca». |
| FATTO | C4 = €1.699,90 | stesso JSON | Completare registro corrispettivi / matching gateway. |
| FATTO | C5 = €18,40; C6 = 6; C7 = 12; C9 = 10 | stesso JSON | Bonifica documenti e classificazione. |
| FATTO | C10 fallisce (gamba dare / wallet PayPal) | `controlC10`; `gatewayTransitBalance.ts`; verbale lotto6 (0/38 dare wallet su ordini) | Scrivere gamba dare ordine→transito; wire saldo PayPal API. |
| FATTO | Dedupe a lettura obbligatoria per CE stabile | `FISCAL_AUTHORITY_DEDUPE_ENABLED`; Fase 5 STOP | Bonifica DB dei doppioni, poi spegnere il layer. |
| FATTO | Riga fantasma paste Fineco €32.410,30 | `dossier_fase4b_lotto0_basi.md`, lotto1 | Lotto 1 write mai eseguito. |
| FATTO | Gap Fineco Q1 ~€40 | `dossier_fase4b_lotto6_fioristi_verbale.md` | Riconciliare opening/sum/closing. |
| FATTO | Rimborsi dentro ricavi (12 / €44,88) | `dossier_fase4b_lotto1_rilavorato.md` | Riclassifica / esclusione da CE. |
| FATTO | Ordini `.eu` non tutti a libro (perimetro titolare) | METODO §8.1; verbali `dossier_fase4b_eu_*`; script export | Integrazione nel registro corrispettivi. |
| FATTO | PayPal Reporting API 403 | `paypalSync.ts` | CSV/webhook come percorso stabile o sbloccare API. |
| PARZIALE | Acquisti T2 gate €855,53 solo a export | `dossier_fase2_*.json` + `resolveAcquistiSheetRows` | Non risolve i doppioni a DB. |

---

## 7. Cose poco o mai considerate (dal codice)

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Provider banca Qonto + mock | `lib/financial/providers/qonto.ts`, `mock.ts`, `fineco.ts` | Fineco webhook HMAC → `app/api/v1/finance/webhook`. |
| FATTO | Webhook movimenti Fineco → ledger | `app/api/v1/finance/webhook` | Canale parallelo agli upload PDF. |
| FATTO | Registro commissioni partner / fioristi | `partnerCommissionRegister.ts`, `floristCompensationRegister.ts` | |
| FATTO | Scadenziario fiscale store | `financeDeadlineStore.ts`, `compliance/deadlines.ts` | |
| FATTO | ZIP ricevute cortesia clienti | `customerReceipt.ts`; API `download-receipts-zip` | Non è fattura SDI. |
| FATTO | Stripe service invoices PDF | modello `StripeServiceInvoice`; API `stripe-invoices/[id]/pdf` | |
| FATTO | Export sezione Excel dashboard | `exportSectionExcel.ts` | Separato dal dossier completo. |
| FATTO | Reparse fatture SDI a netto zero | `reparseZeroNetSdiInvoices.ts` | Usato nel sync Youdox. |
| FATTO | Abbonamenti prepagati esclusi da corrispettivi | `prepaidSubscriptionOrders.ts` | |
| FATTO | Sanitizzazione doppia scrittura ledger / PayPal | `ledgerDoubleEntrySanitize.ts`, `paypalLedgerSanitize.ts` | |
| FATTO | Audit integrità estratti | `bankStatements/auditBankStatementIntegrity.ts` | |
| FATTO | Dedupe linee banca cross-document | `deduplicateBankLinesDb.ts`, `fingerprint` unique | |
| PARZIALE | Script one-shot Fase 4b / 5 / metodo | `scripts/fase4b-*`, `fase5-*`, `dossier-*`, `investigate-metodo-*`, `audit-finance-*` | Molti non rientrano in CI; batch id hardcoded. |
| FATTO | Bug path import script Fase 5 | `scripts/fase5-dedupe-measure.ts` importa `../lib/financial/paypalStateMachine` ma il modulo è in `lib/accounting/` | Script probabilmente non lanciabile così com’è. |
| FATTO | Flag payout classification env | `FINANCE_PAYOUT_ID_CLASSIFICATION` | Default ON. |
| FATTO | Dedupe fiscale non più spegnibile via env | costante `true` in `fiscalAuthorityDedupe.ts` | Dopo STOP Fase 5. |
| DA VERIFICARE | Campi `grossAmount` / `stripeFee` / `netAmount` su Order: tasso di popolazione reale | schema Order | Usati da tax quarterly come fallback. |
| DA VERIFICARE | Quanti `canonicalDocKey` NULL restano su manual/saas | schema nullable | |
| DA VERIFICARE | Uso effettivo in produzione di `SupplierInvoice` vs ManualFinanceExpense | `prisma` `SupplierInvoice` | Modello parallelo «fornitori» dashboard. |
| PARZIALE | `lib/accounting` vs `lib/financial` | 4 file accounting = viste/macchine; financial = motore | Confusione di naming per chi legge. |
| FATTO | UI prodotti: IVA e costo standard fiorista | `Product.vatRatePercent`, `floristStandardCostCents`; `ClientProductsTable.tsx` | Alimentano catalogo, non ancora il dossier §8.3 / §6.4 contabile. |

---

## 8. Divergenze verbali / metodo ↔ codice (sintesi)

| Stato | Voce | Evidenza | Nota |
|---|---|---|---|
| FATTO | Metodo file = v1.7; export = v1.2 | `METODO_DOSSIER_FISCALE.md` vs `DOSSIER_METHOD_VERSION` | |
| FATTO | Metodo richiede foglio corrispettivi; codice lo rimanda a «Fase 3» | commento `taxQuarterlyXlsx.ts` | |
| FATTO | Metodo vieta paste banca; codice lo consente | `confirmFinecoPaste` | |
| FATTO | Verbali dichiarano controlli T2 misurati 08/09; UI non li mostra | JSON fase1 + assenza UI | |
| FATTO | Verbale/UI «ferma da agosto» vs git | `git log` finance UI fino a **2026-09-06** | Affermazione «da agosto» non sostenuta dal log. |
| FATTO | Commenti codice §6.4 acquisti vs metodo §6.5 | `dossierAcquistiBuild.ts` | Rinumerazione non propagata. |

---

## Come è stato costruito questo inventario

- Lettura di `docs/METODO_DOSSIER_FISCALE.md` v1.7 (§2–§12).
- Ispezione di `lib/financial/**`, `lib/accounting/**`, API finance dashboard/v1, `app/dashboard/finance`, componenti correlati, `prisma/schema.prisma` (modelli finance).
- Confronti con `docs/verbali/dossier_fase*` e `git log` su path finance.
- Nessuna modifica al codice applicativo in questa sessione oltre alla creazione di questo file.

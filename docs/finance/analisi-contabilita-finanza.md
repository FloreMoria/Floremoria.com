# Analisi Contabilità & Finanza — FloreMoria

**Data:** 2026-09-23  
**Tipo:** sola lettura (nessuna modifica a codice, database o configurazione)  
**Pagina:** `/dashboard/finance` — titolo schermo «Gestione Finanziaria e Prima Nota AI»  
**Destinatario:** titolare / non tecnico  

Questo documento spiega cosa c’è nella dashboard, da dove arrivano i numeri, dove può sbagliarsi, e cosa tenere, nascondere o unire.

---

## 0 — In una frase

La dashboard fa **tre mestieri diversi** nello stesso schermo: (1) preparare i documenti per il commercialista, (2) gestire banca e fatture giorno per giorno, (3) allarmare se qualcosa non torna. Oggi i mestieri si mescolano: due “registri vendite” usano regole diverse, tre “saldi banca” possono dire cose diverse, e tre liste “fatture fiorista” contano in modi diversi.

**Fonte fiscale ufficiale per i corrispettivi:** Excel commercialista (incassi Stripe/PayPal per **data di pagamento**), con snapshot congelato a trimestre chiuso.  
**Non è fonte fiscale:** la «vista operativa ordini / margini» (basata sulla data di creazione ordine).

---

## 1 — File che compongono la dashboard

### 1.1 Pagine e layout

| Percorso | Ruolo |
|----------|--------|
| `app/dashboard/finance/page.tsx` | Pagina unica Contabilità & Finanza (tab Fisco / Gestione / Controlli / Avanzate) |
| `app/dashboard/finance/layout.tsx` | Titolo scheda browser «Finanza & Contabilità» |
| `app/dashboard/finance/TaxQuarterlyPanel.tsx` | Blocco Registro Corrispettivi commercialista + (in Avanzate) vista operativa |
| `app/dashboard/MissionControlHub.tsx` | Pulsante hub «Contabilità» → `/dashboard/finance` |

### 1.2 Componenti UI (pannelli visibili dalla pagina)

| Percorso | Ruolo a schermo |
|----------|-----------------|
| `components/dashboard/finance/financePassivoUi.ts` | Stili e nomi dei 4 tab |
| `components/dashboard/DossierControlsBadge.tsx` | Semaforo controlli C1–C15 |
| `components/dashboard/FloristInvoiceWorkListPanel.tsx` | Lista «fatture fiorista da sollecitare» |
| `components/dashboard/PaymentOrderWorkListPanel.tsx` | Lista «pagamenti da collegare a ordini» |
| `components/dashboard/BankStatementsPanel.tsx` | Upload / archivio estratti Fineco |
| `components/dashboard/BankMovementsStatementTable.tsx` | Tabella movimenti estratto |
| `components/dashboard/ManualReconciliationPanel.tsx` | Coda «Da riconciliare» |
| `components/dashboard/PrimaNotaTable.tsx` | Prima Nota |
| `components/dashboard/PrimaNotaDetailDrawer.tsx` | Dettaglio riga Prima Nota |
| `components/dashboard/ManualExpenseModal.tsx` | Registra spesa / documento |
| `components/dashboard/SdiInvoicesUploadBox.tsx` | Upload / sync fatture SDI YouDOX |
| `components/dashboard/ReceivedInvoicesXlsxUploadBox.tsx` | Upload elenco fatture Excel |
| `components/dashboard/ForeignAutofattureUploadBox.tsx` | Autofatture estere |
| `components/dashboard/SaasForeignExpensesPanel.tsx` | Drawer spese SaaS estere |
| `components/dashboard/FloristMissingInvoicesPanel.tsx` | Registro completo fatture/ricevute fioristi |
| `components/dashboard/GatewaySyncTable.tsx` | Tabella sync Stripe/PayPal + quadratura wallet |
| `components/dashboard/ConnectPartnerChannelPanel.tsx` | Canale Stripe Connect partner |
| `components/dashboard/PaypalCsvUploadBox.tsx` | Import CSV PayPal |
| `components/dashboard/PartnerFeeInvoicesPanel.tsx` | Fatture fee master partner |
| `components/dashboard/HistoricalFiscalArchivePanel.tsx` | Archivio storico fiscale |
| `components/dashboard/UploadedInvoicesFileList.tsx` | Elenco file fatture caricate (passivo) |
| `components/dashboard/SdiInvoiceDetailDrawer.tsx` | Dettaglio fattura SDI |
| `components/dashboard/PaypalForeignSuppliersModal.tsx` | Fornitori PayPal esteri |

*Fuori pagina ma collegati:* `PartnerCommissionPanel`, `PartnerHistoricalLedgerSnippet` (schede partner/fiorista).

### 1.3 API (route sotto `/api/dashboard/finance/…`)

**Nucleo pagina:** `route.ts` (ledger + statements + quadratura), `fineco-balance`, `dossier-controls`, `tax-quarterly`, `commercialista-corrispettivi`, `tax-register`, `download-receipts-zip`, `stripe-sync`, `stripe-invoices/[id]/pdf`.

**Banca:** `bank-statements` (+ upload, paste, download, delete documento, linee, suggestions, re-reconcile), `reconciliation/pending`.

**Gateway:** `gateways`, `sync/stripe`, `sync/paypal`, `sync/paypal/upload-csv`, `sync/gateways`, `gateway-declared-balance`, `gateway-transit-balance`, `connect-partner`.

**Passivo / spese:** `manual-expenses` (+ file), `saas-invoices` (+ upload, zip, delete), `invoices/upload`, `upload-xlsx`, `upload-foreign`, `uploads`, `autofatture` (+ generate, pdf, xml), `paypal-foreign-suppliers`.

**Fioristi / collegamenti:** `florist-missing-invoices`, `florist-invoice-work-list`, `payment-order-work-list`, `partner-fee-invoices`.

**Libro:** `historical-ledger` (+ export).

**YouDOX (passivo esterno):** `app/api/v1/finance/youdox/*` (sync, health, sent, download).

**Webhook banca (non UI):** `app/api/v1/finance/webhook`.

### 1.4 Servizi di calcolo (`lib/financial/`)

I più importanti per capire i numeri:

| File | Cosa decide |
|------|-------------|
| `dossierCorrispettiviBuild.ts` | Righe corrispettivi da **incassi gateway** (data pagamento) |
| `corrispettiviSalesFilter.ts` | Esclude non-vendite PayPal, gemelle, rimborsi |
| `commercialistaCorrispettiviXlsx.ts` | Excel F1+F2 commercialista + banner «trimestre in corso» |
| `corrispettiviRegisterSnapshot.ts` | Congelamento trimestre (T3 dal 1 ottobre) |
| `taxRegister.ts` | Vista operativa per **createdAt** ordine (non fiscale) |
| `prepaidSubscriptionOrders.ts` | Regole carnet: padre = incasso, pose = €0 ricavo |
| `euOrders2026Match.ts` | Abbinamento vendite .eu ↔ gateway |
| `taxQuarterly.ts` / `taxQuarterlyXlsx.ts` | Dossier fiscale interno multi-foglio |
| `financeQuadratura.ts` | KPI differenza saldo / non abbinati / documenti / 17900 |
| `dossierFiscalControls.ts` | Controlli C1–C15 |
| `statements.ts` | Conto economico / stato patrimoniale gestionali |
| `floristCompensationRegister.ts` / `floristMissingInvoices.ts` / `floristDocStatus.ts` | Compensi e documenti fiorista |
| `stripeSync.ts` / `paypalSync.ts` / `gatewaySyncRows.ts` / `gatewayQuadratura.ts` | Sync e quadratura wallet |
| `bankStatements/*` | Parse Fineco, match, upload |
| `manualReconciliationQueue.ts` / `reconciliation.ts` | Coda da riconciliare |
| `historicalLedger*` / `ledgerStore.ts` | Libro permanente |
| `compliance/deadlines.ts` | Scadenziario S.r.l. (calendario fisso) |
| `companyBankDetails.ts` | P.IVA, IBAN Fineco (costanti) |

Altri file nella cartella (circa 100) supportano import SDI, autofatture, PayPal CSV, Erario IVA, dedupe, ecc.

### 1.5 Modelli Prisma usati (tabelle)

| Modello | Uso tipico in Contabilità |
|---------|---------------------------|
| `Order` (+ items, partner) | Ordini, compensi fiorista, note carnet/.eu |
| `StripeFinanceMovement` | Incassi, fee, payout, rimborsi Stripe |
| `StripeServiceInvoice` | Fatture commissioni Stripe |
| `CustomerOrderReceipt` | Ricevuta cliente allineata |
| `BankStatementDocument` / `BankStatementLine` | Estratti Fineco |
| `ManualFinanceExpense` | Fatture/spese caricate a mano o da SDI |
| `SaasForeignInvoice` | Fatture SaaS estere |
| `FinancialLedgerEntry` | Scritture Prima Nota / storico |
| `SystemState` | Saldo Fineco manuale, meta sync, snapshot controlli |
| `CorrispettiviRegisterSnapshot` | Excel commercialista congelato |
| `PartnerFeeMonthClose` | Chiusura fee master partner |
| `ConnectPartnerCharge` | Incassi Connect |
| `Partner` / `Supplier` / `SupplierInvoice` | Anagrafiche e documenti |
| `DeliveryProof` | (indiretto) stato consegna |

Movimenti PayPal spesso vivono anche in `SystemState` / cache sync, non solo in una tabella omonima.

### 1.6 Job / cron collegati

**Nessun cron automatico dedicato alla Contabilità** (né freeze trimestrale, né sync Stripe notturno obbligatorio).  
Operazioni tipiche: **pulsanti manuali** in dashboard (Sincronizza, Sync Stripe/PayPal, YouDOX, upload estratto).

Script utili ma **non schedulati dalla UI** (si lanciano a mano da terminale):  
`scripts/freeze-corrispettivi-snapshots-2026.ts`, vari `audit-finance-*`, `preview-commercialista-*`.

Cron esistenti nel progetto (verbali, social, blob, postman) **non** aggiornano i registri fiscali.

---

## 2 — Cosa vedi a schermo (per sezione)

Organizzazione attuale a **4 tab**: Fisco · Gestione · Controlli · Avanzate.  
In più: pulsanti sempre in alto (header).

Legenda colonne: **Scrive?** = modifica dati in database o archivi; **Uso** = stima realistica.

### 2.1 Header (sempre visibile)

| Nome a schermo | A cosa serve | Da dove prende i dati | Scrive? | Chi / quanto |
|----------------|--------------|------------------------|---------|--------------|
| Titolo «Gestione Finanziaria e Prima Nota AI» | Identifica la pagina | — | No | Tutti / sempre |
| **Scarica Dossier Fiscale (.xlsx)** | Scarica Excel interno completo del periodo | Aggregato dossier (`tax-quarterly`) | Solo download | Mensile / a fine trimestre |
| **Registra Spesa / Documento** | Registra una spesa o fattura con allegato | Scrive `ManualFinanceExpense` (+ eventuale Prima Nota) | **Sì** | Quotidiano / settimanale |
| **Sincronizza** | Aggiorna Stripe/PayPal e ricarica i numeri | API sync + ricarica ledger | **Sì** (aggiorna movimenti sync) | Quasi quotidiano in chiusura; altrimenti settimanale |

### 2.2 Tab Fisco

| Nome a schermo | A cosa serve | Fonte dati | Scrive? | Uso |
|----------------|--------------|------------|---------|-----|
| **Registro Corrispettivi (commercialista)** + selettore trimestre/mese | Scegliere il periodo e scaricare il file per il commercialista | Incassi `StripeFinanceMovement` (+ PayPal filtrati) per **data pagamento**; se trimestre chiuso → snapshot | Download; freeze automatico a chiusura | Mensile / trimestrale |
| Pulsante **Registro Corrispettivi (commercialista)** | Genera F1+F2 Excel | Come sopra; T3 aperto = live + scritta «Trimestre in corso — dati provvisori al [data]» | Congela solo se trimestre chiuso | Trimestrale |
| **ZIP ricevute** | Scarica ricevute clienti del periodo | Ricevute ordine | Download | Raro |
| **Dossier fiscale completo (interno)** | Excel multi-foglio uso interno | `tax-quarterly` | Download | Mensile |
| **Sync Stripe** (fee) | Scarica fatture commissioni Stripe | API Stripe → `StripeServiceInvoice` | **Sì** | Mensile |
| **Fatture commissioni Stripe / fee PayPal** | Elenco fee documentate del periodo | Fatture syncate / aggregati PayPal | Lettura (+ PDF) | Mensile |
| **Fatture fee master partner** | Registra/controlla fattura fee aggregatore | `PartnerFeeMonthClose` + Connect | **Sì** | Mensile |
| Upload **SDI / YouDOX**, **XLSX ricevute**, **Autofatture estere** | Caricare documenti di acquisto | → `ManualFinanceExpense` / autofatture | **Sì** | Settimanale / mensile |
| **Gestione SaaS / Spese estere** | Archivio Cursor, Vercel, ecc. | `SaasForeignInvoice` | **Sì** (upload/delete) | Mensile |
| **Registro fatture / ricevute fioristi** | Per ogni consegna: manca fattura? abbinata? bonifico? | Ordini + spese + linee banca; esclude padri carnet | **Sì** (stati, match) | Settimanale |
| **Scadenziario & Adempimenti S.r.l.** | Promemoria IVA, bilancio, obblighi startup | Calendario fisso in codice (`compliance/deadlines`) | No (solo lettura) | Mensile occhio |
| **Archivio Storico Fiscale** | Consultare il libro permanente | `FinancialLedgerEntry` / historical ledger | Lettura (+ eventuali correzioni pannello) | Raro / chiusure |

### 2.3 Tab Gestione

| Nome a schermo | A cosa serve | Fonte dati | Scrive? | Uso |
|----------------|--------------|------------|---------|-----|
| **Banca Fineco — upload estratti** | Caricare PDF/CSV/XLSX o incolla movimenti | `BankStatementDocument` / `Line` | **Sì** (upload; delete documento possibile) | Mensile (dopo estratto) |
| **Movimenti estratto conto** | Vedere e abbinare singole righe | Linee estratto | Match = **sì** | Dopo ogni upload |
| Scorciatoia **Da riconciliare** | Porta alla coda scoperte | Conteggio non abbinati | No | Quotidiano se backlog |
| Pannello riconciliazione (nella stessa Gestione) | Abbinare movimenti banca ↔ ordini/spese | Linee UNMATCHED + suggerimenti | **Sì** | Quotidiano operativo |
| **Prima Nota** | Libro scritture entrate/uscite | Ledger / historical | Lettura + export; correzioni limitate | Settimanale |
| **Stripe / PayPal balance** | Saldo live nei wallet | API gateway live | No | Occasionale |
| **Upload CSV PayPal** | Se l’API non basta | Import → store sync | **Sì** | Raro / emergenza |
| **Sincronizza Stripe / PayPal** | Aggiornare movimenti gateway | Sync API | **Sì** | Settimanale |
| **Stripe Connect partner** | Quarto canale / registrazione manuale | `ConnectPartnerCharge` | **Sì** | Raro |
| **Tabella sync gateway** | Elenco movimenti COM/EU/PayPal/Connect | Sync DB | Lettura (+ filtri) | Settimanale controllo |
| **Quadratura Stripe / PayPal** (card nella tabella) | Fee + rimborsi + payout vs accrediti Fineco | Sync + regole `gatewayQuadratura` | No | Mensile |
| **Conto Economico Gestionale** | Ricavi e costi «da bilancio gestionale» | `calculateFinancialStatements` / historical ledger | No | Mensile occhio |
| **Stato Patrimoniale** / **Stima IRES-IRAP** | Cassa, debiti, stime imposte + export JSON | Stesso motore statements | Download JSON | Raro |

### 2.4 Tab Controlli

| Nome a schermo | A cosa serve | Fonte dati | Scrive? | Uso |
|----------------|--------------|------------|---------|-----|
| **Controlli dossier C1–C15** | Semaforo: i numeri quadrano? | Ultimo run controlli + riesecuzione | Riesegui = **sì** (salva esito in SystemState) | A chiusura periodo |
| **Lista lavoro fatture fiorista** | Chi sollecitare | Ordini pagati senza documento | Lettura | Settimanale |
| **Pagamenti ↔ ordini da collegare** | Sistemare pagamenti orfani | Gateway vs Order | **Sì** (collegamento) | Quando C11 rosso |
| **Differenza Saldo Banca** | Reale Fineco vs libro estratti | Saldo manuale + estratti | Click → edit saldo | Dopo aggiornamento saldo |
| **Movimenti da riconciliare** | Quanti ancora scoperti | Conteggio UNMATCHED | No (naviga) | Quotidiano se backlog |
| **Documenti mancanti** | Quanti documenti fiorista in attesa | Contatore quadratura | No | Settimanale |
| **17900 Da classificare** | Partite ancora senza etichetta | Ledger / quarantena | No | Mensile |

### 2.5 Tab Avanzate

| Nome a schermo | A cosa serve | Fonte dati | Scrive? | Uso |
|----------------|--------------|------------|---------|-----|
| **Gestione Fornitori** (link) | Anagrafica fuori pagina | `/dashboard/fornitori` | Fuori | Raro |
| **Fineco e IBAN · Dati societari** | Copiare P.IVA, IBAN, sede | Costanti azienda + saldo Fineco manuale | Saldo = **sì** | Quando serve IBAN |
| **Vista operativa ordini / margini (non fiscale)** | Margine e liquidazione fiorista per data **creazione ordine** | `tax-register` (`Order.createdAt`) | Modifica riga = **sì** | Raro; non per LIPE |
| **Log grezzi checkout Stripe** | Debug: checkout andato a buon fine? | Sessioni da `gateways` | No | Raro / incidente |

---

## 3 — Casi reali: i calcoli sono corretti?

### 3.1 Ordini carnet (padre con incasso, pose a €0)

**Regola voluta (METODO §13 e codice `prepaidSubscriptionOrders.ts`):**

- L’**ordine padre** porta l’incasso del cliente → entra nei **corrispettivi** (via pagamento Stripe/PayPal).
- Le **consegne successive (pose)** non sono nuove vendite → **non** devono creare un secondo corrispettivo; restano per il **costo fiorista**.

**Cosa fa davvero il sistema:**

| Motore | Padre carnet | Pose (€0 / ricorrenza) | Rischio |
|--------|--------------|------------------------|---------|
| **Commercialista / gateway** | Conta l’incasso alla **data pagamento** | Non crea ricavo se non c’è un secondo charge | **Corretto** per IVA/LIPE se il padre è collegato al pagamento |
| **Vista operativa (tax-register)** | Include se non è `PENDING`/`CANCELLED` e ha gross/tx | Esclude le pose con `isPrepaidSubscriptionPoseOrder` | Se il padre resta `PENDING` per sbaglio, **manca** dal tax-register (già successo su FT-MC-26-007) ma resta nel gateway |
| **Registro fioristi** | Padre **escluso** (non è una consegna) | Pose incluse se hanno compenso > 0 | **Corretto** per il passivo fiorista |

**Verdetto:** non c’è doppio conteggio fiscale sul motore commercialista, **a patto** che le pose non abbiano un falso “pagamento gateway” e che il padre sia nello stato giusto. Il rischio tipico è **conteggio mancante** nella vista operativa se lo stato ordine è sbagliato — non sul file commercialista.

### 3.2 Ordini .eu inseriti a mano sul .com (data inserimento ≠ data reale)

**Due percorsi:**

1. **Import storico corretto** (`importEuHistoricalOrder`): salva `createdAt` = data reale ordine; collega la TX gateway. Non scrive Prima Nota.
2. **Inserimento manuale “grezzo”** in dashboard: `createdAt` può essere “oggi”, mentre il cliente ha pagato mesi prima.

**Nei totali per periodo:**

| Motore | Quale data usa | Effetto se createdAt è sbagliata |
|--------|----------------|----------------------------------|
| **Commercialista** | Data del **movimento Stripe/PayPal** (`createdAtStripe` / data PayPal) | Il periodo fiscale resta quello del **pagamento reale**. La data sbagliata sull’ordine **non sposta** il corrispettivo. |
| Match lista .eu | Nome + data lista ±3 giorni ↔ gateway; importo = sempre lordo gateway | Aiuta a etichettare, non a inventare l’importo |
| **Vista operativa / tax-register** | `Order.createdAt` | **Può mettere la vendita nel trimestre sbagliato** |
| **Compensi fiorista / giorni di attesa** | Preferisce `deliveryDate`, altrimenti `createdAt` | Consegna valorizzata → mese consegna ok; altrimenti eredita l’errore di inserimento |

**Verdetto:** per il **commercialista** siete protetti dalla data di pagamento gateway. Per **report gestionali e liste fiorista** senza `deliveryDate`, una data di inserimento sbagliata **distorce** i periodi. C12 (controllo) segnala proprio quando data ordine e data pagamento divergono di oltre 24 ore.

### 3.3 Pagamenti ai fioristi (bonifico mensile, fattura a fine mese / inizio mese successivo)

**Regola di metodo (METODO):**

- Ricavo: trimestre del **pagamento cliente**.
- Costo fiorista: trimestre della **consegna** (non del bonifico).
- La fattura del fiorista spesso arriva a fine mese o a inizio mese successivo: è normale.

**Cosa fa la dashboard:**

- Tiene lo **stato documento** (in attesa / fattura associata / scontrino) e lo **stato liquidazione** (`BONIFICATO`, ecc.).
- Abbina il **bonifico Fineco** alla riga ordine usando la **data contabile del movimento banca**.
- La data di riferimento per “giorni di attesa” è `deliveryDate` se c’è, altrimenti `createdAt`.
- Il filtro principale del registro fioristi parte dagli ordini con `createdAt` dall’inizio anno (non un puro “mese di competenza consegna”).

**Verdetto:**  
- Per **“ho pagato il fiorista?”** e **“ho la fattura?”** → utile e sostanzialmente allineato alla cassa.  
- Per **“questo costo appartiene al mese X di competenza”** → **non c’è un motore unico affidabile**: il bonifico di ottobre per consegne di settembre resta sul mese del bonifico in banca; la regola “costo nel mese consegna” è dichiarata nel METODO ma **non è applicata in automatico** come un bilanciamento di competenza. Va fatta (o confermata) in sede di chiusura con il commercialista / rettifiche annuali.

### 3.4 Stripe: incassi, commissioni, rimborsi — sono riconciliati?

**Tre livelli distinti (non sono lo stesso controllo):**

1. **Corrispettivi:** charge/payment del periodo → ricavo; **rimborsi esclusi** come secondo ricavo (`corrispettiviSalesFilter`). Charge interamente rimborsata stesso giorno esclusa.  
2. **Quadratura wallet (Gestione):** lordo − fee − rimborsi − payout verso Fineco (card nella tabella sync).  
3. **Controlli dossier (es. C4, C10, C13):** confrontano pezzi diversi (gateway vs registro, transito, saldo dichiarato).

**Verdetto:** c’è una **riconciliazione strutturata ma non automatica al 100%**. Funziona se: sync Stripe aggiornato, estratto Fineco caricato, payout abbinati. Resta fragile su: timeout sync, canale Connect spesso manuale, PayPal a pezzi, differenze tra saldo **live** Stripe e libro. **Non** trattare la card “Quadratura Stripe” e il controllo C13 come se fossero lo stesso numero.

---

## 4 — Problemi strutturali

### 4.1 Funzioni duplicate o sovrapposte

| Tema | Dove si vede più volte | Problema |
|------|------------------------|----------|
| «Quanto abbiamo venduto?» | Excel commercialista ↔ vista operativa ↔ Conto economico | Tre risposte possibili |
| «Fatture fiorista mancanti» | KPI Controlli ↔ lista lavoro ↔ registro passivo Fisco | Tre conteggi |
| «Saldo in banca» | Saldo Fineco manuale ↔ differenza quadratura ↔ cassa nello Stato patrimoniale | Tre casse |
| Dossier Excel | Pulsante header ↔ pulsante in Fisco | Stessa famiglia, doppio ingresso |
| Commissioni Stripe | Fatture fee Fisco ↔ colonna fee vista operativa ↔ costo CE ↔ card quadratura | Stesso concetto, somme diverse |
| Sync gateway | Pulsante header «Sincronizza» ↔ pulsanti in Gestione | Stesso mestiere ripetuto |

### 4.2 Inutilizzate, incomplete o “morte”

| Elemento | Nota |
|----------|------|
| Provider **Qonto** / **mock** banca | Codice presente; in produzione si usa Fineco |
| Cron freeze corrispettivi | Script esiste, **non** gira da solo: oggi il freeze parte al download post-chiusura |
| Vista operativa etichettata un tempo come “registro corrispettivi” | Rinominata e spostata in Avanzate; la route API `tax-register` resta (serve alla vista) |
| PayPal come “ciclo vendite” | Spesso incompleto; CSV di emergenza |
| Connect partner | Lettura API incompleta → spesso registrazione a mano |
| YouDOX | Dipende da canale esterno; sync a blocchi / timeout |
| Scadenziario | Non verifica se l’adempimento è stato fatto: solo calendario |

### 4.3 Dati mostrati ma discutibili

- Conto economico «Ricavi» **≠** totale F2 commercialista.  
- Sottovoce «Ordini manuali & B2B» mescola ledger e altre somme.  
- Stima IRES/IRAP = **indicativa**, non dichiarazione.  
- Badge “Documenti mancanti” può **non** coincidere con la lista lavoro fiorista.  
- Trimestre in corso: il file commercialista è **provvisorio** (scritto in F1) — non consegnarlo come definitivo.

### 4.4 Rischi di cancellazione / perdita dati

| Azione | Rischio |
|--------|---------|
| **Elimina estratto conto** (API DELETE bank-statements) | Può rimuovere documento e linee: **perdita operativa** se non avete il PDF originale altrove |
| **Delete fattura SaaS** | Cancella riga archivio SaaS |
| Riconciliazione / annulla match | Non dovrebbe cancellare l’ordine; modifica lo stato di abbinamento |
| Modifica riga vista operativa (PATCH tax-register) | Cambia campi finanziari sull’**ordine** (compenso, note, lordo…) — attenzione: non è un “appunto” innocuo |
| Snapshot corrispettivi | Versioni precedenti restano consultabili; rettifica crea nuova versione — **non** cancella lo storico freeze |
| Soft-delete ordini (`deletedAt`) | Gli ordini test/cancellati sono esclusi dai report; non sono hard-delete dalla UI finance tipica |

**Principio già nel METODO:** le rettifiche di competenza non devono riscrivere le righe originali. Nella pratica UI, le azioni più pericolose sono **delete estratto** e **PATCH ordine** dalla vista operativa.

---

## 5 — Tabella riassuntiva

| Funzione | A cosa serve | Uso stimato | Proposta | Motivo |
|----------|--------------|-------------|----------|--------|
| Registro Corrispettivi commercialista (Fisco) | Documento vendite per commercialista / LIPE | Mensile–trimestrale | **TENERE** | Unica fonte fiscale dichiarata |
| Snapshot trimestre chiuso | Non far cambiare i numeri già consegnati | Automatico a chiusura | **TENERE** | Fiducia e ripetibilità |
| Vista operativa ordini/margini (Avanzate) | Margine e liquidazione fiorista | Raro | **TENERE** (nascosta) | Utile; pericolosa se scambiata per fiscale |
| Dossier fiscale completo (2 ingressi) | Excel interno multi-foglio | Mensile | **UNIRE** | Un solo pulsante primaria |
| Scarica ZIP ricevute | Archivo ricevute clienti | Raro | **TENERE** | Leggero |
| Sync Stripe fee + elenco fatture fee | Documentare commissioni | Mensile | **TENERE** | Serve a C14/reverse charge |
| Fee PayPal aggregate | Stesso per commissioni PayPal | Mensile | **TENERE** | |
| Partner fee invoices | Fee master / C14 | Mensile | **TENERE** | |
| Upload SDI / XLSX / autofatture | Documenti di acquisto | Settimanale | **TENERE** | Cuore passivo |
| SaaS estere | Spese software estere | Mensile | **TENERE** | |
| Registro fioristi completo | Stato fattura + bonifico per ordine | Settimanale | **TENERE** | Operativo |
| Lista lavoro fiorista (Controlli) | Solo “chi sollecitare” | Settimanale | **UNIRE** col registro | Stesso tema, meno numeri discordanti |
| KPI «Documenti mancanti» | Allarme conteggio | Settimanale | **UNIRE** / allineare | Oggi può mentire vs liste |
| Scadenziario S.r.l. | Promemoria obblighi | Mensile | **TENERE** | Non tocca i dati |
| Archivio storico fiscale | Libro permanente | Raro | **TENERE** | Chiusure |
| Upload estratti Fineco | Base di tutto il resto | Mensile | **TENERE** | Critico |
| Movimenti + Da riconciliare | Abbinare banca | Quotidiano se backlog | **TENERE** | Cuore operativo |
| Prima Nota | Libro scritture | Settimanale | **TENERE** | |
| Sync Stripe/PayPal (Gestione + header) | Aggiornare movimenti | Settimanale | **UNIRE** | Un solo posto “Aggiorna pagamenti” |
| Tabella sync gateway | Controllo operativo wallet | Settimanale | **TENERE** | Non fiscale |
| Quadratura Stripe/PayPal card | Controllo wallet | Mensile | **TENERE** | Con etichetta «non è LIPE» |
| Connect partner | Canale aggregatore | Raro | **TENERE** (Avanzate ok) | Incompleto |
| CSV PayPal | Emergenza sync | Raro | **NASCONDERE** in Avanzate | Workaround |
| Balance live Stripe/PayPal | Saldo wallet adesso | Occasionale | **NASCONDERE** in Avanzate | Confonde col libro |
| Log grezzi checkout | Debug pagamento | Raro | **NASCONDERE** (già Avanzate) | |
| Controlli C1–C15 | Semaforo chiusura | A chiusura | **TENERE** | |
| Lista pagamenti↔ordini | Sistemare orfani | Quando serve | **TENERE** | |
| Fascia KPI saldo / non abbinati / 17900 | Allarmi | Quotidiano–mensile | **TENERE** | |
| Saldo Fineco manuale + IBAN | Quadro cassa e coordinate | Quando serve | **TENERE** | Aggiornare il saldo o mente |
| CE / SP / IRES gestionali | Vista “bilancino” | Mensile occhio | **NASCONDERE** o etichettare «non ufficiale» | Non sostituisce commercialista |
| Link Gestione Fornitori | Anagrafica | Raro | **NASCONDERE** (già Avanzate) | |
| Delete estratto / delete SaaS | Pulizia archivi | Raro | **NASCONDERE** dietro conferma forte | Rischio perdita |
| Provider Qonto/mock | Codice legacy | Mai in UI | **ELIMINARE** (solo codice, non ora) | Rumore manutenzione |

---

## 6 — Due scenari di semplificazione

### A) Minimo — nascondere subito, senza toccare la logica

Obiettivo: meno confusione, stessi calcoli sotto.

1. Lasciare in evidenza solo: **Fisco → Registro Corrispettivi commercialista**, upload documenti, registro fioristi, scadenziario.  
2. In **Gestione**: solo Banca + Da riconciliare + Prima Nota + un solo blocco «Aggiorna pagamenti».  
3. Spostare/tenere piegati (già in parte in Avanzate): balance live, log checkout, CSV PayPal, Connect, CE/SP/IRES, vista operativa.  
4. In Controlli: un’unica card «Fatture fiorista» (nascondere il doppio KPI se discordante, o mostrare solo la lista).  
5. Un solo pulsante «Scarica dossier» (togliere il gemello).  
6. Etichette chiare ovunque: **«Ufficiale commercialista»** vs **«Solo interno / non fiscale»**.

Nessuna cancellazione di API o tabelle: solo UI.

### B) Ristrutturazione — 3–5 viste essenziali

| Vista | Domanda a cui risponde | Contenuto |
|-------|------------------------|-----------|
| **1. Chiudi il trimestre** | «Cosa consegno al commercialista?» | Periodo, stato freeze/provvisorio, download F1+F2, fee Stripe/PayPal, semaforo C1–C15, promemoria Fineco caricato |
| **2. Banca e abbinamenti** | «I soldi sul conto tornano?» | Upload estratto, coda da riconciliare, KPI non abbinati, saldo Fineco |
| **3. Documenti e fioristi** | «Ho tutte le fatture? Ho pagato i fioristi?» | Passivo SDI/SaaS/autofatture + un solo registro fioristi (lista lavoro inclusa) |
| **4. Pagamenti gateway** *(opzionale)* | «Stripe/PayPal sono aggiornati?» | Sync unico, tabella movimenti, quadratura wallet, Connect |
| **5. Libro e stime** *(opzionale, Avanzate)* | «Come stiamo andando?» | Prima Nota, CE/SP, IRES, vista operativa, log debug |

Regola d’oro della ristrutturazione: **un solo numero “vendite del periodo” in UI**, e quello è il commercialista (cassa/pagamento). Tutto il resto si chiama esplicitamente in altro modo.

---

## 7 — Mappa mentale per il titolare

```
Cliente paga (Stripe/PayPal)
        ↓
  CORRISPETTIVO  ←── data del pagamento  ←── file commercialista (ufficiale)
        ↓
Soldi arrivano su Fineco (payout)  ←── estratto + riconciliazione
        ↓
Fiorista consegna  ←── costo / fattura / bonifico (operativo, mese consegna in teoria)
```

Se due schermate dicono due totali diversi sulla stessa domanda «quanto abbiamo venduto?», **vince il file commercialista**; l’altra è gestionale o da sistemare.

---

## 8 — Riferimenti già prodotti (sola lettura)

- `docs/verbali/2026-09-22-inventario-dashboard-contabilita.md` — inventario 42 sezioni (prima del riordino a 4 tab)  
- `docs/verbali/2026-09-22-diagnosi-registro-corrispettivi-drift.md` — perché commercialista ≠ tax-register  
- `docs/METODO_DOSSIER_FISCALE.md` — regole ufficiali (§8 corrispettivi, §11 competenza, §13 carnet)  
- `docs/INVENTARIO_CONTABILITA.md` — inventario tecnico più vecchio  

---

*Fine analisi. Nessun file di codice, nessun database e nessun job è stato modificato per produrre questo documento, oltre alla creazione di questo markdown.*

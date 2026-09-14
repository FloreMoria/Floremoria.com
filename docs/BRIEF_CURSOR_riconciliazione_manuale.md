# BRIEF per Cursor — Pannello di riconciliazione manuale

Data: 14/09/2026 · Analisi: Claude (sessione Cowork) · Richiesto da: Salvatore

---

## 1. Problema, misurato sui dati di produzione

**93 righe di estratto conto su 193 non sono abbinate a nulla.** Sono distribuite
su 9 documenti diversi e oggi si possono lavorare solo aprendo un estratto conto
alla volta, riga per riga:

| Documento | Righe | Scoperte |
|---|---|---|
| 2 Trimestre Fineco 2026.pdf | 72 | 31 |
| 1° trimestre Fineco.pdf | 41 | 22 |
| fineco-paste 21/08 | 39 | 18 |
| fineco-paste 26/08 | 15 | 14 |
| altri 5 documenti | 26 | 8 |

Conseguenza sui controlli di quadratura (misurazione del 09/09):
C1 completezza banca fallito con 18 righe di scarto (estratto 72 · Prima Nota 54),
C2 scarto 154,42 €, C4 scarto 645,43 € fra incassi gateway e corrispettivi,
C9 18 movimenti di transito classificati come ricavo o costo.

Nessuno di questi si chiude con più automatismo: quando un movimento non porta un
riferimento oggettivo, solo una persona può dire a cosa corrisponde. Serve lo
strumento per farlo in fretta.

## 2. Cosa esiste già — NON riscriverlo

- `GET /api/dashboard/finance/bank-statements/[id]/lines/[lineId]/suggestions`
  → `suggestMatchesForLine()` in `lib/financial/reconciliation.ts`: restituisce
  i candidati per una riga.
- `PATCH /api/dashboard/finance/bank-statements/[id]/lines/[lineId]`
  → abbinamento manuale completo: accetta `matchType`, `matchedOrderId`,
  `expenseId`, `matchNotes`, `asMatched`; applica `coerceBankCategoryForAmount`,
  scrive il ledger con `appendLedgerEntries` e marca la spesa riconciliata.
- `GET /api/dashboard/orders/search?q=` → ricerca ordini per codice, defunto, città.
- UI esistente: `components/dashboard/BankStatementsPanel.tsx` e
  `BankMovementsStatementTable.tsx` (già consumano entrambi gli endpoint sopra).

Il lavoro è quasi tutto di **aggregazione e interfaccia**, non di logica contabile.

## 3. Cosa manca

### 3.1 Endpoint elenco unificato (nuovo)

`GET /api/dashboard/finance/reconciliation/pending`

Restituisce, in una sola chiamata, TUTTE le righe non abbinate di TUTTI gli
estratti conto dell'anno fiscale: `lineId`, `documentId`, data contabile e valuta,
descrizione, importo, `matchStatus`, nome file del documento di provenienza.
Parametri: `year`, `from`/`to`, `sort` (data o importo), `limit`/`cursor`.

**NON** calcolare qui i suggerimenti per tutte le righe: con 93 righe farebbe la
stessa fine del sync YouDOX, che andava in timeout a 120 secondi. I suggerimenti
si caricano su richiesta, una riga alla volta (vedi 3.2).

Restituisci anche un riepilogo: numero righe scoperte, totale entrate e uscite non
riconciliate, righe più vecchie.

### 3.2 Pannello UI

Nuovo componente, raggiungibile da un tab o da un pulsante "Da riconciliare (93)"
in Contabilità, con il contatore sempre visibile.

Layout a due colonne:

- **Sinistra — le righe da sistemare.** Elenco scorrevole, una riga per movimento:
  data, descrizione, importo con segno evidente, documento di provenienza.
  Filtri per periodo, per segno (entrate/uscite), per testo. Ordinamento per data
  o per importo decrescente, così Salvatore può partire dai movimenti che pesano.
- **Destra — la decisione sulla riga selezionata.** Alla selezione, carica i
  suggerimenti da `.../lines/[lineId]/suggestions` (prefetch della riga successiva,
  così lo scorrimento è fluido). Mostra ogni candidato con motivo e punteggio.
  Sotto i suggerimenti: una ricerca libera fra gli ordini
  (`/api/dashboard/orders/search`) e una scelta di categoria contabile dalle
  opzioni di `lib/financial/bankCategoryOptions.ts`, per i movimenti che non
  corrispondono a un ordine (oneri bancari, imposte, giroconti, spese senza
  documento). Campo note facoltativo.

Conferma con un clic → `PATCH` sull'endpoint esistente → la riga sparisce dalla
lista, il contatore scende, la selezione passa automaticamente alla riga successiva.
Deve essere possibile lavorare da tastiera: frecce per scorrere, Invio per
confermare il primo suggerimento, Esc per saltare.

### 3.3 Annullare è obbligatorio

Su 93 decisioni a mano qualche errore è certo. Serve:
- un pulsante **Annulla abbinamento** sulle righe già riconciliate, che riporti
  la riga a `UNMATCHED` e rimuova le scritture di ledger generate da
  quell'abbinamento (non lasciare righe orfane nel libro);
- una vista "ultime 20 riconciliazioni manuali" con la data e cosa è stato deciso,
  per ritrovare e correggere un errore senza cercarlo a mano.

### 3.4 Salvataggio a prova di interruzione

Ogni conferma è una scrittura indipendente e immediata: niente "salva tutto" alla
fine. Se il browser si chiude a metà lavoro, quello che è stato confermato resta.

## 4. Vincoli

- Riusa gli endpoint esistenti per l'abbinamento: l'unico endpoint nuovo è
  l'elenco unificato. Non duplicare `suggestMatchesForLine` né la logica di ledger.
- Nessuna scrittura senza una conferma esplicita di Salvatore. Il pannello non
  abbina mai da solo, nemmeno i suggerimenti a punteggio massimo.
- Attenzione ai tempi di risposta: ogni endpoint deve stare sotto i 10 secondi.
  Se un calcolo non ci sta, paginalo.
- `npx tsc --noEmit` pulito. Nessun commit: lascia rivedere.
- Non toccare i file del passivo fiorista su cui stai lavorando in parallelo
  (`floristInvoiceAutoMatch.ts`, `floristCompensationRegister.ts`,
  `FloristMissingInvoicesPanel.tsx`).

## 5. Verifica prima di dichiarare chiuso

1. Il pannello elenca 93 righe e il contatore coincide con la somma delle righe
   non abbinate dei 9 documenti.
2. Riconciliando una riga, questa sparisce dall'elenco, il contatore scende di uno
   e la riga risulta `MATCHED` anche riaprendo il suo estratto conto.
3. Annullando quello stesso abbinamento, la riga torna nell'elenco e il libro non
   conserva scritture orfane.
4. Dopo aver riconciliato alcune righe ed eseguito di nuovo i controlli di
   quadratura, lo scarto di C1 deve scendere del numero di righe sistemate.
   Se non scende, l'abbinamento non sta arrivando alla Prima Nota: è un difetto,
   non un dettaglio.

# BRIEF per Cursor — Lista di lavoro fioristi ↔ fatture passive YouDOX SDI

Data: 14/09/2026 · Autore analisi: Claude (sessione Cowork) · Progetto: FloreMoria

---

## 1. Il problema, in una riga

Nella pagina **Contabilità → "Lista di lavoro · Da sollecitare — fatture fiorista mancanti"**
restano segnate come *"In attesa fattura"* righe la cui fattura è **già arrivata ed è già
in contabilità** nella sezione "Passivo / Documenti" (canale SDI_XML / YouDOX).

## 2. Causa tecnica accertata

La tabella è alimentata da `GET /api/dashboard/finance/florist-missing-invoices`
→ `listFloristCompensationRegister()` (`lib/financial/floristCompensationRegister.ts`)
→ lo stato di ogni riga esce da `resolveFloristDocStatus()` (`lib/financial/floristDocStatus.ts`).

Quella funzione decide `INVOICE_ASSOCIATED` **solo** se:

- `veraWorkflowFlags.floristDocStatus` è stato forzato a mano, **oppure**
- `veraWorkflowFlags.floristLinkedExpenseId` punta a una `ManualFinanceExpense` con
  `docType = 'FATTURA'` (associazione fatta a mano dal pannello), **oppure**
- `order.floristSettlementStatus === 'RICEVUTA'`.

**Non esiste alcun incrocio automatico con la tabella delle fatture passive.**
Finché nessuno clicca "associa fattura", la riga resta `WAITING_INVOICE` anche se la
fattura è stata importata da YouDOX il giorno stesso.

### Prova su dati reali di produzione (14/09/2026)

| Riga lista di lavoro | Fattura passiva presente in DB |
|---|---|
| Ordine `FT-MB-26-002` — La Baita del Fiore Snc — 35,00 € — stato *In attesa fattura* | Fattura **n. 61 del 13/09/2026**, `LA BAITA DEL FIORE S.N.C.`, P.IVA `IT06669020965`, **35,00 €**, canale `SDI_XML`, descrizione: *"Fattura n. 61 — … // Ordine **FT-MB-26-002** c/o Cimitero Monumentale-Desio"* |

Stesso fornitore, stesso importo al centesimo, **numero d'ordine citato dentro la fattura**,
stessa data. La riga è comunque segnata da sollecitare. Su 34 righe aperte, questa è la
dimostrazione che il difetto è strutturale, non un caso limite.

### Nota su una funzione già esistente (da NON copiare così com'è)

In `lib/financial/floristMissingInvoices.ts` esiste `hasMatchingInvoice()`, che un incrocio
lo fa — ma alimenta una lista diversa, non questo pannello, ed è troppo rigida:
finestra `[pagamento −5gg, pagamento +15gg]` e importo esatto ±1 €. I fioristi fatturano
spesso a fine mese e a volte raggruppano più consegne in una fattura sola: con quei vincoli
il match fallisce quasi sempre. Da riusare come riferimento, non da ricalcare.

---

## 3. Cosa deve fare Cursor

Creare l'incrocio automatico fra ordini fiorista e fatture passive, e usarlo per calcolare
lo stato della lista di lavoro.

### 3.1 Nuovo helper condiviso

Creare `lib/financial/floristInvoiceAutoMatch.ts` che esporta qualcosa come:

```ts
export type FloristInvoiceMatch = {
    expenseId: string;
    invoiceNumber: string | null;
    invoiceDate: string;      // YYYY-MM-DD
    totalCents: number;
    vendorName: string;
    vendorVat: string | null;
    confidence: 'ORDER_REF' | 'VAT_AMOUNT' | 'VAT_AGGREGATED' | 'NAME_AMOUNT';
};

export async function buildFloristInvoiceMatchIndex(params: {
    orders: Array<{ id: string; orderNumber: string | null; partnerId: string | null;
                    partnerVat: string | null; partnerName: string;
                    amountCents: number; referenceDate: Date }>;
    year?: number;
}): Promise<Map<string /* orderId */, FloristInvoiceMatch>>;
```

Una sola query su `manualFinanceExpense` (niente N+1):
`docType in ['FATTURA','NOTA_CREDITO']`, `expenseDate >= 1 gennaio anno corrente`,
selezionando `id, vendorName, totalCents, expenseDate, notes, description, metadataJson`.
La P.IVA fornitore sta in `metadataJson.vendorVat` (a volte `cedenteVat`), il numero
documento in `metadataJson.invoiceNumber`.

### 3.2 Regole di aggancio, in ordine di priorità

1. **`ORDER_REF` — riferimento ordine dentro la fattura.** Se `order.orderNumber`
   (es. `FT-MB-26-002`, confronto case-insensitive, ignorando spazi/trattini) compare in
   `description`, `notes` o nel testo di `metadataJson`, è un match certo:
   **nessun controllo su importo o data**, vince su tutto.
2. **`VAT_AMOUNT` — P.IVA + importo.** P.IVA fornitore normalizzata (togliere `IT`,
   tenere solo cifre) uguale a `partner.vatNumber` o `partner.taxCode`, **e**
   `totalCents` entro ±1 € da `order.floristCompensationCents`, **e** data fattura
   compresa fra `referenceDate − 5 giorni` e `referenceDate + 120 giorni`
   (la finestra larga è il punto: la fattura arriva dopo, spesso a fine mese).
3. **`VAT_AGGREGATED` — fattura cumulativa.** Stessa P.IVA, e il totale della fattura
   corrisponde (±1 €) alla **somma** di più ordini ancora scoperti dello stesso fiorista
   nella finestra: associare la fattura a tutti quegli ordini. Ogni fattura va consumata
   una volta sola — tenere un set degli `expenseId` già assegnati e non riusarli.
4. **`NAME_AMOUNT` — fallback senza P.IVA.** Solo se il partner non ha P.IVA né codice
   fiscale: nomi compatibili (riusare `normalizeName`/`namesCompatible` già presenti in
   `floristMissingInvoices.ts`) + importo esatto + stessa finestra. È il livello più debole:
   marcarlo come tale.

Le note di credito (`NOTA_CREDITO`) non chiudono una riga: servono solo a non far quadrare
due volte lo stesso importo. In dubbio, ignorarle in questa prima versione.

### 3.3 Uso nel registro

In `listFloristCompensationRegister()`: costruire l'indice una volta sola dopo aver caricato
gli ordini, e passare il match a `resolveFloristDocStatus()`.

Estendere `resolveFloristDocStatus()` con un input opzionale `autoMatchedInvoice`, con
questa **precedenza rigorosa**:

1. `flags.floristDocStatus` forzato a mano → vince sempre (anche su un match automatico);
2. ordine `CANCELLED` → `CANCELLED`; `floristMissingDismissedAt` → `NOT_DUE`;
3. `linkedExpenseId` manuale → come oggi;
4. **nuovo:** `autoMatchedInvoice` presente → `INVOICE_ASSOCIATED`;
5. altrimenti `WAITING_INVOICE`.

Una decisione presa a mano da Salvatore non deve mai essere sovrascritta dall'automatismo.

### 3.4 Dati esposti alla UI

Aggiungere alla riga (`FloristCompensationRow`):

```ts
autoMatchedInvoice: FloristInvoiceMatch | null;
matchSource: 'manual' | 'auto' | null;
```

Nel pannello `components/dashboard/FloristMissingInvoicesPanel.tsx`: sulle righe agganciate
automaticamente mostrare numero e data fattura (es. *"Fatt. 61 del 13/09/2026"*) con un
segno visivo che distingua l'aggancio automatico da quello manuale, più un pulsante
**"Conferma associazione"** che scrive `floristLinkedExpenseId` nei flag dell'ordine e
rende l'aggancio definitivo.

### 3.5 Vincolo importante: nessuna scrittura implicita

Il match automatico si calcola **in lettura**, non scrive nulla nel database finché
l'utente non conferma. Motivi: è reversibile, non sporca i dati contabili se la regola
sbaglia, e non trasforma una GET in un'operazione con effetti collaterali.
`repairStaleOrderLinks()` in `floristMissingInvoices.ts` è un esempio di cosa **non** fare
qui (scrive durante una lettura).

### 3.6 Riallineare anche la vecchia lista (opzionale, consigliato)

Sostituire `hasMatchingInvoice()` in `floristMissingInvoices.ts` con il nuovo helper, così
le due liste smettono di dare risposte diverse sugli stessi dati.

---

## 4. Verifica attesa prima del commit

1. `npx tsc --noEmit` pulito.
2. In produzione la riga **FT-MB-26-002 / La Baita del Fiore / 35,00 €** deve risultare
   *Fattura Associata* con riferimento alla fattura n. 61 del 13/09/2026.
3. Il contatore "DA SOLLECITARE" deve scendere in modo spiegabile: per ogni riga che sparisce
   dev'essere indicabile **quale** fattura l'ha chiusa. Se non è dimostrabile, la regola è
   troppo permissiva e va stretta.
4. Nessuna riga già confermata a mano deve cambiare stato.

---

## 5. Commit + push (include anche il fix YouDOX già sul disco)

Nel branch `main` sono già presenti, non committate, tre modifiche fatte da Claude che
risolvono il timeout del pulsante **"Sincronizza YouDOX SDI"** (sync incrementale, stop alla
suddivisione ricorsiva delle finestre vuote, budget anti-timeout, lettura risposta robusta):

- `app/api/v1/finance/youdox/sync/route.ts`
- `components/dashboard/SdiInvoicesUploadBox.tsx`
- `lib/youdox/listReceivedInvoicesPaged.ts`

Vanno deployate **insieme** al lavoro di questo brief: senza il sync funzionante le fatture
YouDOX non entrano in contabilità, e l'incrocio automatico non avrebbe nulla da incrociare.

Due commit separati, un solo push:

```bash
cd ~/Downloads/Floremoria_dot_com/floremoria

git add app/api/v1/finance/youdox/sync/route.ts \
        components/dashboard/SdiInvoicesUploadBox.tsx \
        lib/youdox/listReceivedInvoicesPaged.ts
git commit -m "fix(youdox): sync passivo incrementale, stop suddivisione finestre vuote e budget anti-timeout"

git add lib/financial/floristInvoiceAutoMatch.ts \
        lib/financial/floristCompensationRegister.ts \
        lib/financial/floristDocStatus.ts \
        components/dashboard/FloristMissingInvoicesPanel.tsx
git commit -m "feat(finance): incrocio automatico lista di lavoro fioristi con fatture passive SDI/YouDOX"

git push
```

Il deploy su Vercel parte da solo al push.

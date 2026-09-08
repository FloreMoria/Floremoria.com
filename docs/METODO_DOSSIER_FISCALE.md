# Metodo — Dossier Fiscale FloreMoria

Specifica funzionale del documento che il sistema produce per il commercialista.
Versione 1.0 — 8 settembre 2026.

Questo file è la specifica. Chi implementa segue queste regole; se una regola non è
implementabile come scritta, si ferma e lo segnala, non la reinterpreta.

---

## 1. Principio fondativo

**Il dossier è un documento di riconciliazione, non un'esportazione di dati.**

La differenza è tutta qui. Un'esportazione prende quello che c'è nel database e lo mette
in un foglio. Una riconciliazione prende fonti indipendenti, le confronta, e **dimostra**
che dicono la stessa cosa.

Conseguenza operativa: un dossier che non quadra non è "un dossier con qualche
imprecisione". È un dossier non valido, e deve dirlo da solo in prima pagina.

Il lettore del dossier è un professionista esterno che non conosce il nostro sistema e non
può verificarne le scelte. Ogni numero che gli mostriamo deve essere ricostruibile da lui
partendo dai documenti allegati.

---

## 2. Gerarchia delle fonti

Quando due fonti dicono cose diverse, vince quella più in alto. Sempre, senza eccezioni
e senza logiche di preferenza nascoste nel codice.

| # | Fonte | È verità su | Formato accettato |
|---|---|---|---|
| 1 | Estratto conto bancario | la cassa: cosa è entrato e uscito, e quando | solo PDF ufficiale con saldo iniziale e finale |
| 2 | Report gateway (Stripe, PayPal) | gli incassi dai clienti e le commissioni | export ufficiale del gateway |
| 3 | Fatture, autofatture, corrispettivi | i documenti fiscali e l'IVA | XML SDI, PDF |
| 4 | Ordini del gestionale | il fatto commerciale: chi ha comprato cosa | database interno |

**Regola sugli estratti conto**: un estratto incollato a mano, senza saldo iniziale e
finale, non è una fonte. Il sistema lo rifiuta in ingresso. Non si può riconciliare un
elenco di movimenti che non dichiara da dove parte e dove arriva.

---

## 3. I fogli del dossier

Sette fogli, in quest'ordine. Nessuno è facoltativo.

| # | Foglio | Contenuto |
|---|---|---|
| 0 | **Quadratura** | esito dei controlli, liquidazione IVA, raccordo finanziario |
| 1 | **Registro corrispettivi** | ogni incasso da cliente, con imponibile e IVA |
| 2 | **Prima Nota** | ogni movimento con il suo mastro |
| 3 | **Estratto conto** | i movimenti bancari come li dice la banca |
| 4 | **Acquisti** | fatture passive e autofatture |
| 5 | **Gateway Stripe** | i movimenti del wallet |
| 6 | **Gateway PayPal** | i movimenti del wallet |
| 7 | **Eccezioni** | tutto ciò che il sistema non è riuscito a riconciliare |

Il foglio 0 è il primo che si apre e il primo che si legge. Il foglio 7 esiste sempre,
anche vuoto: un dossier senza foglio Eccezioni suggerisce che non ci siano eccezioni,
il che è un'affermazione, e va fatta esplicitamente.

---

## 4. Foglio 0 — Quadratura

Quattro blocchi, in quest'ordine.

### 4.1 Esito dei controlli
In cima, prima di ogni altro numero. Se anche un solo controllo fallisce, la prima riga
del dossier è **"DOSSIER NON QUADRATO"** con l'elenco dei controlli falliti e il rimando
al foglio Eccezioni. Non si nasconde, non si arrotonda, non si mette in fondo.

### 4.2 Liquidazione IVA del periodo
| Voce | Da dove viene |
|---|---|
| Imponibile vendite per aliquota | foglio 1, sommato per aliquota |
| IVA a debito | foglio 1 |
| Imponibile acquisti per aliquota | foglio 4, solo fatture italiane |
| IVA a credito | foglio 4 |
| IVA reverse charge (autofatture) | foglio 4, dichiarata a parte |
| **Saldo del periodo** | debito meno credito |

L'IVA delle autofatture estere **non entra nel saldo**: nel reverse charge la stessa
imposta sta contemporaneamente a debito e a credito. Va comunque esposta, come voce
separata, perché il commercialista deve vederla nei registri.

### 4.3 Raccordo finanziario
| Voce |
|---|
| Saldo banca a inizio periodo (dichiarato dalla banca) |
| Totale entrate |
| Totale uscite |
| Saldo calcolato |
| Saldo banca a fine periodo (dichiarato dalla banca) |
| **Differenza — deve essere zero** |

### 4.4 Conto economico del periodo
Ricavi, costi, risultato. Con l'indicazione esplicita di cosa è escluso (partite di giro,
movimenti patrimoniali) e perché.

---

## 5. I controlli — il cuore del metodo

Ogni controllo ha un nome, una formula, un esito atteso. Girano tutti a ogni generazione
del dossier e il loro esito è scritto nel foglio 0.

| ID | Controllo | Formula | Atteso |
|---|---|---|---|
| C1 | Completezza banca | numero righe estratto conto − numero righe Prima Nota su canale banca | 0 |
| C2 | Quadratura banca | somma movimenti Prima Nota − (entrate − uscite estratto conto) | 0 |
| C3 | Continuità saldo | saldo iniziale + Σ movimenti − saldo finale dichiarato | 0 |
| C4 | Incassi e corrispettivi | somma incassi clienti dai gateway − totale registro corrispettivi | 0 |
| C5 | Coerenza documenti | somma imponibili + IVA − somma totali documento | 0 |
| C6 | Nessuna riga tecnica | numero righe con importo negativo che stornano una riga positiva dello stesso documento | 0 |
| C7 | Identificazione fornitori | numero documenti senza partita IVA o codice fiscale | 0 |
| C8 | Mastri ammessi | numero righe con mastro fuori dall'elenco chiuso | 0 |
| C9 | Partite di giro | numero movimenti di transito classificati come ricavo o costo | 0 |
| C10 | Doppia gamba transito | per ogni gateway: somma dare − somma avere − saldo wallet dichiarato | 0 |

**C1 è il controllo che il dossier di agosto non aveva**, ed è quello che ha lasciato
passare 19 movimenti bancari per € 387,90 — tutti costi.

**C10 è il controllo che oggi fallirebbe** perché la gamba *dare* del transito non è mai
stata scritta. Va implementato lo stesso: un controllo che fallisce e lo dice è
infinitamente meglio di un difetto silenzioso.

### Cosa succede quando un controllo fallisce
Il dossier **si genera comunque**, ma:
1. la prima riga del foglio 0 dichiara il fallimento;
2. il controllo fallito è evidenziato in rosso con il suo scostamento in euro;
3. le righe che lo causano sono elencate una per una nel foglio 7 — Eccezioni.

Non si blocca l'export e non si "aggiusta" il numero perché torni. Un dossier che non
quadra ma lo dichiara è utilizzabile; uno che quadra perché qualcuno ha corretto il
totale è pericoloso.

---

## 6. Regole di classificazione

### 6.1 Elenco chiuso dei mastri
Nessuna riga può avere un mastro che non sia in questo elenco. Testo libero vietato.

**Economici — ricavi**: Ricavi vendite · Altri ricavi · Contributi

**Economici — costi**: Costi del venduto (fioristi) · Commissioni gateway · Servizi e
software · Oneri bancari · Spese generali · Compensi professionali

**Patrimoniali**: Banca · Transito Stripe · Transito PayPal · Crediti verso clienti ·
Debiti verso fornitori · Fatture da ricevere · Risconti · IVA a credito · IVA a debito ·
Finanziamento soci · Da classificare

### 6.2 Regole di attribuzione che il sistema deve rispettare

| Se il movimento è… | Mastro | Nota |
|---|---|---|
| bonifico a un fiorista per una consegna | Costi del venduto (fioristi) | mai "Spese generali" |
| addebito SDD PayPal con causale "Add To Balance" | Transito PayPal | è ricarica del wallet, **mai un ricavo** |
| bonifico dalla banca al wallet di un gateway | Transito del gateway | partita di giro |
| accredito di un payout dal gateway alla banca | Banca / Transito del gateway | partita di giro, **mai un ricavo** |
| incasso di un cliente sul gateway | Ricavi vendite / Transito del gateway | è qui che nasce il ricavo |
| deposito SIAE, marchi, brevetti, software | Spese generali o immobilizzazione | **mai** Costi del venduto |
| commissione trattenuta dal gateway | Commissioni gateway | costo, con autofattura |
| canone o imposta di bollo del conto | Oneri bancari | |

**La regola generale**: il ricavo nasce quando il cliente paga, non quando i soldi
arrivano in banca. Il passaggio dal gateway alla banca è uno spostamento di soldi già
nostri, e un movimento del genere non può mai creare né un ricavo né un costo.

### 6.3 Righe tecniche dei gateway
Stripe e PayPal producono movimenti che non sono fatti economici: `payout_minimum_balance_hold`
e `payout_minimum_balance_release`, righe di riconciliazione interna, doppie scritture della
stessa commissione con codici diversi (`txn_` e `stripe_tx_`).

Il sistema le riconosce, le **esclude dai totali**, e le dichiara in una riga a parte del
foglio del gateway: *"escluse N righe tecniche per € X — non sono fatti economici"*.

---

## 7. Divieto dei totali ingannevoli

Un totale che somma cose di natura diversa è un errore, anche se aritmeticamente corretto.

Il dossier di agosto esponeva un totale Stripe di € 7.056,36 che sommava incassi dei
clienti, payout verso la banca e 32 righe tecniche che si annullano fra loro. Il fatturato
reale del trimestre era € 1.524,86 su quel canale. Chi legge quel totale sbaglia di quattro
volte e mezzo.

**Regola**: ogni riga di totale dichiara cosa somma e cosa esclude. Se un foglio contiene
righe di natura diversa, non ha un totale unico: ha un totale per natura.

---

## 8. Registro corrispettivi

È il foglio che nel dossier di agosto mancava del tutto, ed è quello senza il quale il
commercialista non può liquidare l'IVA.

Una riga per ogni incasso da cliente. Colonne:

`Data` · `Canale` · `Numero ordine` · `Riferimento transazione gateway` · `Importo di
listino` · `Sconto o buono` · `Incassato lordo` · `Aliquota` · `Imponibile` · `IVA`

Regole:
- l'aliquota viene dai prodotti dell'ordine, non da un valore fisso;
- i rimborsi sono righe negative, non righe cancellate;
- `Incassato lordo` deve coincidere con l'importo che il gateway dichiara: è la chiave
  con cui il commercialista ritrova il movimento;
- se un incasso del gateway non trova l'ordine corrispondente, non si esclude e non si
  inventa: va nel foglio Eccezioni.

---

## 9. Foglio Eccezioni

Una riga per ogni cosa che il sistema non ha saputo riconciliare, con quattro colonne:
`Cosa` · `Dove` · `Importo` · `Perché non riconciliato`.

Casi tipici: incasso senza ordine, ordine senza incasso, movimento bancario senza
controparte, documento senza partita IVA, riga con mastro "Da classificare".

**Questo foglio è il più importante del dossier dopo la Quadratura.** Un dossier con
dodici eccezioni dichiarate vale più di uno con zero eccezioni ottenute nascondendo i casi
difficili.

---

## 10. Cosa il sistema non deve mai fare

- Correggere un numero perché un totale torni.
- Applicare filtri in lettura che modificano i totali senza dichiararlo.
- Escludere righe dai totali senza scriverlo nel foglio.
- Dedurre un'aliquota IVA quando il dato non c'è: si mette in Eccezioni.
- Generare un dossier da un estratto conto privo di saldi.
- Usare la parola "TOTALE" per una somma di grandezze eterogenee.

---

## 11. Denominazione e tracciabilità

Nome file: `Dossier_Fiscale_FloreMoria_<anno>_<periodo>_v<n>.xlsx`

Il foglio 0 riporta sempre, in fondo: data e ora di generazione, versione del metodo
applicata, periodo coperto, e l'elenco delle fonti usate con il loro identificativo
(nome del PDF dell'estratto conto, data di export dei report gateway).

Due dossier generati in momenti diversi sugli stessi dati devono dare gli stessi numeri.
Se non lo fanno, c'è una funzione che modifica i dati mentre li legge.

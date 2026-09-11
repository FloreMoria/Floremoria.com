# Metodo — Dossier Fiscale FloreMoria

Specifica funzionale del documento che il sistema produce per il commercialista.
Versione 1.20 — 11 settembre 2026.

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
| 1 | Estratto conto bancario | la cassa: cosa è entrato e uscito, e quando | qualsiasi file scaricato dal portale della banca (PDF, CSV, XLS) che riporti saldo iniziale e finale |
| 2 | Report gateway (**Stripe**; PayPal solo come conto di pagamento / spese) | gli incassi dai clienti (via Stripe) e le commissioni Stripe; movimenti PayPal di spesa/residuo | export ufficiale |
| 3 | Fatture, autofatture, corrispettivi | i documenti fiscali e l'IVA | XML SDI, PDF |
| 4 | Ordini del gestionale | il fatto commerciale: chi ha comprato cosa | database interno |

**Regola sugli estratti conto.** Il vincolo non è sul formato ma su due condizioni, entrambe
necessarie:

1. **Il file è stato scaricato dal portale della banca.** PDF, CSV o XLS sono equivalenti.
   Testo incollato a mano in un foglio non è ammesso in nessun caso: non è verificabile da
   dove viene, e un file di cui non si conosce la provenienza non può essere una fonte di
   verità.
2. **Il file riporta il saldo iniziale e il saldo finale dichiarati dalla banca.** Non
   calcolati da noi. Sono i due estremi che rendono possibile il controllo C3: senza,
   l'estratto è un elenco di movimenti che non dice da dove parte né dove arriva, e
   nessuna riconciliazione è possibile.

**Il periodo in corso è l'eccezione, e ha regole proprie.** La banca emette l'estratto conto
solo a trimestre chiuso: per il trimestre corrente il documento ufficiale **non esiste** e non
può esistere. Vietare ogni altra fonte significherebbe restare ciechi sul presente per tre mesi
all'anno.

Per il periodo non ancora chiuso si ammette quindi l'**inserimento della lista movimenti**
copiata dall'home banking, a queste condizioni, tutte obbligatorie:

| Condizione | Perché |
|---|---|
| Le righe nascono con stato **provvisorio** e origine dichiarata | chi legge deve sapere che non sono certificate |
| Il parser **scarta le righe di saldo e le intestazioni** | è da lì che è nata la riga fantasma da € 32.410,30 il 21 agosto 2026 |
| Una riga è valida solo con **data + causale + importo** | tutto il resto non è un movimento |
| La deduplica usa il **fingerprint già esistente** | non si reinventa un confronto per data e importo: le causali identiche si ripetono (canoni, bolli) |
| Il controllo C3 sul periodo provvisorio è **non verificabile** | senza saldi dichiarati non c'è continuità da verificare |
| Il dossier dichiara in testa se il periodo contiene righe provvisorie | un dossier provvisorio non si consegna come definitivo |

**Il passaggio a definitivo.** Quando arriva l'estratto ufficiale del trimestre, quello diventa
la verità primaria: le righe provvisorie che trovano corrispondenza passano a **certificate**,
e le discrepanze di importo o data si allineano al documento della banca. Le righe provvisorie
che il documento ufficiale **non conferma** non si cancellano e non si tengono: vanno nel foglio
Eccezioni con la dicitura "movimento non confermato dall'estratto ufficiale", perché una riga
che il conto non ha mai avuto è un'informazione, non uno scarto.

Solo a passaggio avvenuto il controllo C3 diventa verificabile su quel periodo.

---

Le due condizioni sopra valgono per i caricamenti di documenti relativi a **periodi chiusi**. Il sistema registra per ogni estratto:
nome del file, data di download, periodo coperto, saldo iniziale e finale letti.

**Sui dati già in archivio non si torna indietro.** Documenti caricati prima di questa regola
restano dove sono e continuano a valere: il titolare li ha verificati e i movimenti sono
quelli. Dove i saldi dichiarati mancano, il controllo C3 su quel periodo risulta **non
verificabile** — non fallito, e non è un motivo per bloccare nulla. Il dossier lo dichiara in
una riga e va avanti.

Chiudere l'ingresso serve a non aggiungere altri documenti non verificabili, non a invalidare
quelli esistenti.

**Gerarchia fra canali di ingestione delle fatture passive.** Lo stesso documento può arrivare
da più canali. Due documenti sono lo stesso documento quando hanno **stessa partita IVA del
fornitore** e **stesso numero documento**. Il fornitore si identifica dalla partita IVA, mai
dal nome (nello stesso archivio possono comparire varianti di ragione sociale per lo stesso
soggetto). Data e imponibile sono **conferme**, non requisiti: se coincidono P.IVA e numero ma
differiscono data o importo, il documento è comunque lo stesso — si tiene il canale prioritario
e la discrepanza va in Eccezioni. Non si usa la regola «almeno due campi uguali» (fonderebbe
due fatture distinte dello stesso fornitore nello stesso giorno).

Ne sopravvive uno solo secondo la priorità:

| Priorità | Canale |
|---|---|
| 1 | Youdox (XML SDI) |
| 2 | Report fatture ricevute (file periodico XLSX) |
| 3 | Inserimento manuale |

Il documento del canale con priorità più bassa **non compare in tabella e non concorre ad
alcun totale**. Viene annotato nel foglio Eccezioni come "documento già acquisito da canale
prioritario", secondo la §6.5.

**Aliquota IVA.** L’aliquota si legge dalla fonte (XML: `AliquotaIVA`; report: colonna aliquota
se presente). Non si stima dividendo imposta per imponibile (es. 10,01%). Se la fonte non
espone l’aliquota, la riga va in Eccezioni — non in tabella né nei totali.

---

## 3. I fogli del dossier

Ordine pensato per il commercialista che apre il file per la liquidazione IVA.
Nessuno è facoltativo.

| # | Foglio | Contenuto |
|---|---|---|
| 1 | **Corrispettivi** | ogni incasso gateway: data, canale, riferimento transazione, ordine se c’è, lordo, aliquota, stato aliquota, imponibile, IVA |
| 2 | **Acquisti** | fornitore, P.IVA, tipo/numero/data documento, imponibile, aliquota, IVA |
| 3 | **Banca** | i movimenti dell’estratto conto |
| 4 | **Liquidazione IVA** | IVA a debito, a credito, saldo trimestre; reverse charge su entrambi i lati. In testa: se il file quadra e di quanto |
| 5 | **Da chiarire** | righe non classificabili, con motivo in parole semplici |
| 6 | **Prima Nota** | allegato interno — ogni movimento con mastro |
| 7 | **Gateway Stripe** | allegato interno — wallet |
| 8 | **Gateway PayPal** | allegato interno — wallet |
| 9 | **Quadratura** | strumento interno in coda: esito C1–C12, raccordo, tracciabilità |

I fogli 1–5 sono quelli che il commercialista usa senza spiegazioni. I fogli 6–8 sono
allegati di dettaglio. Il foglio 9 è il nostro strumento di controllo: non va in testa.

Il foglio **Da chiarire** esiste sempre, anche vuoto: un dossier senza quel foglio
suggerisce che non ci siano eccezioni, il che è un’affermazione, e va fatta esplicitamente.

---

## 4. Liquidazione IVA e Quadratura

### 4.1 Foglio Liquidazione IVA
In testa al foglio, prima di ogni numero: se il periodo contiene righe bancarie
**provvisorie** — inserite dalla lista movimenti in attesa dell'estratto ufficiale — il dossier
lo dichiara, con quante righe e per quale importo. Un dossier che contiene un periodo
provvisorio non si consegna come definitivo.

Poi una riga che dice se il file **quadra** e, se no, di quanto
(scostamento aggregato dei controlli verificabili falliti). Poi la liquidazione:

| Voce | Da dove viene |
|---|---|
| Imponibile vendite per aliquota | foglio Corrispettivi, sommato per aliquota |
| IVA a debito | foglio Corrispettivi |
| Imponibile acquisti per aliquota | foglio Acquisti, solo fatture italiane |
| IVA a credito | foglio Acquisti |
| IVA reverse charge — a debito | foglio Acquisti, autofatture |
| IVA reverse charge — a credito | foglio Acquisti, autofatture (stesso importo) |
| **Saldo del trimestre** | totale debito meno totale credito |

**Sul reverse charge.** L'IVA delle autofatture estere entra nel calcolo **due volte**: una
riga a debito e una riga a credito, dello stesso importo. L'effetto sul saldo è nullo, ma le
due righe devono comparire entrambe, perché nei registri IVA quell'imposta esiste su entrambi
i lati — registro acquisti e registro vendite — e da lì passa nei quadri della dichiarazione.
Esporla come una nota fuori dal calcolo, come faceva la versione 1.0 di questo metodo, dà un
saldo giusto ma registri formalmente incompleti.

Il foglio riporta due totali distinti: **IVA a debito complessiva** (vendite + reverse charge)
e **IVA a credito complessiva** (acquisti + reverse charge), e il saldo è la loro differenza.

### 4.2 Foglio Quadratura (in coda — strumento interno)
Esito controlli C1–C12, sintesi certezza aliquote §8.3, raccordo finanziario, tracciabilità
(§12). Se anche un solo controllo *verificabile* fallisce, la prima riga del foglio è
**"DOSSIER NON QUADRATO"** con l'elenco dei falliti e il rimando a **Da chiarire**.
Un controllo *non verificabile* (es. C3 senza saldi dichiarati) non è un fallimento.

### 4.3 Raccordo finanziario (nel foglio Quadratura)
| Voce |
|---|
| Saldo banca a inizio periodo (dichiarato dalla banca) |
| Totale entrate |
| Totale uscite |
| Saldo calcolato |
| Saldo banca a fine periodo (dichiarato dalla banca) |
| **Differenza — C3; se saldi assenti → non verificabile** |

---

## 5. I controlli — il cuore del metodo

Ogni controllo ha un nome, una formula, un esito atteso. Girano a ogni generazione del
dossier (e su richiesta esplicita dal badge Contabilità); l’esito è scritto nel foglio
Quadratura in coda e persistito per la UI.

| ID | Controllo | Formula | Atteso |
|---|---|---|---|
| C1 | Completezza banca | numero righe estratto conto − numero righe Prima Nota su canale banca | 0 |
| C2 | Quadratura banca | somma movimenti Prima Nota − (entrate − uscite estratto conto) | 0 |
| C3 | Continuità saldo | saldo iniziale + Σ movimenti − saldo finale dichiarato | 0 |
| C4 | Incassi e corrispettivi | somma incassi clienti dai gateway − totale registro corrispettivi | 0 |
| C5 | Coerenza documenti | somma imponibili + IVA − somma totali documento | 0 |
| C6 | Nessuno storno tecnico | numero coppie di righe con lo **stesso identificativo di documento** e **imponibile** uguale e opposto | 0 |
| C7 | Identificazione fornitori | numero documenti senza partita IVA o codice fiscale | 0 |
| C8 | Mastri ammessi | numero righe con mastro fuori dall'elenco chiuso | 0 |
| C9 | Partite di giro | numero movimenti di transito classificati come ricavo o costo | 0 |
| C10 | Doppia gamba transito | **solo Stripe** (unico transito vendite): Σ TX − FEE − REFUND − PAYOUT − saldo dichiarato; PayPal escluso | 0 |
| C11 | Coerenza di perimetro | sugli **insiemi di orderId** dell’anno solare (corrispettivi, ledger ricavi, taxRegister, taxQuarterly, cfoTools; pose escluse): gli insiemi devono coincidere; misura = n° ordini presenti in un canale e assenti in un altro | 0 |
| C12 | Data ordine = data incasso | per ogni ordine abbinato a un movimento gateway: \|data ordine − data incasso\|; tolleranza dichiarata ≤ 24h (fuso) non conta come errore | 0 |
| C13 | Saldo transito / conto pagamento | Stripe: saldo transito vendite − dichiarato; PayPal: riconciliazione **conto di pagamento** (non ciclo vendite) − dichiarato | 0 |

**C6 si misura sull'imponibile, mai sul totale documento.** È la precisazione che mancava
alla versione 1.1 e che ha fatto misurare zero coppie dove ce n'erano sei. In una coppia
tecnica generata dall'ingestione di un acquisto estero gli imponibili sono esattamente opposti
(− 17,75 e + 17,75), ma i totali **non lo sono**: la riga positiva porta l'IVA del reverse
charge e la negativa ha IVA zero, quindi i totali sono − 17,75 e + 21,66. Confrontando i
totali la coppia non si vede.

**C6 non deve mai intercettare un rimborso a un cliente né una nota di credito.** Il
discriminante è preciso: una riga è uno storno tecnico solo se condivide l'identificativo di
documento con la riga che annulla, ha imponibile esattamente opposto, ed è stata generata dal
sistema e non da un fatto esterno. Un rimborso a un cliente ha un proprio identificativo, una
propria data e nasce da un evento reale: è un fatto economico, non un artefatto. Se il
controllo segnala un rimborso, è il controllo a essere scritto male.

**C1 è il controllo che il dossier di agosto non aveva**, ed è quello che ha lasciato
passare 19 movimenti bancari per € 387,90 — tutti costi.

**C10 è il controllo che oggi fallirebbe** perché la gamba *dare* del transito non è mai
stata scritta. Va implementato lo stesso: un controllo che fallisce e lo dice è
infinitamente meglio di un difetto silenzioso.

**C11 confronta insiemi di ordini, non somme in euro.** Domanda unica: i cinque canali
guardano gli stessi orderId sull’anno? Le differenze di data fra cassa e competenza sono
fisiologiche e **non** devono farlo fallire. Il risultato elenca gli ordini presenti in un
canale e assenti in un altro.

**C12** — sul .com l’ordine nasce quando il cliente paga: le due date devono coincidere.
Ogni divergenza oltre la tolleranza di fuso (24 ore, dichiarata) è un dato sbagliato. Il
controllo deve poter diventare verde.

**C13 — saldo transito / conto pagamento.** Stripe è l’**unico** transito vendite: il saldo
calcolato (`STRIPE_TX − FEE − REFUND − PAYOUT`) deve coincidere con il saldo **dichiarato**
dal cruscotto Stripe. PayPal non è più nel ciclo vendite: C13 vi misura solo la
**riconciliazione del conto di pagamento** (ledger vs dichiarato, es. €0). Scostamento
atteso: nullo su ciascun pezzo verificabile. **Senza saldo dichiarato, quel pezzo è non
verificabile, non fallito.** C10 resta il controllo di struttura sul solo Stripe; C13 è il
controllo di **saldo**.

### 5.1 Controllo, lista di lavoro, risultato

Tre oggetti distinti. **Non si mescolano mai nella stessa vista.** Il colore verde/rosso
si applica **solo** ai controlli.

| | Controllo (C1–C13) | Lista di lavoro | Risultato |
|---|---|---|---|
| Cos’è | Confronta **due letture dello stesso fatto** e verifica che coincidano | Arretrato operativo (es. fatture fiorista da sollecitare, autofatture da trasmettere) | Numero economico: ricavi, costi, RAI, IVA a debito, … |
| Esito atteso | **Scostamento nullo** fra le due letture — non “un importo economico pari a zero” | Non esiste un zero operativo: la lista è **per definizione non vuota** | **Nessun** valore atteso |
| Verde / rosso | **Sì** — verde quando i dati sono corretti; se per costruzione non può diventare verde, è progettato male e va riscritto | **Mai** — non è un errore del sistema | **Mai** — non è né verde né rosso: è quello che è |
| Vista UI | Badge Contabilità / foglio Quadratura | Sezione separata (es. «Da sollecitare — fatture fiorista mancanti») | Fogli Corrispettivi, Acquisti, Liquidazione IVA, CE, … |

Esempio di lista di lavoro: **«Da sollecitare — fatture fiorista mancanti»** (fiorista, ordini
coperti, importo pagato, giorni dal pagamento, dal più vecchio). Conteggio e importo totale
sempre visibili. Non è un controllo e non fa fallire nulla.

### 5.2 Invariante sulle date

- **Data ordine = data pagamento del cliente** (con tolleranza fuso ≤ 24h, C12).
- Le date dei **pagamenti ai fioristi** e delle **loro fatture** sono indipendenti: si
  agganciano per **riferimento ordine**, mai per data.
- Ordini a cavallo d’anno (pagati in un esercizio, consegna nel successivo): elenco generato
  **a richiesta** per il commercialista; niente meccanismi automatici.

### Cosa succede quando un controllo fallisce
Il dossier **si genera comunque**, ma:
1. la prima riga del foglio 0 dichiara il fallimento;
2. il controllo fallito è evidenziato in rosso con il suo scostamento;
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

**Patrimoniali**: Banca · Transito Stripe (unico transito vendite) · Conto PayPal (pagamento,
non vendite) · Incassi fuori gateway · Crediti verso clienti ·
Debiti verso fornitori · Fatture da ricevere · Risconti · IVA a credito · IVA a debito ·
Finanziamento soci · Da classificare

### 6.2 Regole di attribuzione che il sistema deve rispettare

| Se il movimento è… | Mastro | Nota |
|---|---|---|
| bonifico a un fiorista per una consegna | Costi del venduto (fioristi) | mai "Spese generali" |
| addebito SDD PayPal con causale "Add To Balance" | Conto PayPal (pagamento) | ricarica del wallet PayPal, **mai un ricavo** né gamba vendite |
| bonifico dalla banca al wallet di un gateway | Transito Stripe o Conto PayPal | partita di giro sul contenitore giusto |
| accredito di un payout dal gateway alla banca | Banca / Transito Stripe (o Conto PayPal se residuale) | partita di giro, **mai un ricavo** |
| incasso di un cliente sul gateway | Ricavi vendite / **Transito Stripe** | anche se il metodo è PayPal *via* Stripe; mai `PAYPAL_TX` come ricavo |
| deposito SIAE, marchi, brevetti, software | Spese generali o immobilizzazione | **mai** Costi del venduto |
| commissione trattenuta da Stripe | Commissioni gateway | costo, con autofattura |
| canone o imposta di bollo del conto | Oneri bancari | |
| spesa SaaS / fornitore pagata da PayPal | Costi (SaaS / operative) / Conto PayPal | **costo CE**, non riduzione di ricavo |

**La regola generale**: il ricavo nasce quando il cliente paga, non quando i soldi
arrivano in banca. Il passaggio dal gateway alla banca è uno spostamento di soldi già
nostri, e un movimento del genere non può mai creare né un ricavo né un costo.

### 6.2.1 Conti di passaggio denaro — architettura

**Correzione concettuale (v1.20 — 11/09/2026).** Le vendite 2026 si ripartiscono su
**due gateway reali**, chiusi dai report PayPal HAYUM + Stripe:

| Canale | Importo | Fonte |
|---|---:|---|
| **PayPal** (conto `HAYUMYJTWLRTE`) | **€1.351,98** (32) | Report vendite T1+T2+T3 — vedi `docs/verbali/paypal-sales-reports/` |
| **Stripe** | **€2.746,70** | Residuo sul fatturato ufficiale |
| **Totale** | **€4.098,68** | Lista operativa (75 ordini) |

Non resta fatturato «fuori». Il contenitore **incassi fuori gateway** (`10400`,
`MANUAL_INBOUND`) deve tendere a **zero**; ogni riga residua va elencata come eccezione.

PayPal **non** è più solo conto spese: per le 32 vendite del report è gateway di
incasso. Resta anche conto di pagamento per SaaS/SDD/prelievi Fineco. Stripe resta il
transito delle vendite *non* PayPal-native (carta/Link e metodo PayPal *via* Stripe).

| Contenitore | Ruolo | Cosa contiene |
|---|---|---|
| **Transito Stripe** | vendite non-HAYUM | incassi Stripe, fee, rimborsi, payout Fineco |
| **Conto PayPal HAYUM** | vendite report + conto pagamento | 32 incassi report; fee; spese; prelievi Fineco |
| **Incassi fuori gateway** | eccezioni | solo ordini davvero fuori dai due gateway (target ≈ 0) |

**T3 PayPal è PROVVISORIO** (1 lug – 10 set): a fine trimestre ricaricare il CSV.

**Pay Later:** l’incasso per FloreMoria è **immediato** (PayPal finanzia il cliente);
stesso trattamento di un Express Checkout (`pay_later_as_normal_receipt`).

#### Equazione conto PayPal (dato esterno)

`incassi report − commissioni − spese − prelievi Fineco (€569,88) ≟ saldo dichiarato (€0)`

I quattro addendi e lo scarto si dichiarano; non si forzano.

I corrispettivi restano al **lordo** sulla data di pagamento del cliente: questi conti
**non** toccano ricavi fiscali né aliquote.

#### Transito Stripe — quattro addendi

Equazione di controllo (saldo wallet dichiarato dall’utente, es. €100):

`incassi cliente − commissioni − rimborsi − payout Fineco = saldo dichiarato`

| Evento | Effetto sul transito | Contropartita | Chiave tipica |
|---|---|---|---|
| pagamento cliente (anche se metodo PayPal *via* Stripe) | **entra** al lordo | Ricavi vendite | `STRIPE_TX:{id}` |
| commissione Stripe | **esce** come **costo** (mai riduzione del ricavo) | Commissioni / oneri | `STRIPE_FEE:{id}` |
| rimborso al cliente | **esce** | Rimborsi | `STRIPE_REFUND:{id}` |
| bonifico verso Fineco (payout) | **esce** ed **entra** in Banca | Banca Fineco | `STRIPE_PAYOUT:po_*` |

La gamba **payout** usa i giroconti Stripe sull’estratto Fineco come riferimento esterno
(non un totale calcolato internamente e imposto a forza). Se ledger e Fineco divergono, si
dichiara lo scarto — non si aggiusta aritmeticamente.

#### Conto PayPal HAYUM — vendite report + pagamento

Le 32 vendite del report (`PAYPAL_TX` marcati `paypalSalesReport`) sono incassi gateway.
Le uscite SaaS / operative restano **costi** di conto economico. I prelievi verso Fineco
(rif. esterno €569,88) sono giroconti. Equazione esterna:

`incassi €1.351,98 − commissioni − spese − prelievi Fineco ≟ €0`

#### Incassi fuori gateway

Chiave operativa tipica: `MANUAL_INBOUND:{orderId}`. Mastro `10400`. Dopo il modello
HAYUM (v1.20) il contenitore deve tendere a zero; ogni residuo è un’eccezione da elencare.

I **duplicati di canale** (stessa TX come `stripe_eu_…` e Stripe .com) non generano una
seconda gamba. Hold / release di saldo minimo e conversioni interne non sono fatti
economici (§6.3).

### 6.3 Righe tecniche dei gateway
Stripe e PayPal producono movimenti che non sono fatti economici: `payout_minimum_balance_hold`
e `payout_minimum_balance_release`, righe di riconciliazione interna, doppie scritture della
stessa commissione con codici diversi (`txn_` e `stripe_tx_`).

Il sistema le riconosce, le **esclude dai totali**, e le dichiara in una riga a parte del
foglio del gateway: *"escluse N righe tecniche per € X — non sono fatti economici"*.

### 6.4 Costo standard del fiorista e fatture da ricevere

Il compenso del fiorista non è una stima: è un parametro deciso da noi al momento
dell'incarico. Un bouquet da € 45 significa € 45 di fiori. Questo rende il **costo standard**
un dato affidabile, e gli assegna tre usi legittimi:

1. **operativo** — generare l'incarico al fiorista con l'importo già determinato;
2. **gestionale** — calcolare il margine atteso per prodotto e per ordine;
3. **contabile, in un caso solo** — iscrivere la **fattura da ricevere** quando la
   prestazione è stata eseguita e il documento del fornitore non è ancora arrivato.

**La regola sul terzo uso.** Il costo standard può generare **una sola** scrittura: quella di
fattura da ricevere, che è per natura provvisoria e va chiusa. Quando il documento del
fornitore arriva:
- la scrittura di stima si chiude;
- il costo definitivo è quello del documento;
- l'eventuale differenza fra stimato e fatturato si rileva come rettifica, con il riferimento
  alla stima che sostituisce.

**Quello che il costo standard non deve mai fare** è generare una scrittura di costo
definitiva che resti nel libro accanto al pagamento o alla fattura. È il difetto trovato nel
2026 con i `FLORIST_PAYOUT`: il sistema scriveva il compenso per consegna, il titolare pagava
con bonifico, il fiorista emetteva fattura, e lo stesso costo finiva a libro due o tre volte.
La differenza fra una fattura da ricevere e quel difetto è che la prima **si chiude** quando
arriva il documento, la seconda resta.

**Controllo associato**: nessuna consegna può avere contemporaneamente una scrittura di costo
da standard **aperta** e un documento del fornitore registrato. Se accade, è un doppio conto e
va nel foglio Eccezioni.

---

### 6.5 Acquisti da fornitori esteri

Un acquisto da un fornitore estero è **un solo fatto economico** e produce **una sola riga**
nel foglio Acquisti:

| Campo | Contenuto |
|---|---|
| Imponibile | positivo, l'importo del documento del fornitore |
| Aliquota | quella applicabile in reverse charge |
| IVA | calcolata sull'imponibile |
| Tipo | Autofattura, con il codice appropriato |
| Identificativo | il documento del fornitore |

Quella riga sola genera poi i **due movimenti IVA** del §4.2, uno a debito e uno a credito.
Non serve, e non è ammessa, una riga negativa che annulli quella positiva.

**Il difetto trovato nel dossier T2 2026.** Lo stesso documento estero veniva intercettato da
due canali di ingestione diversi — uno manuale e uno automatico dai servizi in abbonamento —
che lo registravano entrambi: il primo con imponibile negativo e IVA zero, il secondo con
imponibile positivo e IVA in reverse charge, sotto lo stesso nome di file. Sommando la colonna
imponibile i due si annullavano e il costo spariva dal totale: € 780,08 invece di € 855,53
sui sei documenti coinvolti.

**Regola sulla doppia ingestione.** Quando due canali intercettano lo stesso documento —
stesso fornitore, stesso identificativo, stessa data — ne sopravvive **uno solo**, scelto
secondo la gerarchia delle fonti del §2. L'altro viene scartato in ingresso e annotato nel
foglio Eccezioni con la dicitura "documento già acquisito da altro canale". Non si registrano
entrambi, e non si compensano con una riga di segno opposto: una compensazione nasconde il
problema invece di risolverlo, ed è indistinguibile da un costo che non c'è.

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

**Una riga per ogni combinazione ordine + aliquota.** Non una riga per ordine: un ordine che
contiene fiori al 10% e un biglietto al 22% produce **due righe**, con lo stesso numero
d'ordine e lo stesso riferimento di transazione, e importi che sommati danno l'incassato.

Colonne:

`Data` · `Canale` · `Numero ordine` · `Riferimento transazione gateway` · `Importo di
listino` · `Sconto o buono` · `Incassato lordo` · `Aliquota` · `Imponibile` · `IVA`

### 8.1 Ordini con doppia registrazione fra canali

Dal **2 luglio 2026** gli ordini ricevuti sul sito `.eu` vengono **riportati a mano** anche
sul `.com`, per registrare l'utente. L'incasso resta sul gateway del `.eu`, la registrazione
dell'ordine sta sul `.com`. Lo stesso fatto commerciale esiste quindi in due posti, e questo
apre un rischio preciso: contarlo due volte, una come ordine `.com` e una come vendita `.eu`
non contabilizzata.

**Regola.** Ogni ordine porta due informazioni distinte:

| Campo | Significato |
|---|---|
| `Canale di incasso` | dove il cliente ha pagato — determina su quale gateway cercare la transazione |
| `Canale di registrazione` | dove l'ordine è stato inserito a sistema |

Il registro corrispettivi si costruisce **una riga per fatto commerciale**, mai una per
registrazione. Il criterio di unicità è **l'incasso sul gateway**: due registrazioni che
puntano allo stesso incasso sono lo stesso ordine.

**Controllo associato**: nessuna transazione di gateway può essere collegata a più di un
ordine. Se accade, entrambe le registrazioni vanno nel foglio Eccezioni con la dicitura
"ordine registrato su due canali".

**Perimetro `.eu` 2026 — verificato l'8 settembre 2026.** 43 ordini, € 2.559,81 in totale:

| Finestra | Ordini | Importo | Stato |
|---|---|---|---|
| fino al 01/07/2026 | 34 | € 1.966,92 | solo sul `.eu` |
| dal 02/07/2026 | 9 | € 592,89 | anche sul `.com` |

Dei 34 solo-`.eu`, uno — il carnet da € 299,90 del 03/05/2026 — risulta a libro per altra via.
Restano quindi **33 ordini per € 1.667,02 non registrati**, e **10 ordini per € 892,79 già a
libro**. Nessun doppio conteggio: le due categorie sono disgiunte e il checksum torna.

Ogni conteggio futuro di ordini `.eu` deve distinguere le due finestre, altrimenti somma
ordini che sul `.com` sono già registrati.

---

### 8.2 Il corrispettivo è il lordo pagato dal cliente

L'importo che entra nel registro è quello che il **cliente ha pagato**, non quello che il
gateway ci accredita al netto della sua commissione.

La commissione del gateway è un **costo separato**, con la sua autofattura in reverse charge:
sottrarla dal corrispettivo significherebbe dichiarare vendite più basse del vero e perdere
il costo. Sui report dei gateway va quindi presa la colonna dell'importo **lordo**, mai quella
del netto.

Esempio dal T2 2026: PayPal lordo € 593,79 contro netto € 579,36. La differenza di € 14,43 è
la commissione, che è un costo, non un minor ricavo.

**Lista di origine vs gateway.** Quando un ordine (anche da elenco `.eu` o altra lista di
lavoro) è abbinato a un movimento gateway, **l'importo incassato viene dal gateway**. La lista
serve a identificare l'ordine, non a valorizzarlo. Se lista e gateway divergono, vince il
gateway e la differenza va annotata in Eccezioni.

Lo stesso vale per le vendite con fiorista partner: il cliente paga FloreMoria al **lordo**;
il compenso al fiorista è un costo operativo separato, non una riduzione del corrispettivo.

---

### 8.3 Da dove viene l'aliquota

In FloreMoria esistono **due sole aliquote**:

| Bene | Aliquota |
|---|---|
| Fiori recisi, piante, composizioni floreali | **10%** |
| Accessori (biglietto, nastro commemorativo, lumino, ceri, fotografia, messaggio e simili) | **22%** |

Non ce ne sono altre. L'aliquota si determina **per riga prodotto**, non per ordine: un
ordine può contenere un bouquet al 10% e un nastro al 22%. Assegnare un'unica aliquota di
testata all'intero ordine è un errore.

**Ordine di lettura (nessuna stima per divisione imposta/imponibile):**

| Priorità | Caso | Stato | Azione |
|---|---|---|---|
| 1 | Riga collegata a un prodotto in anagrafica | **determinata** | aliquota dal campo della pagina Prodotti (`Product.vatRatePercent`) |
| 2 | Ordine storico `.eu` senza prodotto in anagrafica sulla riga | **presunta** | default **10%** floreale, con motivazione registrata |
| 3 | Nessuno dei due | **mancante** | riga in Eccezioni, esclusa dai totali IVA |

Ogni prodotto a catalogo porta la propria aliquota come **attributo del prodotto**. Non si
calcola dividendo imposta per imponibile e non si inventa un'aliquota di testata.

Una regola di presunzione è ammessa solo se **scritta in questo metodo**. Oltre al default
floreale sullo storico `.eu` senza anagrafica:

> **FF-PD-26-002** — contiene un accessorio: non applicare il default 10% sull'intero
> incasso se manca lo split per riga; resta in Eccezioni finché le aliquote di riga non sono
> determinate.

Il foglio 0 riporta sempre quanto vale ciascuno dei tre stati in euro, così che il
commercialista veda su quale parte del fatturato l'aliquota è certa e su quale è presunta.
Un valore presunto non è un valore inventato solo perché è dichiarato tale e la sua regola è
verificabile.

**La fonte è la riga d'ordine nel database, non l'email di conferma.** L'email è un documento
generato *a partire* dall'ordine: sta più in basso nella gerarchia del §2 e leggerla come
fonte significherebbe ricostruire un dato che il sistema possiede già. Se l'email contiene un
dettaglio che l'ordine non ha, il problema non è che vada letta l'email — è che il database
degli ordini è incompleto, e va completato.

**Recupero dello storico.** Solo per gli ordini già chiusi in cui le righe non sono
recuperabili dal database, si ammette una lettura una-tantum delle ricevute inviate al
cliente, a condizione che ogni riga così ricostruita sia marcata con l'origine
"ricostruita da ricevuta" e compaia nel foglio Eccezioni. È un recupero storico, mai il
metodo a regime.

Regole:
- i rimborsi sono righe negative, mai righe cancellate, e devono riportare il **numero
  dell'ordine originario** e la data dell'incasso che stornano;
- se l'ordine originario appartiene a un periodo IVA **già liquidato**, la riga va **anche**
  nel foglio Eccezioni con la dicitura "rimborso su periodo chiuso": il trattamento fiscale
  (variazione in diminuzione, rettifica dei corrispettivi, o altro) dipende da come sono
  certificate le nostre vendite, ed è una decisione del commercialista. **Il sistema segnala
  il caso e non lo classifica**: non deve mai scrivere da sé "nota di credito" né decidere
  quale norma applicare;
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

## 11. Periodo, competenza e cassa

Il dossier ha **due orizzonti** e non vanno confusi, perché seguono regole diverse.

| | Dossier trimestrale | Dossier annuale |
|---|---|---|
| Serve per | liquidazione IVA e LIPE | bilancio e dichiarazione dei redditi |
| Criterio | data del documento e data dell'incasso | competenza economica |
| Rettifiche | nessuna | risconti, fatture da ricevere, costi e ricavi di altri esercizi |

Il dossier trimestrale espone i fatti come sono avvenuti nel periodo, senza rettifiche.

Il dossier annuale espone **in un blocco separato e dichiarato** le rettifiche di competenza:
ricavi incassati per prestazioni non ancora rese, costi di esercizi precedenti pagati
nell'anno, prestazioni ricevute e non ancora fatturate. Ogni rettifica riporta l'importo, il
periodo di destinazione e il motivo.

**Regola**: una rettifica di competenza non modifica mai le righe originali. Si aggiunge come
riga di rettifica, con il riferimento alla riga che rettifica. Chi legge deve poter vedere sia
il dato di cassa sia quello di competenza, e capire come si passa dall'uno all'altro.

---

## 12. Denominazione e tracciabilità

Nome file: `Dossier_Fiscale_FloreMoria_<anno>_<periodo>_v<n>.xlsx`

Il foglio 0 riporta sempre, in fondo: data e ora di generazione, versione del metodo
applicata, periodo coperto, e l'elenco delle fonti usate con il loro identificativo
(nome del PDF dell'estratto conto, data di export dei report gateway).

Due dossier generati in momenti diversi sugli stessi dati devono dare gli stessi numeri.
Se non lo fanno, c'è una funzione che modifica i dati mentre li legge.

**Versionamento del metodo.** Quando questo documento cambia, la versione riportata in cima
sale e il foglio 0 di ogni dossier successivo dichiara quale versione ha applicato. Due
dossier costruiti con versioni diverse del metodo non sono confrontabili riga per riga, e chi
li confronta deve poterlo sapere senza indovinarlo. Le modifiche al metodo si annotano in
fondo a questo file, con data e motivo.

---

## 13. Prodotti prepagati a consegne multiple (carnet — residui)

**Il prodotto carnet è dismesso.** Il modello commerciale attuale è l'acquisto ricorrente
con link mensile e scelta libera. Questa sezione vale solo per i **carnet residui** ancora
in esecuzione (al 11 settembre 2026: un solo caso attivo) e per la lettura corretta dei
dati storici.

| Momento | Trattamento fiscale operativo | Cosa non fare |
|---|---|---|
| Pagamento anticipato del pacchetto | **Ricavo ai fini IVA per l'intero importo** alla data dell'incasso gateway | Spalmare l'IVA sulle consegne successive |
| Consegne successive (pose / esecuzioni) | Esecuzione operativa a **€ 0**: non generano né ricavo né nuovo incasso | Creare corrispettivi o righe di registro fiscale sulle pose |
| Fine esercizio | La ripartizione per competenza (risconto passivo sulla quota non ancora consegnata) è una **scrittura del commercialista**, non una registrazione operativa del gestionale | Inventare un modello dati «consegne residue» nel prodotto dismesso |

**Perimetro software.** Il filtro `isPrepaidSubscriptionPoseOrder` esclude le pose senza
pagamento gateway da: Registro corrispettivi (già gateway-only), Prima Nota ricavi, e
**Registro fiscale (`taxRegister`)** — stesso criterio, nessun canale IVA che conti due
volte. Un ordine `isRecurring` che ha invece un pagamento gateway reale non è una posa.

**Eccezioni.** Storni di ricavi fittizi sulle pose e registrazioni di carnet residui si
annotano nel foglio Eccezioni (prefisso operativo `DOSSIER_ECCEZIONE:` su `financeNotes`),
senza cancellare le righe di esecuzione.

---

## Registro delle modifiche

**1.19 — 11 settembre 2026**
- §6.2.1 — **architettura**: un solo transito vendite (**Stripe**); PayPal = conto di
  pagamento (spese / residuali, nessun inbound da ordine); **incassi fuori gateway**
  separati (`10400`, `MANUAL_INBOUND`). PayPal non è gateway di vendita (è metodo *dentro*
  Stripe).
- §5 — C10 solo Stripe; C13 = saldo transito vendite Stripe + riconciliazione conto PayPal.
- §6.1 / §6.2 — mastri e regole di attribuzione allineati.

**1.18 — 11 settembre 2026**
- Fatturato ufficiale 2026 da **lista operativa**: €4.098,68 su **75** ordini attivi
  (T1 21 / €1.038,23 · T2 21 / €1.211,03 · T3 33 / €1.849,42); esclusi annullati, test,
  pose carnet a €0. La stima manuale €4.587 è **dismessa**.
- Status `DELIVERED_UNPAID` incluso nel perimetro ricavi (chiude 74→75).
- §6.2.1 — payout Stripe solo su id `po_*` (mai `txn_*` speculari).

**1.17 — 11 settembre 2026**
- §5 — **C13 Saldo di transito** (ledger vs saldo wallet **dichiarato** dall’utente; senza
  dichiarazione → non verificabile).
- §6.2.1 — conto di transito: tre gambe (incasso / commissione / payout) + rimborsi;
  idempotenza su id evento; duplicati di canale senza seconda gamba; corrispettivi intatti.

**1.16 — 11 settembre 2026**
- §5.1 — tripartizione **controllo** / **lista di lavoro** / **risultato**: scostamento nullo
  fra due letture (non “importo zero”); liste non vuote per arretrato; risultati senza
  atteso né colore. Verde/rosso solo sui controlli; le tre cose mai nella stessa vista.

**1.15 — 11 settembre 2026**
- §5 — C11 riscritto su **insiemi orderId** anno solare (non somme euro); aggiunto **C12**
  data ordine = data incasso (tolleranza fuso 24h).
- §5.1 — distinzione **controllo** vs **lista di lavoro**; fatture fiorista = lista «Da
  sollecitare», mai fra i C*.
- §5.2 — invariante date: ordine = pagamento cliente; fiorista/fattura per riferimento ordine;
  cavallo d’anno a richiesta.

**1.14 — 11 settembre 2026**
- §5 — **C11 Coerenza di perimetro** (prima versione su totali euro; sostituita in 1.15).

**1.13 — 11 settembre 2026**
- §13 — prodotti prepagati a consegne multiple (carnet dismesso; regola IVA intera al
  pagamento; pose a €0; risconto = scrittura commercialista; perimetro `taxRegister`).

**1.12 — 10 settembre 2026**
- §8.2 — se ordine abbinato a gateway, vince il **lordo gateway**; lista solo identifica; delta in Eccezioni.
- §8.3 — sole aliquote 10%/22% per **riga prodotto**; ordine di lettura determinata → presunta (.eu storico) → mancante; vietata stima imposta/imponibile.

**1.11 — 10 settembre 2026**
- §2 — identità fattura passiva = **P.IVA fornitore + numero documento** (non il nome; data e
  imponibile solo come conferma). Priorità canali invariata (YouDox > Report > manuale).
  Aliquota: letta dalla fonte, mai stimata; se assente → Eccezioni.

**1.10 — 10 settembre 2026**
- §2 — il periodo in corso ammette l'inserimento della lista movimenti come dato
  **provvisorio**, con guardrail anti-saldo, deduplica su fingerprint esistente, C3 non
  verificabile e passaggio a definitivo all'arrivo dell'estratto ufficiale. Le righe
  provvisorie non confermate dal documento ufficiale vanno in Eccezioni, non cancellate.
- §4.1 — il foglio Liquidazione IVA dichiara in testa se il periodo contiene righe provvisorie.

**1.9 — 9 settembre 2026**
- §3 — ordine fogli ripensato per la liquidazione IVA del commercialista: Corrispettivi →
  Acquisti → Banca → Liquidazione IVA → Da chiarire; Quadratura e controlli C1–C12 in coda.
  Liquidazione espone reverse charge su entrambi i lati e, in testa, se il file quadra.

**1.8 — 9 settembre 2026**
- §2 — la regola sui file ufficiali vale per i nuovi caricamenti. I documenti già in archivio
  restano validi; dove mancano i saldi dichiarati, C3 è *non verificabile* su quel periodo,
  non fallito, e non blocca il lavoro.

**1.7 — 8 settembre 2026**
- §8.2 — nuova: il corrispettivo è l'importo **lordo** pagato dal cliente, mai il netto
  accreditato dal gateway. La commissione è un costo separato.
- §8.3 — ex §8.2, più i **tre stati dell'aliquota** (determinata / presunta / mancante) e la
  regola di presunzione per il canale `.eu` fino al 01/07/2026.

**1.6 — 8 settembre 2026**
- §2 — gerarchia fra canali di ingestione delle fatture passive: Youdox vince sul report
  periodico, che vince sull'inserimento manuale. Stesso fornitore + data + numero = stesso
  documento.
- §8.1 — corretta la data del riporto `.eu` → `.com`: **2 luglio 2026**, non 1° maggio.
  Aggiunto il perimetro verificato: 43 ordini / € 2.559,81, di cui 33 non registrati per
  € 1.667,02. Nessun doppio conteggio.

**1.5 — 8 settembre 2026**
- §8.1 — nuova: ordini `.eu` riportati a mano sul `.com` dal 1° maggio 2026. Distinzione fra
  canale di incasso e canale di registrazione; il criterio di unicità del corrispettivo è
  l'incasso sul gateway, non la registrazione dell'ordine.
- §8.2 — ex §8.1 (da dove viene l'aliquota), rinumerata.

**1.4 — 8 settembre 2026**
- §6.4 — nuova: il costo standard del fiorista è un parametro deciso dall'azienda, non una
  stima. Usi ammessi: incarico operativo, margine, e **una sola** scrittura contabile —
  la fattura da ricevere, che si chiude all'arrivo del documento del fornitore.
- §6.5 — ex §6.4 (acquisti da fornitori esteri), rinumerata.

**1.3 — 8 settembre 2026**
- §8 — il registro corrispettivi ha una riga per **ordine + aliquota**, non per ordine: un
  ordine con fiori e accessori produce due righe.
- §8.1 — nuova: l'aliquota è un attributo del prodotto a catalogo (10% fiori e piante, 22%
  accessori) e si legge dalla riga d'ordine, mai dall'email di conferma, che è un derivato.
  Lettura delle ricevute ammessa solo come recupero storico, con marcatura dell'origine.

**1.2 — 8 settembre 2026**
- §5 — C6 si misura sull'**imponibile**, non sul totale documento. La v1.1 non lo diceva e
  il controllo restituiva 0 coppie invece di 6, perché nelle coppie tecniche i totali non
  sono opposti (la riga positiva porta l'IVA del reverse charge).
- §6.4 — nuova sezione sugli acquisti da fornitori esteri: una sola riga per documento, e
  regola sulla doppia ingestione dello stesso documento da canali diversi. *(rinumerata §6.5
  nella v1.4)*

**1.1 — 8 settembre 2026**
- §2 — il vincolo sugli estratti conto passa dal formato alla provenienza: ammesso qualsiasi
  file scaricato dal portale della banca purché riporti i saldi dichiarati dalla banca;
  resta vietato il testo incollato a mano.
- §4.2 — l'IVA delle autofatture in reverse charge entra nel calcolo su entrambi i lati
  invece di essere esposta fuori dal saldo: effetto nullo sul saldo, registri completi.
- §5 — C6 riformulato per non intercettare rimborsi e note di credito, che sono fatti
  economici e non artefatti del sistema.
- §8 — i rimborsi riportano l'ordine originario; quelli su periodi IVA già liquidati vanno
  in Eccezioni senza che il sistema ne decida il trattamento fiscale.
- §11 — nuova sezione sulla distinzione fra dossier trimestrale (cassa, IVA) e annuale
  (competenza, bilancio).
- §12 — versionamento del metodo dichiarato nel foglio 0 di ogni dossier.

**1.0 — 8 settembre 2026**
- Prima stesura, a seguito dell'analisi del dossier T2 2026 che presentava 19 movimenti
  bancari mancanti per € 387,90, nessun registro dei corrispettivi, 6 righe tecniche di
  storno e un totale di canale non omogeneo.

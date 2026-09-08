# Metodo — Dossier Fiscale FloreMoria

Specifica funzionale del documento che il sistema produce per il commercialista.
Versione 1.6 — 8 settembre 2026.

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
| 2 | Report gateway (Stripe, PayPal) | gli incassi dai clienti e le commissioni | export ufficiale del gateway |
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

Un file che non soddisfa entrambe le condizioni viene rifiutato in ingresso, con il motivo
scritto. Il sistema registra per ogni estratto: nome del file, data di download, periodo
coperto, saldo iniziale e finale letti.

**Gerarchia fra canali di ingestione delle fatture passive.** Lo stesso documento può arrivare
da più canali. Quando due canali portano una fattura con **stesso fornitore, stessa data e
stesso numero progressivo**, si tratta dello stesso documento e ne sopravvive uno solo:

| Priorità | Canale |
|---|---|
| 1 | Youdox |
| 2 | Report fatture ricevute (file periodico) |
| 3 | Inserimento manuale |

Il documento del canale con priorità più bassa **non compare in tabella e non concorre ad
alcun totale**. Viene annotato nel foglio Eccezioni come "documento già acquisito da canale
prioritario", secondo la §6.5.

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
| IVA reverse charge — a debito | foglio 4, autofatture |
| IVA reverse charge — a credito | foglio 4, autofatture (stesso importo) |
| **Saldo del periodo** | totale debito meno totale credito |

**Sul reverse charge.** L'IVA delle autofatture estere entra nel calcolo **due volte**: una
riga a debito e una riga a credito, dello stesso importo. L'effetto sul saldo è nullo, ma le
due righe devono comparire entrambe, perché nei registri IVA quell'imposta esiste su entrambi
i lati — registro acquisti e registro vendite — e da lì passa nei quadri della dichiarazione.
Esporla come una nota fuori dal calcolo, come faceva la versione 1.0 di questo metodo, dà un
saldo giusto ma registri formalmente incompleti.

Il foglio 0 riporta quindi due totali distinti: **IVA a debito complessiva** (vendite +
reverse charge) e **IVA a credito complessiva** (acquisti + reverse charge), e il saldo è la
loro differenza.

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
| C6 | Nessuno storno tecnico | numero coppie di righe con lo **stesso identificativo di documento** e **imponibile** uguale e opposto | 0 |
| C7 | Identificazione fornitori | numero documenti senza partita IVA o codice fiscale | 0 |
| C8 | Mastri ammessi | numero righe con mastro fuori dall'elenco chiuso | 0 |
| C9 | Partite di giro | numero movimenti di transito classificati come ricavo o costo | 0 |
| C10 | Doppia gamba transito | per ogni gateway: somma dare − somma avere − saldo wallet dichiarato | 0 |

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

### 8.2 Da dove viene l'aliquota

L'aliquota si determina **riga per riga dell'ordine**, secondo la natura del bene:

| Categoria | Aliquota |
|---|---|
| Fiori recisi, piante, composizioni floreali | 10% |
| Accessori: biglietto, nastro commemorativo, lumino, ceri, fotografia e simili | 22% |
| Consegna | non addebitata: nessuna riga |

Ogni prodotto a catalogo porta la propria aliquota come **attributo del prodotto**. Non si
deduce dal nome, non si indovina per categoria di testo, non si applica un valore di default.

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

## Registro delle modifiche

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

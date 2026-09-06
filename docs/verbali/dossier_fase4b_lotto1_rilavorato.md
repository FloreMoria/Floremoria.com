# Fase 4b — Lotto 1 RILAVORATO (sola lettura, nessuna esecuzione)

**Data:** 2026-09-06  
**Stato:** NIENTE VIA LIBERA · indagine forense · nessuna destinazione societaria proposta per lo studio.

---

## a) Riga €32.410,30 (`cmte1n28n00hyl804mcsu51rv`)

### Contesto documentale

| Campo | Valore |
|-------|--------|
| Documento | `fineco-paste-2026-08-24T20-15-46-786Z.txt` (`cmt7oeh710000l204vpudl69g`) |
| Origine | **Incolla Fineco** (`source: fineco_paste`) — non PDF trimestrale |
| `openingBalanceCents` sul documento | **null** |
| Causale in archivio | **`Movimento Fineco (incolla)`** (fallback del parser, non causale bancaria reale) |
| Controparte | **assente** |
| Righe 2025 in tutto Neon | **1 sola** = questa |

### Domanda 1 — Esiste un movimento distinto da €30.000,00 nell’estratto 2025?

**No.**

- Query su tutte le `bank_statement_lines` con data 2025: **1 riga totale**.
- Nessuna riga con `amountCents = ±3.000.000` (€30.000,00).
- Nessuna riga “vicina” a €30.000 (±€500).

Non esistono quindi data / causale integrale / controparte da riportare per un movimento €30.000: **quel pezzo non è in archivio**.

### Domanda 2 — Cosa sono i €2.410,30 residui?

**Non sono un movimento distinto in archivio.**  
€32.410,30 − €30.000,00 = €2.410,30 è solo un’**aritmetica ipotetica** su un importo unico: non c’è una seconda riga da €2.410,30 né evidenza che il paste abbia spezzato due operazioni.

Confronto utile con il PDF ufficiale Q1 2026:

| Fonte | Importo |
|-------|---------|
| Riga paste 2025-12-02 | **€32.410,30** |
| Saldo iniziale PDF «1° trimestre Fineco.pdf» | **€32.120,48** |
| Differenza paste − apertura PDF | **€289,82** |

I €2.410,30 non corrispondono a questa differenza; restano **non documentati** come pezzo separato.

### Domanda 3 — La riga ha inglobato il saldo iniziale?

**Sì, con alta probabilità è un BUG del percorso incolla (difetto separato).**

Evidenze:

1. Causale generica da fallback parser (`Movimento Fineco (incolla)` quando manca tipologia/descrizione — `parseFinecoPaste.ts`).
2. Documento paste con **`openingBalanceCents: null`**: il saldo non è stato registrato come apertura, ma come **movimento**.
3. Importo dello stesso ordine di grandezza del saldo iniziale ufficiale Q1 (€32.120,48).
4. Unica riga 2025 in DB; nessuna controparte/causale SEPA.

**Difetto da aprire (fuori Lotto 1 write):** il parser/incolla Fineco non deve mai trasformare un saldo iniziale in `BankStatementLine` / ricavo. Va corretto in `parseFinecoPaste` / store paste (ticket tecnico separato).

**Nessuna destinazione contabile proposta** (finanziamento soci / versamento in conto capitale / aumento capitale → **solo lo studio**).

---

## b) Riga €30,09 Wix/Adyen (`cmt3zx44i00d7ky04q8r3i71w`)

### Natura (una sola lettura)

| Indizio | Valore |
|---------|--------|
| Causale | Wix.com Luxembourg / **Adyen B.V.** / «Wix Payments» |
| `vatCents` | **0** |
| Ordini FloreMoria con payment Wix/Adyen | **0** (all-time) |
| Metodi pagamento 2026 in Order | null / Carta Stripe / PayPal(Stripe) — **nessun Wix** |
| Altre righe banca Wix/Adyen | **solo questa** |

**Determinazione (aggiornata dal socio):** è un’**entrata dal sito `.eu`** (altro store / checkout Wix), accreditata su Fineco via **Wix Payments / Adyen**.  
Non compare tra gli ordini del gestionale `.com` → zero ordini Wix lì è **atteso**, non un’anomalia.  
Resta il punto IVA: `vatCents=0` sulla riga banca — scorporo/IVA del canale `.eu` va allineato con lo studio; non inventare scorporo qui.

**Una sola destinazione (tecnica, Lotto 1):** uscire da `ALTRI_RICAVI` → **`DA_CLASSIFICARE` / `17900 - Partite da classificare`**, finché il canale `.eu` non è modellato nel registro (ricavo dedicato o scorporo corretto).  
`TRASFERIMENTO_INTERNO` **non regge** (una gamba sola, senza controparte Wix da istituire per una riga).  
Non lasciare in `ALTRI_RICAVI` etichettato come se fosse ricavo `.com` già chiuso.

### Canale

- **`.com` (gestionale attuale):** Wix/Adyen **non** è canale checkout attivo.
- **`.eu`:** sì — questa riga ne è prova di cassa. Modellazione contabile del canale = lavoro successivo (non aprire conto di transito Adyen per una sola riga; semmai ricavo/canale `.eu` quando lo studio lo definisce).

---

## c) Riga €0,11 e difetto strutturale RIMBORSI

La riga da €0,11 è irrilevante in sé. Misura strutturale:

### RIMBORSI dentro i ricavi 2026 (PnL post-gerarchia)

| Metrica | Valore |
|---------|--------|
| Righe `category=RIMBORSI` attive (raw) | **25** · €263,67 (valore assoluto grezzo) |
| Di cui **sommate nei ricavi PnL 2026** (dopo `applyFiscalAuthorityHierarchy`, non transfer) | **12** · **€44,88** |
| Inclusione nel motore | Sì: `computeHistoricalPnl` somma `RICAVI_VENDITE` **+** `ALTRI_RICAVI` **+** `RIMBORSI` in `ricaviLordiCents` |

**Difetto strutturale confermato e ora quantificato:** €44,88 di RIMBORSI (12 righe) gonfiano i ricavi 2026. Ticket analitico separato (non Lotto 1).

### Composizione ricavi 2026 (post-gerarchia, freeze)

| Categoria | Righe | Euro |
|-----------|-------|------|
| `RICAVI_VENDITE` (vendite caratteristiche) | 141 | **€5.932,14** |
| `ALTRI_RICAVI` (CCIAA €4.597,66 + Wix €30,09) | 2 | **€4.627,75** |
| `RIMBORSI` | 12 | **€44,88** |
| Somma categorie | — | €10.604,77 |
| `ricaviLordiCents` motore | — | €10.800,25 |
| Gap residuo gerarchia/altre entry | — | ≈ €195,48 (da analizzare in seguito) |

---

## Nuovo ordine lotti (confermato)

`Lotto 2 → Lotto 3 → Lotto 4 → Lotto 1 (quando completo) → Lotto 5`

# Correzione modello + misure (pre-Lotto 3) — sola lettura

**Data:** 2026-09-06  
**Vincolo:** ZERO scritture DB (nessuna esecuzione Lotto 3 qui; nessun lotto SDD eseguito)  
**Priorità operativa titolare:** export Wix (IVA / cosa venduto) — irreversible se `.eu` chiude.

---

## STOP — nessun numero finale di «vendite reali»

È **vietato** dichiarare nei verbali «vendite reali = €2.6xx».  
Quel pezzo è solo l’effetto meccanico del Lotto 3 sul motore PnL `.com` (payout fuori da `RICAVI_VENDITE`).  
Il fatturato societario include `.eu` e altre correzioni **ancora incomplete**.

---

## 1. Correzione: gli SDD PayPal SONO funding — conferma calcolo

Tesi socio:

| | Euro |
|--|------|
| Entrate PayPal contate (crediti ledger) | €1.682,95 |
| + Addebiti SDD Fineco→PayPal (tutte le righe) | €1.615,95 |
| = Totale entrate economiche | €3.298,90 |
| Uscite PayPal (debiti) | €3.251,25 |
| **Residuo** | **+€47,65** |

**Esito: il calcolo REGGE.** Il gap ledger −€1.568,30 è spiegato al **~97%** riconoscendo gli SDD come ricariche (stesso fenomeno del bonifico €500 del 5/09).

### Caveat tecnico (non smonta la tesi)

| Misura | Valore | Nota |
|--------|--------|------|
| SDD righe grezze | 45 · €1.615,95 | Include **€108,97** di doppi stesso giorno+importo su categorie diverse |
| SDD unici giorno+importo | 37 · **€1.506,98** | Base più pulita |
| Formula con SDD unici | €1.682,95 + €1.506,98 − €3.251,25 = **−€61,32** | Ancora ~96% del gap chiuso |
| + bonifico €500 (unico funding esplicito) | residuo **+€438,68** | Il €500 è recente (05/09): funding extra non ancora assorbito nello stesso modo nel saldo storico |

**Ritiro della conclusione precedente** («gli SDD non sono funding»): era sbagliata. Un addebito SEPA PayPal su Fineco è prelievo banca → wallet per coprire pagamenti dal wallet.

---

## 2. Doppio conteggio costi (SDD + spesa PayPal)

| Layer | Euro | Cosa |
|-------|------|------|
| Doppi SDD (stesso giorno+importo, 2 categorie) | **€108,97** | Solo artifact di doppia riga ledger |
| Match stretto SDD unico ↔ debito PayPal (±7 gg, stesso importo) | **€334,20** (15 match) | Lower bound: stessa spesa vista su banca e su PP |
| SDD unici oggi in categorie **costo** (`COSTI_FIORISTI`/`SPESE_*`) | **€325,96** | Se SDD = funding, questi **non** devono restare costo |
| SDD unici etichettati `RICAVI_VENDITE` (ma sono uscite banca!) | **€1.181,02** | Natura confusa: vanno a transito funding, non a ricavo |

**Stima operativa doppio conteggio costi da sanare (oltre i €7.482 Fase 4a):**  
almeno **€325,96–€334,20** (match/costo) + **€108,97** (dup categorie), e fino a **€1.506,98** se si riclassifica **tutto** l’SDD unico da costo/ricavo errato a **funding/transito** (tesi piena).  
Non eseguire ora — lotto preparato sotto.

Esiste già logica di supporto: `lib/financial/paypalSddReconcile.ts` (sola lettura / dedup vista).

---

## 3. PayPal `.eu` — misurabilità in Neon

| Domanda | Risposta |
|---------|----------|
| Marcatura `.eu` nei metadata PayPal in Neon? | **NO** — chiavi tipiche: `csvImport`, `typeLabel`, `feeCents`, `dareAccount`… niente account/site EU |
| Crediti PayPal con heuristic `.eu`/PSA/Wix | **0** |
| Importo PayPal EU misurabile da questo DB | **non misurabile** |

Il titolare conferma che **in dashboard PayPal/Stripe** i movimenti `.eu` sono marcati.  
Quindi: Stripe EU è al sicuro in Neon (`docs/exports/stripe_eu_*.csv`, €3.732,14 charge+payment).  
PayPal EU va letto dall’export dashboard (o re-import con flag account) — **non** dal ledger attuale.

---

## 4. «Ricavi negativi» PayPal — elenco e impatto vendite

| Campo | Valore |
|-------|--------|
| Righe | **38** |
| Importo esatto | **€1.623,04** (`162304` cent) |
| Natura | Pagamenti fornitori (Aruba, irin/Wosnic, Maspes, Orchideadongo, Poste, Very Mobile, Apple, Facebook, …) |

### Di quanto «risalgono» le vendite togliendoli?

**Nel motore PnL attuale: di €0 sulle vendite caratteristiche.**

Perché: `computeHistoricalPnl` somma nei ricavi solo `ENTRATA` / `totalCents > 0`.  
Queste righe sono `USCITA` → oggi finiscono nei **costi** (se sopravvivono alla gerarchia: 27 · €1.288,06), non abbassano `venditeCaratteristicheCents`.

Quindi **non** vanno sommate come «+€1.623 alle vendite reali».  
Vanno **riclassificate** da `RICAVI_VENDITE` → spesa/fornitore (etichetta onesta). Effetto: chiarezza + costi già presenti meglio etichettati; **non** un salto delle vendite di €1.623.

Top importi: irin srl €681,49 · Maspes/staff €133×2 · Aruba €73,19+€61+€6,09 · Ballarate €57,95 · …

---

## 5. Stima di lavoro VENDITE (non ufficiale — incompleta)

| Componente | Euro | Stato |
|------------|------|--------|
| Effetto meccanico `.com` post-Lotto 3 (payout fuori vendite) | ≈ €2.728 | **Non** «vendite reali» — solo PnL `.com` dopo storno payout |
| Stripe EU charge+payment senza Order | **€3.732,14** | Vendite `.eu` gateway — sì, da contare; manca distinta IVA (serve Wix) |
| PayPal EU | **?** | **Fuori misura** in Neon |
| «+€1.623 ricavi negativi» | **non sommare** | Sono costi mal etichettati, non vendite nascoste |
| Wix/Adyen già in cassa | €30,09 | Minimo; canale `.eu` |

**Totale parziale misurabile oggi (ordine di grandezza):**  
≈ €2.728 + €3.732 ≈ **€6.460** (+ PayPal EU ignoto + Wix oltre €30 + eventuale riallineamento IVA).  
**Non chiudere** questo numero in verbale come fatturato ufficiale.

---

## 6. Modello Fase 2 — TRE gambe (aggiornamento)

Il conto di transito gateway (PayPal 10200 / Stripe 10300) **non** è solo raccolta→banca.

```
ENTRA:
  (1) Incassi clienti (checkout)
  (2) Ricariche dalla banca — bonifico OR addebito SDD/SEPA

ESCE:
  (3a) Payout verso banca Fineco
  (3b) Pagamenti a fornitori / spese
  (3c) Commissioni
```

Implicazioni:

- SDD Fineco→PayPal e bonifici di funding → `TRASFERIMENTO_INTERNO` (o funding dedicato), **mai** `SPESE_*` / mai `RICAVI_VENDITE`
- Spese pagate da PayPal → costo sul CE **una sola volta** (lato PP o lato SDD abbinato, non entrambi)
- Saldo transito atteso ≈ 0 ± fee/timing, non un «buco» strutturale da −€1.568

Vedi anche appendice in `docs/verbali/06-09-2026-fase2-modello-contabile.md`.

---

## 7. Lotto riclassifica PREPARATO (non eseguito) — candidati

**Nome proposto:** Lotto 3b / Lotto SDD-funding (dopo Lotto 3 payout, o parallelo doc)  
**batch_id:** `FASE4B_L3B_<ts>` all’esecuzione — **NON ora**

| Blocco | Azione proposta | Ordine grandezza |
|--------|-----------------|------------------|
| A. Bonifico €500 Fineco→PayPal | `SPESE_OPERATIVE` → `TRASFERIMENTO_INTERNO` funding | €500 |
| B. SDD unici PayPal su Fineco | da costo/ricavo errato → funding/transito | fino a €1.506,98 |
| C. PayPal `RICAVI_VENDITE` USCITA | → `SPESE_OPERATIVE` / SaaS / fiorista (per controparte) | €1.623,04 |
| D. Dedup SDD doppia categoria | soft-reverse duplicato | €108,97 |
| E. Match SDD↔PP già in `paypalSddReconcile` | una sola gamba costo | ≥ €334,20 |

Dry-run dettagliato e via libera: **separati**, dopo Lotto 3 payout se si procede.

---

## 8. Lotto 3 (payout)

Può procedere come storno/riclassifica delle 87 righe.  
Nel report Lotto 3: riportare solo effetto su categorie / invarianti banca / RAI — **senza** frase «vendite reali = €2.6xx».

**Questa sessione: Lotto 3 NON eseguito** (manca via esplicita all’esecuzione; indagine prioritaria).

---

## STOP

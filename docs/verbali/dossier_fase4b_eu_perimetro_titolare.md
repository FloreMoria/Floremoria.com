# Fase 4b — Perimetro .eu titolare (fonte ufficiale) + gate misure

**Data:** 2026-09-07  
**Stato pacchetto studio:** **BLOCCATO** fino a chiusura punto 3 (misure a/b firmate nel totale vendite)  
**Modalità:** sola lettura DB

---

## 1 — Perimetro .eu sostituito (lista titolare)

Verifica riga per riga del titolare. **Sostituisce** i totali «33 assenti €1.926,93» / «34 mancanti» precedenti.

| Voce | Valore |
|------|--------|
| Righe lista non in `.com` | **33** |
| Ordini .eu non inseriti | **34** |
| Totale non inseriti | **€1.667,02** |
| Ordini già inseriti sul `.com` | **10** · **€892,79** |
| Checksum | 1.667,02 + 892,79 = **€2.559,81** ✓ |
| Sovrastima precedente (€1.926,93) | **€259,91** |

### IVA teorica 10% — solo non inseriti (corrispettivi)

| Trimestre | Righe | Lordo | IVA 10% |
|-----------|-------|-------|---------|
| **T1** | 21 | **€1.038,23** | **€94,38** |
| **T2** | 12 | **€628,79** | **€57,16** |
| **T3** | 0 | €0 | €0 |
| **Totale** | **33** | **€1.667,02** | **€151,54** |

### Archivio numeri precedenti (non usare)

| Vecchio | Valore | Motivo ritiro |
|---------|--------|---------------|
| «34 assenti» listino | €2.036,91 | match importo-vincolante + Isabella/Amanda mal classificati |
| Gruppo C rematch ±3g | €1.926,93 | ancora sovrastima vs lista titolare (−€259,91) |
| IVA su C+ΔB | €181,59 | basata su perimetro ritirato |
| Pacchetto studio tabella 34 | €185,17 IVA | **non inviare** |

---

## 2 — Caso Isabella (pacchetto prepagato)

### Fatti titolare
- Un pagamento Stripe **€284,90** il **03/05/2026** per **11 consegne**
- Sul `.com` inserite come 11 × €29,99 = **€329,89**
- Corrispettivo corretto: **€284,90** competenza **03/05/2026 (T2)**
- Gli ordini `.com` = tracciamento operativo, **non** ricavi

### Cosa c’è nel DB oggi

| Record | Dettaglio |
|--------|-----------|
| Stripe EU charge | `stripe_eu_tx_txn_3TSzMs…` · **€284,90** · 03/05 · fee €4,52 |
| Fineco accredito | **€278,75** · 07/05 (payout Stripe) |
| Ordine pacchetto | `FT-MC-26-001` **€299,90** CANCELLED + soft-deleted 02/07 |
| Pose €29,99 attive | **4** (`FT-MC-26-003…006`), non 11 · somma €119,96 |
| Pose eliminate | `FT-MC-26-002` €29,99 deleted |
| Ledger `RICAVI_VENDITE` pose | **3** JSON_ENTRY × €29,99 = **€89,97** (003/004/005) |
| `FT-MC-26-006` | PENDING/UNPAID — nessun ricavo ledger |

**Scarto vs rivendicazione 11 pose:** in Neon risultano **4 attive + 1 deleted**, non 11. Va allineato col titolare (export Wix / elenco consegne).

### Doppio conteggio sul ledger 2026

| Strato | Pre-Lotto 3 | Post-Lotto 3 |
|--------|-------------|--------------|
| Fineco Stripe €278,75 | in **`RICAVI_VENDITE`** | **`TRASFERIMENTO_INTERNO`** (uscito dal CE) |
| Charge €284,90 | solo in `StripeFinanceMovement` (+ fee ONERI €4,52) | invariato |
| Pose JSON_ENTRY €89,97 | in **`RICAVI_VENDITE`** | ancora in **`RICAVI_VENDITE`** |

**Pre-L3 (doppio sul CE):** bank €278,75 + pose €89,97 = **€368,72** contabilizzati come ricavi vs corrispettivo corretto **€284,90** → **sovra-conteggio €83,82** (solo sulle pose già in ledger; se fossero 11×€29,99 in ricavi sarebbe +€329,89 vs €284,90 = +€44,99 oltre al bank).

**Post-L3:** il payout Fineco non è più ricavo; restano **€89,97** di pose come ricavi (errati rispetto alla regola «solo €284,90») e il charge €284,90 **non** è una riga `RICAVI_VENDITE` separata (mai stata: entrava via bank).  
Quindi post-L3: **manca** il ricavo pacchetto €284,90 in CE e **restano** €89,97 spurî di pose.

### Altri casi analoghi (stesso cliente · stesso importo unitario · n≥3)

| Cliente | Unitario | N ordini `.com` | Somma | Nota |
|---------|----------|-----------------|-------|------|
| **Luciano Mammì** | €31,48 | **12** | €377,76 | pattern abbonamento/pose; in ledger molte JSON_ENTRY `RICAVI_VENDITE` (~€1.254 con anche FF-PA €144,98); charge Stripe «Subscription creation» presenti |
| **Isabella Cesaroni** | €29,99 | **4** (attivi) | €119,96 | pacchetto sopra; `isRecurring=true` |

Nessun altro buyer con ≥3 ordini allo stesso importo unitario (soglia usata). Luciano è il caso analogo principale da trattare come Isabella (incasso vs pose).

---

## 3a — RICAVI_VENDITE 2026 positivi / negativi

Misura **congelata pre-write Lotto 3** (script execute, gerarchia fiscale) — chiude la disputa sul totale vendite:

| | N | Euro |
|--|---|------|
| Positivi | 147 | **€6.057,75** |
| Negativi | 51 | **−€2.693,19** |
| Somma algebrica | | **€3.364,56** |
| `venditeCaratteristiche` motore (pre-L3) | | **€5.736,32** |

**Conclusione:** algebrica ≠ vendite motore. I negativi stanno nel ramo **costi** del PnL → **non deprimono** `venditeCaratteristiche`. I ≈€1.623 PayPal negativi (subset storico) **non** sono «dentro» il totale vendite da alzare.

*Stato post-L3 (informativo): vendite motore **€2.919,99**.*

---

## 3b — Lista vs incasso (gateway)

Su tutti gli .eu della lista 43 abbinabili a Stripe/PayPal (exact ±3g + Isabella 299,90↔284,90):

| | |
|--|--|
| Abbinati a movimento | **36** (misura stretta charge/PayPal; variante solo-charge: 27) |
| Con delta | **1** |
| Delta totale | **€15,00** (Isabella listino−charge) |
| .eu 43 ricalcolato su incassi | **€2.544,81** |

*(Con la regola corrispettivo Isabella = €284,90, quel delta €15 è listino pacchetto vs charge — allineato al punto 2.)*

---

## 4 — Lotto 3 post-esecuzione

| | |
|--|--|
| **batch_id** | `FASE4B_L3_20260906_215954` |
| Righe | **87** → `TRASFERIMENTO_INTERNO` |
| Snapshot | `2026-09-06T21:53:19.251Z` |

| Metrica | Pre snapshot | Dry-run atteso | **Post** | Scostamento |
|---------|--------------|----------------|----------|-------------|
| Vendite caratteristiche | €5.736,32 | €2.728,52 | **€2.919,99** | +€191,47 (pose già fuori motore) |
| Risultato ante imposte | −€2.684,71 | ≈+€323,09 | **−€5.692,51** | dry-run segno invertito |
| IVA debito | | | **€134,97** | |
| Banca aggregata Fineco | €32.403,61 (L0) | n/a L3 | **€32.006,13** | deriva non-L3 |

**Vendite .com post-L3 = €2.919,99. Totale complessivo vendite: in verifica (pacchetto bloccato).**

---

## STOP

1. Perimetro aggiornato ai numeri titolare.  
2. Isabella: doppio conteggio quantificato; DB ha 4 pose non 11.  
3a/3b eseguite.  
4. Lotto 3 riportato.  
**Non sbloccare** il pacchetto studio finché il totale vendite non incorpora 3a + perimetro €1.667,02 + regola Isabella €284,90.

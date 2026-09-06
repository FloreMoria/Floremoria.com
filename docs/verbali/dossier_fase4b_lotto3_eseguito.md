# Fase 4b — Lotto 3 ESEGUITO + misure A/B/C

**batch_id:** `FASE4B_L3_20260906_215954`  
**Eseguito:** 2026-09-06T22:00:09.115Z  
**Snapshot dry-run di riferimento:** `2026-09-06T21:53:19.251Z`

---

## A — Misura (sola lettura, pre-write Lotto 3)

Somma righe `RICAVI_VENDITE` 2026 **dopo** gerarchia fiscale, **prima** dell’esecuzione L3:

| | N | Euro |
|--|---|------|
| Importi **positivi** (`totalCents > 0`) | 147 | **6.057,75 €** |
| Importi **negativi** (`totalCents < 0`) | 51 | **−2.693,19 €** |
| Somma **algebrica** | | **3.364,56 €** |
| `venditeCaratteristicheCents` motore (pre-L3) | | **5.736,32 €** |

Ramo PnL (stesso insieme):

| Ramo | N | Euro |
|------|---|------|
| Contate come ricavi (`ENTRATA` ∨ `totalCents > 0`) | 147 | 6.057,75 € |
| Contate come costi (`USCITA` e non positive) | 51 | 2.693,19 € |

**Conclusione (solo numeri):**  
- somma algebrica **≠** €5.736,32 (è €3.364,56);  
- i negativi sono **−€2.693,19**, non ≈ −€1.623;  
- `venditeCaratteristiche` motore = ramo positivi (poi filtro pose), **non** la somma algebrica;  
- i negativi stanno nel ramo **costi** → **non deprimono** `venditeCaratteristicheCents`.  
Codice: `NEGATIVI_NON_DENTRO_VENDITE_MOTORE`.

---

## B — Ordine lista vs incasso (tutti gli .eu abbinati Stripe/PayPal)

| | |
|--|--|
| Ordini abbinati | **42** |
| Con delta listino ≠ incasso lordo | **1** (solo Isabella) |
| Delta totale (lista − incassato) | **€15,00** |
| Somma lista abbinati | €2.449,83 |
| Somma incassato abbinati | €2.434,83 |
| Totale .eu 43 su base incassi (unmatched = lista) | **€2.544,81** |
| 34 mancanti su lista | €2.036,91 |
| 34 mancanti su base incassi dove abbinati | **€2.021,91** |
| IVA 10% teorica 34 (lista) | €185,17 |
| IVA 10% teorica 34 (incassi) | **€183,81** |

Unico delta: Isabella Cesaroni 2026-05-03 — lista €299,90 · incassato €284,90 · Δ €15,00.

---

## C — Amanda €109,98 (lista) — rettifica post-titolare

Titolare: fiore consegnato **e** ordine già in `.com`.

| | |
|--|--|
| `Order` | `FF-PN-26-003` · 2026-08-17 · Amanda Favot · **€39,99** |
| Stato | `COMPLETED` · `PAID` · 5 foto consegna (Sabina Favot) |
| Incasso | Stripe EU stesso giorno **€39,99** («Subscription creation») |
| Perché era nei 34 | match su importo **€109,98** (fallito); nome+data avrebbero matchato |
| Gap aperto | lista €109,98 − .com €39,99 = **€69,99** |

Ricalcolo «assenti da Order» (togliendo solo la riga Amanda lista): 33 · **€1.926,93** · IVA 10% **€175,18** — valido solo se si accetta che il corrispettivo gestionale sia €39,99 e il €69,99 di gap non sia un secondo ricavo assente.

---

## D — Esecuzione Lotto 3

| | |
|--|--|
| Righe toccate | **87** |
| Azione | RECLASS → `TRASFERIMENTO_INTERNO` + metadata `fase4bBatchId` / `fase4bLotto=3` |
| Snapshot pre (21:53:19) vendite | €5.736,32 |
| Snapshot pre RAI | −€2.684,71 |
| **Post** vendite caratteristiche | **€2.919,99** |
| **Post** RAI | **−€5.692,51** |
| Post ricavi lordi | €7.792,45 |
| Post altri / contributi | €30,09 / €4.597,66 |

**Vendite .com post-Lotto 3 = €2.919,99. Totale complessivo vendite in verifica** (non dichiarato finale).

### Scostamento vs dry-run (€2.728,52)

Il dry-run sottraeva l’intero €3.007,80 (64 payout in gerarchia) da `venditeCaratteristiche`.  
Di quel blocco, **€191,47** era già escluso dal motore dal filtro pose prepagate → non entrava in `venditeCaratteristiche`.  
Effetto reale: €5.736,32 − (€3.007,80 − €191,47) = **€2.919,99**.

### RAI vs dry-run (+€323)

Il dry-run aveva il segno invertito. Togliere ricavi finti **peggiora** il RAI:  
−€2.684,71 − €3.007,80 = **−€5.692,51** (osservato).

---

## STOP

Nessuna scrittura oltre Lotto 3.

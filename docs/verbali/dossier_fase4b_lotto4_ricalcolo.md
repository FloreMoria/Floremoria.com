# Lotto 4 — Ricalcolo eccesso (STOP su €12.847)

**Generato:** 2026-09-07T11:07:28.285Z

---

## Verdetto

Il **€12.847 è sbagliato**. Confondeva la gamba **pagamento** con il **costo**, e contava le JSON `:v…` come costi distinti.

Con perimetro corretto (solo costo, collasso versioni, no G5/scarti):

| Metrica | Valore |
|---------|--------|
| **Eccesso Lotto 4** | **6605,09 €** |
| Documenti | 56 (quasi tutti 1 JSON + 1 MANUAL) |
| Costi residui su €12.984,96 | **6379,87 €** |
| Plausibilità | **PASS** |
| Storico 99 coppie | 7481,92 € (Δ -876,83 €) |

Lettura socio: sì — le 99 coppie erano la direzione giusta; serviva il raggruppamento per documento (e collassare le versioni JSON). Numero nell’intorno dei ~€6,2–7,5k, non €12,8k.

---

## 1. Test di plausibilità (regola permanente)

| Scenario | Eccesso | Residui | Esito |
|----------|---------|---------|-------|
| Vecchio €12.847 | 12.847,18 € | 137,78 € | **STOP** |
| Naive solo-costi senza collasso `:v` | 12.899,18 € | 85,78 € | **STOP** |
| **Corretto** (costi + collasso `:v`) | 6605,09 € | 6379,87 € | **PASS** |

JSON versionate collassate: **59**.

---

## 2. Perimetro: per documento, solo COSTO

- Contate: `JSON_ENTRY`, `MANUAL_EXPENSE`
- Escluse: `BANK_LINE`, PayPal/Stripe/payout (pagamento = altra gamba)
- Collasso: `JSON_ENTRY:…:v123` ≡ stessa scrittura della base

### DC STUDIO / IRIN (check)
- **DC STUDIO STP SRL** n.66 2026-03-02: 2 gambe costo (JSON 1+MANUAL 1) → eccesso **3774,30 €** — pagamento escluso
- **IRIN S.R.L.** n.265 2026-02-18: 2 gambe costo (JSON 1+MANUAL 1) → eccesso **681,49 €** — pagamento escluso

### Top documenti Lotto 4
| Fornitore | N. | Data | Gambe | Importo | Eccesso |
|-----------|----|------|-------|---------|---------|
| DC STUDIO STP SRL | 66 | 2026-03-02 | 2 | 3774,30 € | 3774,30 € |
| IRIN S.R.L. | 265 | 2026-02-18 | 2 | 681,49 € | 681,49 € |
| Battistella Fioreria srl | 96 | 2026-03-31 | 2 | 145,00 € | 145,00 € |
| Battistella Fioreria srl | 235 | 2026-07-31 | 2 | 140,00 € | 140,00 € |
| Battistella Fioreria srl | 253 | 2026-08-31 | 2 | 138,00 € | 138,00 € |
| MASPES PIANTE E FIORI DI MASPES & C. SNC | 00426000153 | 2026-07-26 | 2 | 133,00 € | 133,00 € |
| FLORIS DI BORDOLI LORIS | 4 | 2026-03-12 | 2 | 85,00 € | 85,00 € |
| ARUBA SPA | 1000263003864237 | 2026-04-27 | 2 | 73,19 € | 73,19 € |
| Fioreria Rossella | — | 2026-08-28 | 5 | 17,00 € | 68,00 € |
| TORRE DOMENICA | 1 | 2026-06-19 | 2 | 62,00 € | 62,00 € |
| ARUBA SPA | 1000261000170337 | 2026-04-30 | 2 | 61,00 € | 61,00 € |
| SHOPPINGARDEN DI ANNA BRUNO | 1/2026 | 2026-01-26 | 2 | 60,01 € | 60,01 € |
| BALLARATE PIERO SRL | 570 | 2026-05-05 | 2 | 57,95 € | 57,95 € |
| Fioreria Rossella | — | 2026-08-26 | 4 | 17,00 € | 51,00 € |
| Battistella Fioreria srl | 210 | 2026-06-30 | 2 | 50,00 € | 50,00 € |
| Battistella Fioreria srl | 53 | 2026-02-28 | 2 | 45,00 € | 45,00 € |
| BONFANTE CLAUDIA | 16 | 2026-06-23 | 2 | 40,00 € | 40,00 € |
| Battistella Fioreria srl | 183 | 2026-05-30 | 2 | 40,00 € | 40,00 € |
| DI PAOLA MARIA ANTONIETTA | 16 | 2026-05-26 | 2 | 40,00 € | 40,00 € |
| DI PAOLA MARIA ANTONIETTA | 5 | 2026-02-17 | 2 | 40,00 € | 40,00 € |

---

## 3. Coppie false — fuori Lotto 4, in lista

Vedi `dossier_fase4b_coppie_false_scartate.md`.

- **a)** Accoppiamenti errati documenti diversi: **0**
- **b)** JSON senza passivo solido → Fase 5: **0** (+ 5 JSON orfani)

---

## 4. Autofatture — vizi formali (priorità commercialista)

Vedi `dossier_fase4b_autofatture_vizi_formali.md`.

- **Senza numero `-EST`:** **21**
- **Riuso 000001-2026-EST:** 2026-01-31 2,01 € · 2026-05-31 3,83 €
- Stripe maggio: -3,14 € num=NESSUNO · 3,83 € num=000001-2026-EST

---

## 5. Isabella — erano 11 consegne?

**Sì.** `FT-MC-26-001` (annullato) aveva `OrderItem.quantity = 11` × €29,99 = €299,90.  
Stripe 03/05: charge €284,90.

Oggi: **3 fatte** + **1 programmata** (FT-MC-26-006→2026-09-12).  
Dopo il 12/09 restano **7** consegne non aperte in anagrafica (11−3−1).

---

## 6. Dry-run Lotto 4 — STOP per via

- Eccesso dichiarato: **6605,09 €**
- Plausibilità: **PASS**
- Impatto CE con gerarchia attuale: docs con 2+ gambe costo ancora visibili = **0** (excess PnL-visibile **0,00 €**)
- **Nota critica:** stornare JSON/MANUAL pulisce il mastro; il totale costi ufficiale (~€12.985) **non** scende di €6,2k perché la gerarchia tiene già il pagamento (BANK/PayPal) come autorità. Eventuale riclassifica pagamento↔documento è decisione separata.
- **Esecuzione: NO**

---

## Punti eseguiti / saltati

1. Test plausibilità — **eseguito** (€12.847 → STOP; corretto → PASS)
2. Ricalcolo per documento solo costi (+ collasso `:v`) — **eseguito** → 6605,09 €
3. Coppie false a/b in file — **eseguito**
4. Autofatture senza -EST + riuso 000001 — **eseguito**
5. Isabella qty pacchetto — **eseguito** (**11**)
6. Dry-run Lotto 4 — **eseguito (sola lettura)**; **esecuzione saltata** (via)

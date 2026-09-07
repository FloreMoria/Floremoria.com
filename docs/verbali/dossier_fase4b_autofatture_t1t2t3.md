# Autofatture 2026 vs Report T1–T3 YouDOX

**Data:** 2026-09-07  
**Fonte:** report caricati `Report_Fatture_ricevute_2026-T1/T2/T3.xlsx` + `ManualFinanceExpense` autofatture  
**Vincolo:** sola lettura / inventario — nessuna trasmissione SDI eseguita da qui

---

## Premessa (allineata al titolare)

| Trimestre | Situazione attesa |
|-----------|-------------------|
| **T1–T2** | Parte delle autofatture già trasmesse dal commercialista allo SDI → compaiono nel report YouDOX |
| **T1–T2** | Altre autofatture solo nel DB Contabilità (PDF / generate) → **ancora da trasmettere** |
| **T3** | **Tutte** ancora da inviare allo SDI |

Criterio operativo usato qui:

- **GIÀ IN SDI** = riga autofattura presente nel report trimestrale YouDOX (o XML SDI con numero `-EST`)
- **DA TRASMETTERE** = in Contabilità, non nel report del trimestre (tipicamente allegato PDF fornitore / TD17 locale senza passaggio SDI)

---

## Report caricati

| File | Righe expense collegate | Autofatture nel report | Upload history |
|------|-------------------------|--------------------------|----------------|
| `…_2026-T1.xlsx` | 20 | **7** | sì (`upl_mtr4gmwh_9and87`, 23 in file / 20 upd) |
| `…_2026-T2.xlsx` | 26 | **1** | sì |
| `…_2026-T3.xlsx` | 12 | **0** | sì |

---

## Riepilogo autofatture DB per trimestre

| T | Totale in DB | Già in SDI (report) | Da trasmettere | Importo da trasmettere |
|---|--------------|---------------------|----------------|------------------------|
| T1 | 8 | **7** (€97,99) | **1** | €25,42 |
| T2 | 8 | **1** (€6,87) | **7** | €79,28 |
| T3 | 14 | **0** | **14** | €150,02 |
| **Σ** | **30** | **8** | **22** | **€254,72** |

---

## T1 — già in SDI (commercialista / report)

| Data | Fornitore | N. autofattura | Importo |
|------|-----------|----------------|---------|
| 31/01 | Stripe | 000001-2026-EST | €2,01 |
| 31/01 | OpenAI | 000002-2026-EST | €23,00 |
| 31/01 | Stripe | 000003-2026-EST | €2,70 |
| 28/02 | OpenAI | 000004-2026-EST | €23,00 |
| 28/02 | OpenAI | 000005-2026-EST | €31,01 |
| 28/02 | Stripe | 000006-2026-EST | €4,39 |
| 31/03 | Stripe | 000007-2026-EST | €11,88 |

### T1 — da trasmettere

| Data | Fornitore | N. | Importo | Allegato |
|------|-----------|----|---------|----------|
| 18/02 | Google Ireland Ltd | — | €25,42 | `Invoice-N2UJNHG9-0001.pdf` |

---

## T2 — già in SDI (report)

| Data | Fornitore | N. autofattura | Importo |
|------|-----------|----------------|---------|
| 30/04 | Stripe | 000008-2026-EST | €6,87 |

### T2 — da trasmettere

| Data | Fornitore | N. | Importo | Nota |
|------|-----------|----|---------|------|
| 02/05 | Cursor | — | €17,75 | PDF |
| 06/05 | Anthropic | — | €18,00 | PDF |
| 31/05 | Stripe | — | €3,14 | PDF tax invoice |
| 31/05 | Stripe | **000001-2026-EST** | €3,83 | XML generato in Contabilità — **numero già usato in T1** ⚠️ |
| 02/06 | Cursor | — | €17,75 | PDF |
| 06/06 | Anthropic | — | €18,00 | PDF |
| 16/06 | Apple | — | €0,81 | PDF |

⚠️ La riga 31/05 con `000001-2026-EST` non va “trasmessa così”: è il **riuso di numero** già segnalato. Va rinumerata prima di qualsiasi invio SDI.

---

## T3 — tutte da trasmettere allo SDI

| Data | Fornitore | Importo | Allegato (hint) |
|------|-----------|---------|-----------------|
| 02/07 | Cursor | €17,75 | PDF |
| 06/07 | Anthropic | €18,00 | PDF |
| 16/07 | Apple | €0,81 | PDF |
| 31/07 | Stripe | €5,70 | PDF |
| 02/08 | Cursor | €17,75 | PDF |
| 06/08 | Anthropic | €18,00 | PDF |
| 16/08 | Apple | €0,81 | PDF |
| 31/08 | Stripe | €6,62 | PDF (4PZWHSUS) |
| 31/08 | Stripe | €8,17 | PDF (KWWCYWEP) |
| 01/09 | Meta Platforms | €1,24 | PDF |
| 02/09 | Cursor | €17,75 | PDF |
| 03/09 | Vercel | €17,27 | PDF |
| 06/09 | Anthropic | €18,00 | PDF |
| 06/09 | Vercel | €2,15 | PDF |

**Totale T3 da trasmettere: €150,02 · 14 documenti · 0 già nel report T3.**

---

## Cosa fare (operativo, non Lotto 4)

1. **Pacchetto commercialista — già OK SDI:** le 8 con numero `-EST` nei report T1/T2 (000001…000008, con caveat sul secondo 000001 di maggio).
2. **Da numerare e trasmettere:** 22 autofatture (1 T1 + 7 T2 + 14 T3), partendo dal progressivo **000009-2026-EST** (dopo aver risolto il conflitto sul secondo 000001).
3. **T3 report YouDOX:** oggi non contiene autofatture; quando il commercialista le invierà, ricompariranno al prossimo export trimestrale.

---

## STOP

Nessuna mutazione. Nessun Lotto 4. Questo elenco è il ponte Contabilità ↔ commercialista sulle autofatture.

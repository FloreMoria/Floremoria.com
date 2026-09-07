# Fase 4b — Lotto 4 ESEGUITO (acceptance CE invariante)

**batch_id:** `FASE4B_L4_20260907_123006`  
**Eseguito:** 2026-09-07T12:30:06.465Z  
**Acceptance:** totali CE **invariati** (pulizia mastro, non PnL)

---

## Sei valori (pre → post)

| Metrica | PRE | POST | Atteso |
|---------|-----|------|--------|
| Totale costi | 13.210,96 € | 13.210,96 € | INVARIATO ✓ |
| Risultato ante imposte | -5418,51 € | -5418,51 € | INVARIATO ✓ |
| Saldo banca | 32.006,13 € | 32.006,13 € | INVARIATO ✓ |
| IVA debito | 134,97 € | 134,97 € | INVARIATO ✓ |
| IVA credito | 276,84 € | 276,84 € | INVARIATO ✓ |
| Scritture attive | 822 | 705 | discesa di 117 (Δ -117) |

**Esito acceptance:** **PASS**  


Nota RAI: storico post-L3 −€5.692,51; live pre-L4 = **-5418,51 €** (Δ 274,00 €). Acceptance applicata sull’invarianza PRE→POST di questo giro.

---

## Cosa è stato stornato

| | |
|--|--|
| Righe soft-reverse | **117** |
| di cui collasso `:v…` (coda) | 84 |
| Documenti Lotto 4 toccati | 32 |
| Skip (ancora visibili in PnL) | 0 |
| `:v…` ancora attive dopo | **0** |

---

## Distinzione «10 coppie false» (liste storiche del report)

Le **10 righe** del sample (€372,01) contavano **ogni coppia due volte** (A↔B e B↔A).

| Tipo | N uniche | Importo | Destino |
|------|----------|---------|---------|
| **Inversioni di nome** (stesso fiorista) | **6** | **€225,01** | duplicati veri → restano nel lotto |
| **Fornitori diversi** (es. Ferrante↔Shoppingarden) | **0** | **€0** | fuori dal lotto — *non presenti nel sample* |

Le 6: Solano €38,01 · Torre €62 · Di Paola n.16 €40 · Calamunci €25 · Cannone €20 · Di Paola n.5 €40.

Ferrante↔Shoppingarden: **assente** dal rebuild (array vuoto già nel dossier analisi).

---

## Pacchetto commercialista — riga aggiuntiva

**31/05 Stripe — due importi sullo stesso documento (confermato file):**
- **€3,14** · PDF `Stripe Tax Invoice 4PZWHSUS-2026-05.pdf`
- **€3,83** · XML `Autofattura_TD17_000001-2026-EST_…xml` (numero riusato `000001-2026-EST`)

Stesso rif. fattura Stripe `4PZWHSUS-2026-05`, due valori.  
Altri giorni con più importi stesso vendor: OpenAI 28/02 (€31,01 + €23,00 = due EST diverse OK) · Stripe 31/01 (due EST OK) · Stripe 31/08 (due PDF distinti KWWCYWEP / 4PZWHSUS — documenti diversi). **L’unica anomalia XML≠PDF sullo stesso rif. resta il 31/05.**

---

## Lotto 5 — dry-run

Vedi `dossier_fase4b_lotto5_dryrun.md`.

| Scenario | Euro |
|----------|------|
| Tetto socio (SDD grezzi) | €1.615,95 |
| SDD unici giorno+importo | €1.506,98 |
| Ancora costo visibile in PnL | €150,00 |
| Riclassifica piena non-transito → funding | €1.506,98 |

**Non eseguito** — attesa via.

---

## Punti

1. Snapshot + batch_id + esecuzione Lotto 4 CE-safe — **eseguito** (PASS)
2. Collasso `:v…` — **eseguito** (residue attive: **0**; coda 84)
3. Distinzione 10 coppie — **eseguito** (6 inversioni / 0 fornitori diversi)
4. Riga commercialista XML≠PDF 31/05 — **eseguito**
5. Dry-run Lotto 5 — **eseguito** (sola lettura)

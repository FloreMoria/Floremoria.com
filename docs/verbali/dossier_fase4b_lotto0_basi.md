# Fase 4b — Lotto 0: riconciliazione basi (sola lettura) — CONGELATO

**Data:** 2026-09-06  
**Stato:** BASE UFFICIALE CONFERMATA dall’utente.  
**Freeze audit:** `2026-09-06T20:42:05.579Z` (Europe/Rome ≈ 22:42)

---

## 1. Backup Neon — test di integrità (PASS)

| Campo | Valore |
|-------|--------|
| Project | `proud-water-51827880` (`neon-emerald-car`) |
| Branch backup | **`backup-pre-fase4b-20260906`** |
| Branch id | `br-holy-pine-alkquqzg` |
| Parent | `main` (`br-soft-resonance-aldq76cc`) |
| Endpoint | `ep-cold-darkness-alfdeikz` |
| Creato | 2026-09-06T20:31:40Z |

### Verifica `SELECT count(*)` su backup

Connessione diretta al branch di backup (non `main` produzione).

| Metrica | Valore | Atteso | Esito |
|---------|--------|--------|-------|
| `financial_ledger_entries` totale | **1166** | 1166 | **PASS** |
| di cui `reversed_at IS NULL` | 874 | — | OK |
| di cui `reversed_at IS NOT NULL` | 292 | — | OK |

**Esito formale restore/backup:** il branch `backup-pre-fase4b-20260906` è raggiungibile, contiene lo snapshot completo del registro (1166 righe) ed è idoneo come punto di ripristino pre-Fase 4b.

Rollback: ripristinare workload su `main` oppure ripartire dai dati del branch backup.

---

## 2. Etichettatura rigorosa delle grandezze

**Vietato** usare il termine generico «risultato» nei report Fase 4b.

| Dicitura obbligatoria | Valore base | Note |
|----------------------|-------------|------|
| **Risultato ante imposte 2026** | **−€2.184,71** | Include €356,74 di oneri bancari/finanziari |
| **EBITDA 2026** | **−€1.827,97** | Esclude gli oneri bancari |

Tutte le verifiche dei Lotti si basano sul **Risultato ante imposte 2026**, salvo dove EBITDA è citato esplicitamente.

---

## 3. Perimetro temporale 2026

| Estremo | Valore |
|---------|--------|
| Data inizio esercizio / PnL 2026 | **`2026-01-01T00:00:00.000Z`** |
| Data fine inclusa (anno fiscale) | **`2026-12-31T23:59:59.999Z`** (filtro motore: `fiscalYear = 2026`) |
| **Data di taglio / congelamento audit** | **`2026-09-06T20:42:05.579Z`** |

Le entry con `fiscalYear = 2025` (es. saldo apertura €32.410,30) restano fuori dal PnL 2026.

---

## 4. Invarianti fondamentali (collaudo lotti)

| Invariante | Valore dichiarato | Uso |
|------------|-------------------|-----|
| **Saldo Banca calcolato** | **€32.403,61** | Controllo Lotto 3 (deve restare invariato dopo storno/riclassifica payout) — **con avvertenza sotto** |
| **Saldo Transito Stripe** | **€446,13** | Controllo Lotto 5 / baseline transito |
| **Saldo Transito PayPal** | **−€1.568,30** | Controllo Lotto 5 (sola lettura; non toccare) |

### AVVERTENZA — invariante banca poggia sulla riga fantasma

Tre numeri da tenere insieme:

| Voce | Importo |
|------|---------|
| Riga fantasma (paste Fineco FY2025, `cmte1n28n00hyl804mcsu51rv`) | **€32.410,30** |
| Saldo banca **calcolato** usato come invariante | **€32.403,61** |
| Differenza calcolato − fantasma | **€6,69** |
| Apertura **reale** da PDF Q1 | **€32.120,48** |

Il saldo calcolato è sostanzialmente la riga fantasma più spiccioli. **Quando il Lotto 1 sistemerà quella riga, l’invariante banca CAMBIERÀ per costruzione**: non è un errore del lotto, è la correzione dell’ancoraggio.

**Conseguenza KPI:** la differenza «saldo calcolato vs estratto conto» **oggi non è un indicatore utilizzabile**, perché il calcolato è ancorato a un’apertura finta invece che a movimenti veri + saldo di apertura vero. Va ripristinato solo dopo Lotto 1 (o equivalente correzione parser/saldo).

### Snapshot misurato al freeze (trasparenza)

Misurazioni aggiuntive al momento del freeze (non sostituiscono gli invarianti dichiarati sopra):

| Misura | Valore al freeze |
|--------|------------------|
| Transito Stripe (ledger) | €446,13 — **allineato** all’invariante |
| Transito PayPal (ledger) | −€1.568,30 — **allineato** all’invariante |
| `cashBankBalanceCents` PnL 2026 | €32.006,13 |
| Σ `bank_statement_lines` (tutti) | €32.295,95 |
| Quadratura `calculatedBalanceCents` | €31.966,13 |
| Saldo reale manuale Fineco | €31.946,13 |

Nota: l’invariante banca €32.403,61 è quello della base Fase 2/acceptance usato come riferimento di controllo Lotto 3; i delta di snapshot al freeze vanno confrontati *prima/dopo* ogni lotto sullo stesso metodo di calcolo.

### Deriva post-freeze: bonifico Fineco → PayPal €500 (non Lotto 2)

| Campo | Valore |
|-------|--------|
| Ledger id | `cmtqa8h140000l604sm2q7mzd` |
| Bank line | `cmtq83vdw0001ld04ixwfktv0` |
| Data contabile | 2026-09-05 |
| Creato in ledger | **2026-09-06T20:46:49.912Z** (≈ 4 min **dopo** il freeze) |
| Importo | **−€500,00** |
| Categoria attuale | `SPESE_OPERATIVE` / matchType `CASH_EXPENSE` (**errata**) |
| Natura dichiarata (socio) | **Giroconto Fineco → PayPal**: finanziamento del wallet così che le uscite non restino come righe sul rendiconto PayPal |

Effetto sul CE: RAI freeze −€2.184,71 → RAI corrente −€2.684,71 (−€500). **Non è effetto Lotto 2.** Candidato a riclassifica `TRASFERIMENTO_INTERNO` (Fineco Dare/Avere vs c/o PayPal) in lotto dedicato — **non eseguito qui**.

---

## Convenzione `batch_id`

```text
fase4bBatchId: FASE4B_L{N}_{YYYYMMDD}_{HHMMSS}
fase4bLotto: N
fase4bAction: RECLASS | REVERSE | PAIR_REVERSE
```

| Lotto | batch_id |
|-------|----------|
| 1 Patrimoniali | `FASE4B_L1_<ts>` — assegnato all’esecuzione (non al dry-run) |
| 2 CCIAA | `FASE4B_L2_<ts>` |
| 3 Payout | `FASE4B_L3_<ts>` |
| 4 Costi duplicati | `FASE4B_L4_<ts>` |
| 5 PayPal | n/a (no write) |

---

## Spiegazione delta ~€357 (Fase 3 vs Fase 4a)

| Metrica | Fase 3 / invarianti | Fase 4a dossier | Delta |
|---------|---------------------|-----------------|-------|
| Ricavi | €10.800,25 | €10.800,25 | €0 |
| Costi | **€12.984,96** | **€12.628,22** | **€356,74** |
| Risultato ante imposte / EBITDA | **−€2.184,71** | **−€1.827,97** (EBITDA) | **€356,74** |

Causa: perimetro costi (inclusione/esclusione **oneri bancari €356,74**). Non quarantena, non anno, non reversed.

---

## BASE UFFICIALE DICHIARATA (unica)

Fonte: `computeHistoricalPnl({ fiscalYear: 2026 })` su Neon `main`, freeze sopra.

| Voce | Euro |
|------|------|
| Ricavi lordi 2026 | **€10.800,25** |
| Costi totali (prod+SaaS+op+oneri) | **€12.984,96** |
| **EBITDA 2026** | **−€1.827,97** |
| **Risultato ante imposte 2026** | **−€2.184,71** |
| IVA debito / credito | €134,97 / €302,98 |
| Entry attive / reversed | 874 / 292 |

---

## Gate / stato lotti

- Ordine: **2 → 3 → 4 → 1 → 5**.
- **Lotto 2 ESEGUITO:** `FASE4B_L2_20260906_205447` — vedi `dossier_fase4b_lotto2_eseguito.md`.
- Propedeutico Lotto 3 (sola lettura): `dossier_fase4b_lotto3_propedeutico.md`.
- Lotto 1 rilavorato (sola lettura): `dossier_fase4b_lotto1_rilavorato.md` — destinazione Wix aggiornata a **17900**.
- **Nessuna mutazione Lotto 3** finché non arriva via libera esplicito al dry-run/esecuzione.

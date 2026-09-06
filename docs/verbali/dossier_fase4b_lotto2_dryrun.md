# Fase 4b — Lotto 2 DRY-RUN (Contributo CCIAA)

**Data report:** 2026-09-06  
**Modalità:** DRY-RUN — **zero scritture** su Neon `main`.  
**batch_id esecuzione:** `FASE4B_L2_20260906_205447` — **ESEGUITO** (vedi `dossier_fase4b_lotto2_eseguito.md`).  
**Ordine lotti:** 2 → 3 → 4 → 1 → 5.

---

## Voce unica

| Campo | Valore |
|-------|--------|
| **ID record (cuid)** | `cmt3zx44k00e9ky04exlfxeyg` |
| **sourceKey** | `BANK_LINE:cmt311c5f000hl4045ueo4j8a` |
| **bankLineId** | `cmt311c5f000hl4045ueo4j8a` |
| **Data contabile** | **2026-02-05** |
| **Importo** | **€4.597,66** (459.766 cent) |
| **vatCents** | 0 |
| **Descrizione** | Ord: Cciaa Como-Lecco · Liquidazione Contributo **Bando Nuova Impresa 2025** |
| **Categoria / conto attuale** | `ALTRI_RICAVI` · metadata Avere `60100 - Ricavi da Vendite` / Dare `10100 - Banca Fineco` |
| **Azione** | **Riclassifica, NON storno** |
| **Categoria / conto destinazione** | `CONTRIBUTI_ESERCIZIO` · Avere proposto `65000 - Contributi in conto esercizio` (etichetta piano conti; Dare Fineco invariato) |

Natura: contributo pubblico in conto esercizio — ricavo **legittimo** ma **non vendita**.

---

## Effetto atteso (misurabile)

### Precisazione importante sullo stato AS-IS

Oggi la CCIAA **non** è in `RICAVI_VENDITE`: è già in `ALTRI_RICAVI`.  
Quindi le **vendite caratteristiche** (solo `RICAVI_VENDITE` in PnL) **non scendono di €4.597,66** con questo lotto: quel numero **esce da ALTRI_RICAVI** ed entra in `CONTRIBUTI_ESERCIZIO`.

| Metrica | Prima (freeze) | Dopo Lotto 2 (atteso) | Delta |
|---------|----------------|------------------------|-------|
| **Vendite caratteristiche** (`RICAVI_VENDITE`) | **€5.932,14** | **€5.932,14** | **€0,00** |
| **Altri ricavi** (`ALTRI_RICAVI`) | €4.627,75 | €30,09 (solo Wix residuo) | **−€4.597,66** |
| **Contributi in conto esercizio** | €0,00 | **€4.597,66** | **+€4.597,66** |
| **Ricavi lordi totali (motore, se contributi restano nel CE)** | €10.800,25 | €10.800,25 | **€0,00** |
| **Risultato ante imposte 2026** | **−€2.184,71** | **−€2.184,71** | **€0,00 (INVARIATO)** |
| **Saldo Banca calcolato (invariante)** | €32.403,61 | €32.403,61 | **€0,00 (INVARIATO)** |
| **IVA debito / credito** | €134,97 / €302,98 | invariati | **€0,00** (`vatCents=0` sulla riga) |

### Cosa ottiene lo studio dopo l’esecuzione

Per la prima volta un numero esplicito e separato:

- **Vendite caratteristiche del periodo:** €5.932,14  
- **Contributi in conto esercizio:** €4.597,66  
- (RIMBORSI ancora dentro i ricavi: €44,88 — difetto strutturale, fuori scope Lotto 2)

---

## Piano di esecuzione (solo dopo via libera)

1. Assegnare `fase4bBatchId = FASE4B_L2_<timestamp>`.
2. Aggiornare la riga `cmt3zx44k00e9ky04exlfxeyg`:
   - `category` → `CONTRIBUTI_ESERCIZIO` (estensione enum/whitelist categorie se necessario)
   - `metadataJson.avereAccount` → `65000 - Contributi in conto esercizio`
   - `metadataJson.fase4bBatchId` / `fase4bLotto=2` / `fase4bAction=RECLASS`
3. Allineare `computeHistoricalPnl` / report:
   - `venditeCaratteristicheCents` = solo `RICAVI_VENDITE`
   - `contributiEsercizioCents` = `CONTRIBUTI_ESERCIZIO`
   - **Risultato ante imposte** continua a includere i contributi (stesso segno dei ricavi non caratteristici) → RAI invariato
4. Verifica post:
   - vendite caratteristiche = €5.932,14
   - contributi = €4.597,66
   - RAI = −€2.184,71
   - banca invariata; IVA invariata
5. Commit: `fix(finance): fase 4b lotto 2 — contributo CCIAA fuori vendite caratteristiche`

**Rollback:** ripristinare `category=ALTRI_RICAVI` + metadata precedente per lo stesso `fase4bBatchId`; cold backup `backup-pre-fase4b-20260906`.

---

## STOP

Dry-run Lotto 2 pronto. **Nessuna mutazione eseguita.**  
Attendo via libera esplicito all’esecuzione (con report di `batch_id` + vendite caratteristiche post-write).

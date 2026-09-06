# Fase 4b — Lotto 1 DRY-RUN (nessuna mutazione)

**Data report:** 2026-09-06  
**Modalità:** DRY-RUN esclusivo — **zero scritture** su Neon `main` / produzione.  
**Batch id esecuzione:** *non assegnato* (sarà `FASE4B_L1_<timestamp>` solo all’esecuzione).  
**Base di riferimento:** `docs/verbali/dossier_fase4b_lotto0_basi.md` (confermata).

---

## Obiettivo simulato

Riclassificare 3 voci anomale/patrimoniali **senza impatto** su:

- Ricavi 2026 → **INVARIATI (€0,00)**
- **Risultato ante imposte 2026** → **INVARIATO (€0,00)**

---

## Scheda 1 — Saldo / apertura patrimoniale 2025

| Campo | Valore |
|-------|--------|
| **ID record (cuid)** | `cmte1n28n00hyl804mcsu51rv` |
| **sourceKey** | `BANK_LINE:cmt7oev7x0021l204idxk4ize` |
| **bankLineId** | `cmt7oev7x0021l204idxk4ize` |
| **Data contabile** | 2025-12-02 |
| **Importo** | **€32.410,30** (3.241.030 cent) |
| **fiscalYear / quarter** | 2025 / T4 |
| **Categoria attuale** | `ALTRI_RICAVI` |
| **Conti attuali (metadata)** | Dare `10100 - Banca Fineco` / Avere `60100 - Ricavi da Vendite` |
| **Descrizione** | Movimento Fineco (incolla) |
| **Categoria destinazione (proposta)** | Fuori ricavi: trattare come **patrimonio / saldo di apertura** |
| **Conto destinazione (proposta)** | Avere `28000 - Patrimonio netto / Versamenti e apporti soci` (o equivalente piano conti); Dare resta Fineco *oppure* storno CE + scrittura patrimoniale di pari importo |
| **Azione dry-run** | Soft-reverse della riga CE + insert rettifica patrimoniale con stesso `bankLineId`, `fase4bAction=RECLASS`, `fase4bLotto=1` |

### Effetto atteso

| Metrica | Effetto |
|---------|---------|
| Ricavi 2025 | **−€32.410,30** |
| Ricavi 2026 | **€0,00 (invariati)** |
| Risultato ante imposte 2026 | **€0,00 (invariato)** |
| Saldo Banca calcolato | **invariato** (permutazione Dare/Avere senza movimento cassa nuovo) |

---

## Scheda 2 — Wix / Adyen (€30,09)

| Campo | Valore |
|-------|--------|
| **ID record (cuid)** | `cmt3zx44i00d7ky04q8r3i71w` |
| **sourceKey** | `BANK_LINE:cmt1vc6uj0007ky04spv5jwp7` |
| **bankLineId** | `cmt1vc6uj0007ky04spv5jwp7` |
| **Data contabile** | 2026-04-07 |
| **Importo** | **€30,09** (3.009 cent) |
| **fiscalYear / quarter** | 2026 / T2 |
| **Categoria attuale** | `ALTRI_RICAVI` |
| **Conti attuali (metadata)** | Dare `10100 - Banca Fineco` / Avere `60100 - Ricavi da Vendite` |
| **Descrizione** | Ord: Wix.com Luxembourg … Banca Ord: **Adyen B.v.** · Wix Payments |
| **Destinazione proposta (Lotto 1, PnL-neutra)** | Mantenere categoria economica `ALTRI_RICAVI` (così PnL 2026 non si muove) + etichettatura metadata: `gatewayChannel=ADYEN_WIX`, `avereAccountHint=10350 - Banca c/o Adyen/Wix` |
| **Destinazione alternativa (NON in Lotto 1)** | `TRASFERIMENTO_INTERNO` / Dare Fineco · Avere `10350 - Banca c/o Adyen/Wix` → **ridurrebbe Ricavi 2026 di €30,09** (viola vincolo invariati) — da decidere in lotto dedicato post-istituzione conto |

### Effetto atteso (piano PnL-neutro Lotto 1)

| Metrica | Effetto |
|---------|---------|
| Ricavi 2025 | €0,00 |
| Ricavi 2026 | **€0,00 (invariati)** |
| Risultato ante imposte 2026 | **€0,00 (invariato)** |

---

## Scheda 3 — Micro-PayPal (€0,11)

| Campo | Valore |
|-------|--------|
| **ID record (cuid)** | `cmtkdpd0l0002jp04a5gejgik` |
| **sourceKey** | `BANK_LINE_MANUAL:cmthd3vo90002jp04kpoicmqh` |
| **bankLineId** | `cmthd3vo90002jp04kpoicmqh` |
| **Data contabile** | 2026-08-31 |
| **Importo** | **€0,11** (11 cent) |
| **fiscalYear / quarter** | 2026 / T3 |
| **Categoria attuale** | `RIMBORSI` |
| **Conti attuali (metadata)** | Dare `10100 - Banca Fineco` / Avere `60100 - Ricavi da Vendite` |
| **Descrizione** | PayPal Europe … cashback/bonifico SEPA residuo |
| **Decisione dry-run** | **LASCIARE** in `RIMBORSI` con flag metadata `fase4bNote=MICRO_RESIDUE_TECHNICAL` (nessuno storno) |
| **Alternativa** | Soft-reverse + riclassifica a oneri/arrotondamento — **non proposta** per non toccare PnL |

### Effetto atteso

| Metrica | Effetto |
|---------|---------|
| Ricavi 2025 | €0,00 |
| Ricavi 2026 | **€0,00 (invariati)** — lasciare |
| Risultato ante imposte 2026 | **€0,00 (invariato)** |

---

## Riepilogo impatto PnL (dry-run aggregato)

| Voce | Ricavi 2025 | Ricavi 2026 | Risultato ante imposte 2026 |
|------|-------------|-------------|------------------------------|
| €32.410,30 patrimoniale | −€32.410,30 | €0 | €0 |
| €30,09 Wix (etichetta only) | €0 | €0 | €0 |
| €0,11 micro (lascia) | €0 | €0 | €0 |
| **Totale Lotto 1** | **−€32.410,30** | **€0,00** | **€0,00** |

Verifica post-esecuzione (quando autorizzata): PnL 2026 ricavi = €10.800,25; Risultato ante imposte 2026 = −€2.184,71.

---

## SEGNALAZIONE CANALE — Adyen / Wix

**Stato:** canale di incasso **non modellato** nel piano conti di transito attuale (solo Stripe `10300` e PayPal `10200`).

| Evidenza | Dettaglio |
|----------|-----------|
| Controparte bancaria | Wix.com Luxembourg / **Adyen B.V.** |
| Importo campione | €30,09 (2026-04-07) |
| Classificazione odierna | `ALTRI_RICAVI` (errata rispetto a natura gateway) |
| Proposta | Istituire **`10350 - Banca c/o Adyen`** (o `Banca c/o Wix/Adyen`) tra i conti di transito, analogo a Stripe/PayPal |

**Decisione richiesta (fuori Lotto 1 write):** sì/no all’apertura del conto di transito Adyen. Finché non c’è, Lotto 1 si limita all’etichettatura PnL-neutra.

---

## Piano di esecuzione (solo dopo via libera)

1. Assegnare `fase4bBatchId = FASE4B_L1_<UTC>`.
2. Voce 1: soft-reverse `cmte1n28n00hyl804mcsu51rv` + insert rettifica patrimoniale (stesso importo/data/bankLineId).
3. Voce 2: update metadata (no cambio category) — o skip se si preferisce solo documentazione.
4. Voce 3: update metadata flag oppure no-op.
5. Verificare PnL 2026 invariato; ricavi 2025 −€32.410,30.
6. Commit git dedicato: `fix(finance): fase 4b lotto 1 — …`

**Rollback:** soft-reverse di tutte le entry con lo stesso `fase4bBatchId`; il branch Neon `backup-pre-fase4b-20260906` resta il cold backup.

---

## STOP

- Dry-run completato.
- **Nessuna scrittura DB.**
- **Nessun commit git** (come richiesto).
- In attesa del **via libera esplicito** all’esecuzione Lotto 1.

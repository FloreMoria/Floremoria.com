# Verbale — Lotto 5-bis + Fase 5 Passo A (STOP) + doppi fiorista

**Data:** 2026-09-07  
**batch L5-bis:** `FASE4B_L5BIS_20260907_133232` (già eseguito in sessione precedente; verificato a libro)

---

## 1) Lotto 5-bis — riclassifica funding €500

**Stato:** già eseguito e verificato. Nessuna nuova scrittura in questo giro.

| Campo | Valore |
|-------|--------|
| Entry id | `cmtqa8h140000l604sm2q7mzd` |
| Azione | `SPESE_OPERATIVE` → `TRASFERIMENTO_INTERNO` / `entryNature=TRANSITO` |
| Scritture toccate | **1** |
| ΔRAI | **+€500,00** (non €0) |
| Banca | invariata €32.006,13 |
| PayPal transit | −€1.093,01 → **−€593,01** |

---

## 2) Fase 5 — smantellamento dedupe a lettura

### Passo A — `fiscalAuthorityDedupe.ts` → **STOP**

Kill-switch temporaneo `FISCAL_AUTHORITY_DEDUPE_ENABLED=false` (identity). Misura:

| Voce | CON layer (baseline) | SENZA layer (Passo A) | Δ |
|------|----------------------|------------------------|---|
| RAI 2026 | −€3.804,48 | −€9.117,48 | **−€5.313,00** |
| Ricavi 2026 | €7.792,45 | €8.353,66 | **+€561,21** |
| Costi 2026 | €11.596,93 | €17.471,14 | **+€5.874,21** |
| Saldo banca | €32.006,13 | €32.006,13 | 0 |
| Transito Stripe | −€2.995,42 | −€2.995,42 | 0 |
| Transito PayPal | −€593,01 | −€593,01 | 0 |
| Righe post-hierarchy | **407** | 705 raw | layer nasconde 298 |
| Prima Nota (Fineco master su hierarchy) | **121** | 224 (master su raw) | — |

**Criterio fallito:** i totali CE si muovono. Il layer **maschera doppioni ancora nel DB**.  
**Azione:** ripristinato `FISCAL_AUTHORITY_DEDUPE_ENABLED = true`.  
**Passi B / C / D:** **non eseguiti** (fermo al primo fallimento).

Commento lasciato in `lib/financial/fiscalAuthorityDedupe.ts` con i numeri della misura.

---

## 3) Metrica margine/ordine — sospesa

Non implementata. Solo lettura doppi pagamenti fiorista (sotto).

---

## 4) Doppi pagamenti fiorista (sola lettura)

Criterio: esiste `FLORIST_PAYOUT` **e** `BANK_LINE` categorizzata `COSTI_FIORISTI` con stesso importo e overlap nome fiorista/shop (finestra fino a 120g per liquidazioni ritardate).

| | |
|--|--|
| FLORIST_PAYOUT 2026 | 27 |
| BANK_LINE COSTI_FIORISTI | 49 |
| **Casi doppio canale** | **18** |
| **Importo totale duplicato (lato payout)** | **€465,00** |

### Controllo Antonella Cingolani — CONFERMATO

Bonifici €20:
- 2026-05-26
- 2026-07-02 *(anche questo in mastro; il brief citava 26/05 e 30/07)*
- 2026-07-30

FLORIST_PAYOUT €20 del 2026-08-20:
- FT-MC-26-003
- FT-MC-26-004
- FT-MC-26-005

(+ FT-MC-26-006 payout 2026-09-12 €20, senza match bonifico dedicato in questa misura)

### Elenco ordini coinvolti (18)

FF-VI-26-003 · FT-LC-26-001 · FT-PA-26-007 · FF-PN-26-004 · FT-RC-26-003 · FT-RC-26-002 · FF-CO-26-001 · FT-MB-26-001 · FT-ME-26-001 · FT-MC-26-005 · FT-PA-26-005 · FT-MC-26-004 · FT-MC-26-003 · FF-VR-26-001 · FT-RC-26-001 · FT-PA-26-009 · FT-CS-26-007 · FF-SO-26-001

*Nota:* alcuni match hanno lag >30g (liquidazione cumulativa sospetta). Impatto CE oggi ≈ €0 grazie alla gerarchia (Passo A ha mostrato quanto peserebbero se rimossa).

---

## 5) File modificati in questo commit (git add mirato)

- `lib/financial/fiscalAuthorityDedupe.ts` — kill-switch documentato, default `true` (Passo A misurato e respinto)
- `docs/verbali/dossier_fase5_passo_a_stop.md` — verbale numeri
- `scripts/fase5-dedupe-measure.ts` — script misura what-if layer
- `docs/verbali/.today_log.txt` — append giornata

*(Lotto 5-bis execute + freeze già a libro da sessione precedente: `scripts/fase4b-lotto5bis-execute.ts`, `dossier_fase4b_lotto5bis_eseguito.*`, `dossier_fase4b_freeze_post_lotto5bis.*`.)*

---

## 6) Freeze ufficiale post-push (base)

**Label:** `FREEZE_UFFICIALE_POST_LOTTO5BIS` · 2026-09-07

| Metrica | Valore |
|---------|--------|
| RAI 2026 | **−€3.804,48** |
| Ricavi 2026 | **€7.792,45** |
| Costi 2026 | **€11.596,93** |
| Saldo banca (cash PnL) | **€32.006,13** |
| Transito Stripe | **−€2.995,42** |
| Transito PayPal | **−€593,01** |

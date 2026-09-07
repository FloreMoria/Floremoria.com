# Verbale — Fase 5 smontaggio dedupe a lettura (STOP al Passo A)

**Data:** 2026-09-07  
**Base:** freeze post-L6 fioristi (`FREEZE_UFFICIALE_POST_LOTTO6_FIORISTI`)

---

## Snapshot Neon (baseline, gerarchia ON)

| Voce | Valore |
|------|--------|
| RAI 2026 | **−€3.764,48** |
| Ricavi 2026 | **€7.792,45** |
| Costi 2026 | **€11.556,93** |
| Saldo banca | **€32.006,13** |
| Transito Stripe | **−€2.995,42** |
| Transito PayPal | **−€593,01** |
| Righe Prima Nota (list post Fineco master) | **125** |

---

## Tabella dei quattro passi

| Passo | Layer | Esito | RAI | Ricavi | Costi | Banca | Stripe | PayPal | PN |
|-------|-------|-------|-----|--------|-------|-------|--------|--------|-----|
| **A** | `fiscalAuthorityDedupe.ts` (`FISCAL_AUTHORITY_DEDUPE_ENABLED=false`) | **STOP** — totali CE si muovono | −€8.983,48 (Δ **−€5.219,00**) | €8.353,66 (Δ **+€561,21**) | €17.337,14 (Δ **+€5.780,21**) | €32.006,13 (0) | −€2.995,42 (0) | −€593,01 (0) | 224 (Δ +99) |
| **B** | `dedupePrimaNotaVisualEntries` | **non eseguito** | — | — | — | — | — | — | — |
| **C** | `finecoMasterLedger.ts` | **non eseguito** | — | — | — | — | — | — | — |
| **D** | `primaNotaShared.ts` | **non eseguito** | — | — | — | — | — | — | — |

**Azione Passo A:** ripristinato subito `FISCAL_AUTHORITY_DEDUPE_ENABLED = true`. Verifica post-restore = baseline invariata.

---

## Controllo Lotto 6 (€134)

Con gerarchia OFF i costi salgono di **+€5.780,21**, non di ≈€94 né ≈€134.

Confronto con misura pre-L6 (Passo A su freeze post-L5bis): costi allora +€5.874,21.  
Differenza **€94,00** = la quota del doppione fiorista che la gerarchia nascondeva e che lo storno Lotto 6 ha rimosso a fonte.

Conclusione: **lo storno Lotto 6 ha tenuto**. Il Δ residuo (~€5,8k costi / ~€561 ricavi) è doppione strutturale ancora a DB — la gerarchia resta obbligatoria.

---

## Repo cleanup

- `docs/verbali/.today_log.txt` rimosso dal versionamento (`git rm --cached`)
- Aggiunto a `.gitignore` (append giornaliero resta solo locale)

---

## Freeze ufficiale (invariato)

**Label:** `FREEZE_UFFICIALE_POST_FASE5_PASSO_A_STOP`  
(= stesso CE del freeze post-L6; nessuna scrittura contabile in questo giro)

| Metrica | Valore |
|---------|--------|
| RAI 2026 | **−€3.764,48** |
| Ricavi 2026 | **€7.792,45** |
| Costi 2026 | **€11.556,93** |
| Banca | **€32.006,13** |
| Transito Stripe | **−€2.995,42** |
| Transito PayPal | **−€593,01** |
| Dedupe a lettura | **ancora ATTIVA** |

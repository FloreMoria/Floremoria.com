# Verbale — Dossier Fiscale Fase 1 (METODO v1.1) — STOP su C6

**Generato:** 2026-09-08  
**Spec:** `docs/METODO_DOSSIER_FISCALE.md` **v1.1** §5  
**Ambito:** sola verifica — nessun cambiamento a dati o generatore XLSX

---

## STOP — C6 ≠ 6

Con la formulazione **v1.1**, C6 misura:

> numero **coppie** di righe di importo uguale e opposto, stesso identificativo di documento, generate dal sistema (mai rimborsi / note di credito)

| | Valore |
|--|--------|
| **C6 misurato oggi** | **0** coppie |
| Atteso da baseline agosto (e da te) | **6** |
| Negativi di sistema **senza** coppia sullo stesso id documento | **6** (Cursor×2, Anthropic×2, Stripe Tax, Apple) |

Quei 6 erano le «righe tecniche negative» del dossier agosto / v1.0. Sotto v1.1 **non sono coppie di storno**: ogni riga ha il proprio `documentNumber`/`fileName`, non esiste la gamba positiva con lo stesso identificativo e importo opposto. Restano candidati al foglio Eccezioni, non a C6.

**Non proseguo** (né Fase 2) finché non mi dici come trattare questo scostamento:
1. la baseline «6» va riletta come i 6 orfani (fuori da C6), e C6=0 è corretto; oppure
2. va ampliata la definizione operativa di «stesso identificativo» / «generata dal sistema».

---

## Esito degli altri controlli (invariati rispetto a prima)

| ID | Misurato | Atteso | Esito |
|----|----------|--------|-------|
| C1 | **19** | 0 | FAIL |
| C2 | **€ 387,90** | 0 | FAIL |
| C3 | € 0,00 | 0 | OK |
| C4 | € 1.699,90 | 0 | FAIL |
| C5 | € 18,40 | 0 | FAIL |
| C6 | **0** (v1.1) | 0 formula / **6** baseline ago | vedi STOP |
| C7 | **12** | 0 | FAIL |
| C8 | 0 | 0 | OK |
| C9 | 10 | 0 | FAIL |
| C10 | fail ×2 | 0 | FAIL |

C1, C2, C7, C10 restano allineati alla lettura agosto. Solo C6 cambia per effetto della v1.1.

---

## File

- `docs/METODO_DOSSIER_FISCALE.md` (v1.1)
- `lib/financial/dossierFiscalControls.ts` (C6 riscritto)
- `scripts/dossier-fiscal-controls-t2-2026.ts`
- `docs/verbali/dossier_fase1_controlli_t2_2026.json`

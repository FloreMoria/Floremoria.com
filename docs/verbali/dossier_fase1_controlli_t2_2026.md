# Verbale — Dossier Fiscale Fase 1: controlli T2 2026 — CHIUSA

**Generato:** 2026-09-08  
**Spec:** `docs/METODO_DOSSIER_FISCALE.md` §5 — C6 confronta gli **imponibili** (semantica v1.2)  
**Ambito:** sola verifica — nessun cambiamento a dati o generatore XLSX

---

## Fase 1 chiusa

Dopo correzione specifica: C6 non confronta il totale documento, ma l’**imponibile**.  
Le 6 coppie esistono (stesso numero documento; imponibili esattamente opposti; totali diversi perché la riga positiva porta IVA reverse charge e la negativa ha IVA 0). Universo = foglio «Fatture Passive e Autofatture»: `manualFinanceExpense` ↔ `saasForeignInvoice`.

| ID | Misurato | Atteso formula | Baseline agosto | Esito |
|----|----------|----------------|-----------------|-------|
| C1 | **19** | 0 | 19 | FAIL (allineato) |
| C2 | **€ 387,90** | 0 | € 387,90 | FAIL (allineato) |
| C3 | € 0,00 | 0 | — | OK |
| C4 | € 1.699,90 | 0 | — | FAIL |
| C5 | € 18,40 | 0 | — | FAIL |
| C6 | **6** | 0 | **6** | FAIL (allineato) |
| C7 | **12** | 0 | 12 | FAIL (allineato) |
| C8 | 0 | 0 | — | OK |
| C9 | 10 | 0 | — | FAIL |
| C10 | fail ×2 | 0 | fail ×2 | FAIL (allineato) |

**Baseline chiave:** C1=19 · C2=€387,90 · **C6=6** · C7=12 · C10 fallito su entrambi i gateway.

---

## Nota su C6 / acquisto estero

La coppia non è uno storno “classico”: è il modo attuale di registrare un acquisto estero (riga fornitore senza IVA + riga autofattura con IVA RC e segno invertito sull’imponibile). Sommando gli imponibili il costo scompare dal dossier. Forma corretta (METODO §6.4, quando il file v1.2 è in repo): **una sola riga** con imponibile positivo e IVA reverse charge.

---

## File

- `lib/financial/dossierFiscalControls.ts` (C6 su imponibile, universo manual+saas)
- `scripts/dossier-fiscal-controls-t2-2026.ts`
- `docs/verbali/dossier_fase1_controlli_t2_2026.json`
- `docs/METODO_DOSSIER_FISCALE.md` (in attesa commit v1.2 da titolare se non ancora sostituito)

---

**Prossimo passo (solo su OK):** Fase 2 — fogli Eccezioni + Quadratura (§4, §9).

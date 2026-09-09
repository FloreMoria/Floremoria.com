# Verbale — Dossier fiscale v1.9 (punti 2–4)

**Data:** 09-09-2026 · **Ora:** 18:57 Europe/Rome  
**Ambito:** Contabilità / dossier commercialista (METODO)  
**Agent:** DEVIN + PETRA + BARBARA (IVA) · filtro SOFIA/ALMA n/a (no copy utente finale)

## Contesto

Sblocco punto 1 (METODO v1.8): archivio paste resta valido; C3 senza saldi = *non verificabile*; ingresso paste chiuso.  
Procedura: punti **2** (dossier per liquidazione IVA), **3** (badge da ultima esecuzione), **4** (niente capitale hardcoded nel perimetro).

## Cosa è stato fatto

### Punto 2 — Dossier per il commercialista
- `DOSSIER_METHOD_VERSION` → **1.9** (allineata a ciò che l’export applica).
- METODO aggiornato a **v1.9**: ordine fogli Corrispettivi → Acquisti → Banca → Liquidazione IVA → Da chiarire; allegati; **Quadratura + C1–C10 in coda**.
- Registro **Corrispettivi** costruito dagli **incassi gateway** (non dagli ordini); stati aliquota solo `determinata | presunta | mancante`; lordo §8.2.
- Foglio **Liquidazione IVA**: reverse charge su entrambi i lati; in testa riga “quadra / non quadra + scostamento”.
- STOP se share **mancante > 30%** del lordo gateway.

### Punto 3 — Badge controlli
- Snapshot C1–C10 in `SystemState` (`finance.dossier.controls.{year}.T{q}`).
- GET badge **legge** lo snapshot; `?refresh=1` / «Esegui controlli» ricalcola e salva.
- Se movimenti successivi a `ranAt` → “misurazione non aggiornata”.
- C3 `verifiable: false` non conta come fallimento.

### Punto 4 — Capitale / patrimoniali
- Nel perimetro finance: già `shareCapital: null` / “Dato non disponibile” (`companyBankDetails`, `statements`, UI finance).
- **Fuori perimetro (segnalato, non toccato):** `app/layout.tsx` footer ancora con «Capitale sociale sottoscritto: 11.410€ i.v.» — da allineare in commit separato se si amplia il perimetro.

## Controlli C1–C10

### Prima (baseline T2 2026 — `docs/verbali/dossier_fase1_controlli_t2_2026.json`, 2026-09-08)

| ID | Esito | Note |
|---|---|---|
| C1 | FAIL | +19 righe |
| C2 | FAIL | €387,90 |
| C3 | OK | PDF Q2 con saldi |
| C4 | FAIL | gap gateway vs corrispettivi ordine-centrici |
| C5 | FAIL | €18,40 |
| C6–C10 | (vedi JSON) | C10 atteso KO wallet |

### Dopo (semantica codice 09-09-2026)

| ID | Cambiamento semantico |
|---|---|
| C3 | Se nessun estratto con opening+closing dichiarati → **NON VERIFICABILE** (`passed: true`, `verifiable: false`), non FAIL; non blocca export |
| C4 | Misura vs registro gateway-first (ri-misurazione live al prossimo «Esegui controlli» / export) |
| Altri | Formula invariata; badge non ricalcola a page load |

*Misurazione numerica live post-deploy: eseguire «Esegui controlli» su Contabilità per il trimestre attivo; l’export XLSX persiste lo stesso snapshot.*

## File toccati (commit)

- `docs/METODO_DOSSIER_FISCALE.md`
- `lib/financial/dossierCorrispettiviBuild.ts`
- `lib/financial/dossierFiscalControls.ts`
- `lib/financial/dossierControlsStore.ts` (nuovo)
- `lib/financial/taxQuarterly.ts`
- `lib/financial/taxQuarterlyXlsx.ts`
- `app/api/dashboard/finance/dossier-controls/route.ts`
- `components/dashboard/DossierControlsBadge.tsx`
- `docs/verbali/09-09-2026-finance-dossier-v19.md` (questo verbale)

## Verifiche

- `npx tsc --noEmit` — OK  
- `npm run build` — OK  

## Non in scope / non commitati

- Export CSV/ZIP verbali e `scripts/export-*` (lavoro elenco ordini parallelo)
- Footer `app/layout.tsx` capitale 11.410€
- Fase 5 dedupe fiscale (STOP precedente)

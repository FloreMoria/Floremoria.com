# Chiarimenti + Lotto 5 DRY-RUN aggiornato (post freeze)

**Generato:** 2026-09-07T12:45:26.633Z  
**Vincolo:** sola lettura — **nessuna esecuzione Lotto 5**

---

## 1a) Lotto 5 — quanto vale sul RAI?

### Un solo numero: **1114,03 €** di miglioramento RAI atteso

| | |
|--|--|
| RAI freeze (pre) | -5418,51 € |
| Δ RAI se esegui riclassifica SDD→transito (visibili in CE) | **+1114,03 €** |
| RAI post atteso | **-4304,48 €** |

### Perché non €150 e non €1.506,98

| Cifra | Cosa misura | Utile per il RAI? |
|-------|-------------|-------------------|
| €150 | SDD con etichetta **COSTO_*** ancora in gerarchia | Parziale (sottostima) |
| €1.506,98 | Tutti gli SDD **unici** da portare a funding | Perimetro anagrafico (include già fuori CE) |
| **1114,03 €** | SDD unici che **oggi colpiscono il CE** | **Sì — questo è il numero** |

Dettaglio: 1114,03 € escono dai costi (− 0,00 € ricavi finti ENTRATA).  
Molti SDD sono etichettati `RICAVI_VENDITE` ma sono **USCITA** → il motore li mette nei **costi** comunque (~€964).  
~€393 di SDD unici sono già fuori gerarchia → riclassificarli non muove il RAI.

Dup multi-categoria: 8 · 108,97 € (igiene mastro, effetto CE già incluso o nullo).

**Acceptance L5 (se via):** costi↓ / RAI↑ di ~1114,03 €; **banca invariata**.

---

## 1b) `:v…` — 59 vs 84

| | |
|--|--|
| 59 | Ricalcolo: versioni **saltate** perché la base era già nel perimetro costi |
| 84 | Execute: **tutte** le JSON `:v` attive 2026 |
| Con base gemella | 34 |
| Orfane (solo `:v`, senza base) | 50 |
| Create il | **2026-08-21** (burst unico, 84/84) |
| Ancora attive ora | **0** |
| Nuove dopo Fase 2? | **No** (nessuna post-21/08) |
| Cancello | `ledgerWriteGate.assertStableSourceKey` — blocca `:v` |
| Unico codice `:v` nel repo | `fase2-acceptance.ts` **dryRun only** (non scrive) |

---

## 1c) Ferrante ↔ Shoppingarden

Presenti in `costi_99_coppie.csv` **righe 96–97** (G4), €20, 2026-02-23:

- JSON Ferrante n.28 ↔ MANUAL Shoppingarden n.2/2026 (incrocio)
- JSON Shoppingarden n.2/2026 ↔ MANUAL «Fornitore SDI» n.28

**Non** erano nel sample «10 scartate» (solo inversioni di nome). Dire «assente» era impreciso sul CSV; era assente da *quel* sample. **Destino: fuori lotto, non toccare.**

---

## STOP Lotto 5

Dry-run aggiornato. **Nessuna esecuzione** senza via esplicita.

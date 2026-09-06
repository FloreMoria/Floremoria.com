# Fase 4b — Lotto 3 DRY-RUN (payout gateway)

**Snapshot:** `2026-09-06T21:53:19.251Z`  
**Modalità:** DRY-RUN — **zero scritture**  
**batch_id:** assegnato solo all’esecuzione `FASE4B_L3_<UTC>`

---

## Pre-write (congelato)

| Metrica | Valore |
|---------|--------|
| Vendite caratteristiche | 5736,32 € |
| Altri ricavi | 221,56 € |
| Contributi esercizio | 4597,66 € |
| Ricavi lordi | 10.800,25 € |
| Risultato ante imposte | -2684,71 € |
| IVA debito | 134,97 € |
| Entry attive | 875 |

---

## Target

| | |
|--|--|
| Righe | **87** (atteso 87) |
| Totale | **4080,29 €** (atteso €4.080,29) |
| Di cui `RICAVI_VENDITE` in gerarchia PnL | 64 · 3007,80 € |
| Per categoria | {"RICAVI_VENDITE":{"n":66,"euro":"3063,69 €"},"ALTRI_RICAVI":{"n":21,"euro":"1016,60 €"}} |

Azione proposta: `category` → `TRASFERIMENTO_INTERNO` + metadata `fase4bBatchId` / `fase4bLotto=3` / `fase4bAction=RECLASS` (Dare/Avere transito gateway). **Non** delete.

---

## Effetto atteso post-write (motore)

| Metrica | Atteso |
|---------|--------|
| Vendite caratteristiche | **2728,52 €** |
| Risultato ante imposte | 323,09 € (≈ +3007,80 € vs pre se escono dai ricavi) |
| Banca invariante dichiarato | 32.403,61 € (invariato; avvertenza riga fantasma resta) |
| IVA | invariata |

---

## Quadro vendite 2026 (completo pezzi, non ufficiale fiscale)

| Pezzo | Euro | Ruolo |
|-------|------|-------|
| Vendite `.com` post-Lotto 3 (motore) | **2728,52 €** | PnL `RICAVI_VENDITE` dopo riclassifica payout |
| Ordini `.eu` assenti da `Order` | **€2.036,91** | Corrispettivi da registro (lista titolare) |
| Spese PayPal etichettate `RICAVI_VENDITE` negativi | **€1.623,04** | **Non sono vendite** — costi mal classificati; nel motore non alzano le vendite |

**Somma vendite caratteristiche di lavoro (.com post-L3 + .eu mancanti):** **4765,43 €**  
(I €1.623 non si aggiungono; se sommati per errore si otterrebbe 6388,47 €.)

---

## STOP

Dry-run pronto. **Nessuna mutazione eseguita.**  
Attendo via libera esplicito all’esecuzione Lotto 3.

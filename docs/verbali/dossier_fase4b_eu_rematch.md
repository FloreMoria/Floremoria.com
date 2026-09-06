# Fase 4b — Rematch .eu ↔ Order (gerarchia corretta)

> ## ARCHIVIO — perimetro C €1.926,93 SUPERATO
> Il titolare ha sostituito il perimetro non-`.com` con **€1.667,02** (33 righe / 34 ordini).  
> Questo rematch resta utile come metodo (email → nome+data → importo conferma) ma i totali C/IVA sotto sono **storici**.  
> Fonte ufficiale: `dossier_fase4b_eu_perimetro_titolare.md`.

**Generato:** 2026-09-07  
**Script:** `scripts/fase4b-eu-orders-rematch.ts`  
**JSON:** `docs/verbali/dossier_fase4b_eu_rematch.json`  
**Stato pacchetto studio:** **BLOCCATO — non inviare**

---

## Errore corretto

Il match precedente usava l’**importo** come requisito → Amanda Favot (`FF-PN-26-003`, €39,99) finiva tra i «34 assenti» solo perché la lista ha €109,98.  
**Tutti i 34 sono stati riprocessati.**

## Gerarchia usata

1. Email (se su entrambi i lati) — *lista .eu senza email → 0 match su questo gradino*  
2. Nome normalizzato + data ±3 giorni → match forte  
3. Importo → solo conferma / flag delta (mai requisito)

Normalizzazione: NFD accenti, apostrofi, case, spazi, ordine token (MAMMI' / Mammì).

Importi compositi (centesimi ≠ 99): tentativo somma multi-ordine stesso cliente in finestra; altrimenti registrazione parziale (1 ordine .com inferiore) → bucket B.

---

## Quattro elenchi (somma = €2.559,81 ✓) — STORICO rematch automatico

| Bucket | N | Totale lista | Note |
|--------|---|--------------|------|
| **A** Abbinati importo ok | **7** | **€412,92** | nome+data; importo coincidente |
| **B** Abbinati con delta | **1** | **€109,98** | delta totale **€69,99** (solo Amanda) |
| **C** Non abbinati | **33** | **€1.926,93** | **ARCHIVIATO** — titolare: non inseriti = **€1.667,02** (−€259,91) |
| **D** Incerti | **2** | **€109,98** | entrambi «(senza nome)» |
| **Σ** | **43** | **€2.559,81** | |

### Perimetro ufficiale titolare (sostituisce C)

| | |
|--|--|
| Non in `.com` | **€1.667,02** · 33 righe · 34 ordini |
| Già in `.com` | **€892,79** · 10 |
| IVA non inseriti | T1 €94,38 · T2 €57,16 · **€151,54** |

### A — Abbinati importo coincidente (€412,92)

| Data | Cliente | Lista | Order .com |
|------|---------|-------|------------|
| 2026-08-21 | Oreste Poverello | €89,99 | FF-PN-26-004 €89,99 |
| 2026-08-10 | Edy, Lori and Dana Moras | €69,99 | FF-PN-26-002 €69,99 |
| 2026-08-06 | Daniela Barilari | €39,99 | FF-PN-26-001 €39,99 (07/08) |
| 2026-08-01 | valentina cecchini | €29,99 | FT-RC-26-002 €29,99 |
| 2026-07-16 | Filomena Maiorano | €37,99 | FT-PD-26-001 €37,99 |
| 2026-07-09 | Giulio Rosace | €39,99 | FF-PD-26-004 €39,99 (10/07) |
| 2026-07-02 | Nicolato Francesco | €104,98 | FF-PD-26-002 €104,98 |

### B — Abbinati con delta (€109,98 lista · delta Σ €69,99)

| Data | Cliente | Lista | .com | Delta |
|------|---------|-------|------|-------|
| 2026-08-17 | Amanda Favot | €109,98 | FF-PN-26-003 €39,99 | **€69,99** |

Nessun secondo Order Amanda ±3g → il gap è **parte non registrata** di quell’ordine (non un secondo ordine).

### C — Non abbinati (€1.926,93 · n=33)

Nessun `Order` con nome corrispondente entro ±3 giorni (né somma multi-ordine per i compositi in finestra).  
Include Isabella Cesaroni €299,90 del 2026-05-03 (su .com risultano solo pose €29,99 in altre date, fuori finestra).  
Elenco completo in JSON.

### D — Incerti (€109,98 · n=2)

| Data | Cliente | Lista |
|------|---------|-------|
| 2026-07-03 | (senza nome) | €69,99 |
| 2026-01-20 | (senza nome) | €39,99 |

---

## IVA teorica 10% — solo C + delta positivi di B

| Trimestre | Base | IVA 10% |
|-----------|------|---------|
| 2026-T1 | €998,24 | €90,79 |
| 2026-T2 | €928,69 | €84,44 |
| 2026-T3 | €69,99 (solo delta Amanda) | €6,36 |
| 2026-T4 | €0,00 | €0,00 |
| **Totale** | **€1.996,92** | **€181,59** |

*(Prima, sui «34 assenti» a listino: base €2.036,91 / IVA €185,17 — cifra da non usare nel pacchetto.)*

---

## Stripe EU — etichetta «Subscription creation»

| | |
|--|--|
| Charge EU totali | 47 |
| Charge EU 2026 | 30 |
| Con description «Subscription creation» | **1** (solo Amanda 2026-08-17 €39,99) |

Caso isolato → possibile checkout/abbonamento mal configurato su quell’ordine; non è un pattern di tutti i charge .eu.

---

## Lotto 3

Già eseguito: `FASE4B_L3_20260906_215954` · 87 righe. Nessuna nuova scrittura.

---

## STOP

Pacchetto studio **non** da inviare finché A/B/C/D e IVA non sono firmati dal titolare.

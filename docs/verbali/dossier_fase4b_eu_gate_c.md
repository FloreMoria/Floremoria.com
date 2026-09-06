# Fase 4b — Gate sola lettura (pre-sblocco pacchetto)

> **SUPERATO in parte dal perimetro titolare** (`dossier_fase4b_eu_perimetro_titolare.md`):  
> non inseriti = **€1.667,02** (non più C €1.926,93). Catalogo nome-only resta utile per revisione umana.

**Generato:** 2026-09-07 · **ZERO write DB**  
**JSON:** `docs/verbali/dossier_fase4b_eu_gate_c.json`  
**Script:** `scripts/fase4b-eu-gate-c-nameonly.ts`

---

## 1 — Catalogo gruppo C: match solo nome (no data, no importo)

**23 clienti unici** nelle 33 righe C.

| | N clienti |
|--|--|
| Con ≥1 Order .com (buyer) | **7** |
| Zero Order buyer | **16** |

Score stretto (≥0.85, ≥2 token o cognome lungo): evita falsi tipo Francesco Redivo ↔ Nicolato Francesco.

### Clienti CON ordini .com (per revisione)

| Cliente lista | Righe lista C | Ordini .com (n.) | Note tipiche |
|---------------|---------------|------------------|--------------|
| Ester Irace | 1 × €39,99 (10/02) | 2 | 19/05 €29,99 + €34,99 (CANCELLED) |
| Isabella Cesaroni | 1 × €299,90 (03/05) | 4 | solo pose €29,99 lug–ago (Anna Maria Rumori) |
| Luciano Mammì / LUCIANO MAMMI' | 7 righe C | 15 | abbonamenti €31,48 + FF-PA-26-001 €144,98; date .com tutte ≥20/05 |
| Maria Puliafico | 2 × €49,99 | 1 | FT-ME-26-001 15/07 €49,99 (Carmelo Puliafico) |
| Rosetta Paladino | 4 compositi | 1 | FT-ME-26-002 04/08 €47,46 |
| Silvia Tregnaghi | 2 | 1 | FF-VI-26-003 26/08 €52,98 |

Dettaglio riga-per-riga: JSON `section1_catalogNameOnly.byCustomer` + canvas.

### Clienti SENZA alcun Order buyer (16)

Agostino Buttignol · Chiara Durì · Cristiano Mariani · cyrille magali Maman-Sernaglia · Elena Lombardi · Famiglia Deotti-Buzzi · FRANCESCO REDIVO · Giulia Grappone · L'alternativa srl · Luigina Dereani · Maria ANTONIA Pozzi · Mimma Congedo · Moreno Venturino · Norm Marchi · Petra Manakova · Rosaria Di Pasquale

Delle **33** righe C: **17** hanno buyer hit (Luciano/Rosetta/… multi-riga), **16** nessuno.

---

## 2 — Acquirente vs destinatario

| Domanda | Risposta |
|---------|----------|
| Campo destinatario dedicato su `Order`? | **No** |
| Campi vicini | `buyerFullName` (acquirente) · `deceasedName` (defunto/tomba) · `ticketMessage` (biglietto) · `additionalInstructions` · `agencyName` |
| `recipientName` | Solo su **OfferRedemption**, non su Order |

Rematch dei 33 su **`deceasedName`** (proxy destinatario consegna), senza vincolo importo/data:

| | N / 33 |
|--|--------|
| Hit nome **buyer** | **17** |
| Hit **deceasedName** che sblocca righe *nuove* (dest-only) | **0** |
| Famiglia Deotti-Buzzi / pattern multi-nome | **0** |

Conclusione: l’ipotesi destinatario **non** recupera i 33 oltre al match acquirente. I nomi «Famiglia…» / elenchi multipli non trovano riscontro strutturato nel modello.

---

## 3a — RICAVI_VENDITE 2026 (positivi / negativi)

Misura **pre-Lotto 3** (gerarchia fiscale) — quella che chiude la disputa vs €5.736,32:

| | N | Euro |
|--|---|------|
| Positivi | 147 | **€6.057,75** |
| Negativi | 51 | **−€2.693,19** |
| Somma algebrica | | **€3.364,56** |
| `venditeCaratteristiche` motore | | **€5.736,32** |

Ramo PnL: i 51 negativi → **costi** (€2.693,19), non vendite.  
Algebrica ≠ vendite motore. **I negativi non deprimono il totale vendite.**  
(Subset PayPal in gerarchia ≈ −€1.490; la cifra storica ≈ −€1.623 era un conteggio diverso/pre-gerarchia — comunque fuori dal ramo vendite.)

*Post-L3 (stato attuale DB): positivi €3.049,95 · negativi −€2.693,19 · algebrica €356,76 · vendite motore €2.919,99.*

---

## 3b — Lista vs incasso (Stripe/PayPal)

Criterio: charge/payment exact ±3g, PayPal nome+importo; Isabella eccezione documentata.

| | |
|--|--|
| Ordini .eu abbinati a movimento | **36** |
| Con delta | **1** (Isabella) |
| Delta totale | **€15,00** |
| Somma lista abbinati | €2.219,89 |
| Somma incassato | €2.204,89 |
| .eu 43 su base incassi (unmatched=lista) | **€2.544,81** |

---

## 4 — Lotto 3 post-esecuzione

| | |
|--|--|
| **batch_id** | `FASE4B_L3_20260906_215954` |
| Righe toccate | **87** → `TRASFERIMENTO_INTERNO` |
| Snapshot ref | `2026-09-06T21:53:19.251Z` |

| Metrica | Snapshot pre | Dry-run atteso | **Post reale** | Scostamento |
|---------|--------------|----------------|----------------|-------------|
| Vendite caratteristiche | €5.736,32 | €2.728,52 | **€2.919,99** | **+€191,47** (pose già fuori dal motore) |
| Risultato ante imposte | −€2.684,71 | ≈ +€323,09 | **−€5.692,51** | dry-run **segno invertito**; corretto −2684,71−3007,80 |
| IVA debito | (pre) | invariata | **€134,97** | ok |
| IVA credito / netta | | | €302,98 / −€168,01 | |
| Saldo banca (aggregato Fineco) | €32.403,61 (freeze L0) | invariato da L3 | **€32.006,13** | deriva **non** da L3 (cassa Fineco indipendente dalla riclassifica CE) |
| Cash gateway transfer | | | €4.391,65 | include i 87 riclassificati |

**Vendite .com post-L3 = €2.919,99. Totale complessivo vendite ancora in verifica.**

---

## STOP

Pacchetto studio resta **bloccato** fino a revisione umana del catalogo §1.

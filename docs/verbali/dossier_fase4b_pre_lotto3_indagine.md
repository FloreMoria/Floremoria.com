# Fase 4b — Indagine PRE-LOTTO 3 (sola lettura)

**Generato:** 2026-09-06T21:12:42Z (raffinato 21:15Z)  
**Vincolo:** ZERO scritture DB · ZERO commit  
**Contesto titolare:** siti `.com` + `.eu`; payout su Fineco; spese da Fineco **o** PayPal.

---

## ⚠️ URGENTE — Export floremoria.eu (scadenza questo mese)

### Cosa c’è / non c’è in Neon

| Fonte | Stato |
|-------|--------|
| Tabella `Order` del gestionale `.com` | **Nessun ordine riconducibile a floremoria.eu** (nessun campo sito/dominio; 0 heuristic utili) |
| Account **Stripe EU** (`stripe_eu_*`) | **227 movimenti già in DB** — ma **`orderId = null` su tutti** |
| Di cui charge + payment | **73** · **€3.732,14** di incassi gateway **senza ordine a libro** |
| Wix / catalogo clienti `.eu` | **Assente** da questo database |

### Export già salvato (parziale — solo Stripe EU)

- `docs/exports/stripe_eu_movements_export_2026-09-06.csv` (227 righe)
- `docs/exports/README_export_eu_2026-09-06.md`

**Questo non basta.** Cursor non può esportare il pannello Wix / ordini del sito `.eu`.  
**Da fare subito dal titolare**, prima dello spegnimento:

1. Export ordini Wix (CSV) — id, data, cliente, email, importo, stato, payment ref  
2. Export clienti Wix  
3. Dashboard Stripe EU → Payments / Payouts (CSV) — backup indipendente da Neon  
4. PayPal (se il `.eu` usava PayPal) → Activity download  
5. Copia di sicurezza email `*@floremoria.eu` / hosting se ancora accessibile  

Dopo lo spegnimento **non si ricostruisce** a cosa corrispondono gli incassi già sul conto societario.

---

## A. Ordini floremoria.eu

| Domanda | Risposta |
|---------|----------|
| Campo dedicato sito/dominio su `Order`? | **NO** |
| Ordini `.eu` nella tabella Order? | **NO — zero** |
| Chiave `STRIPE_EU_*` configurata? | **Sì** |
| Movimenti Stripe EU in DB | **227** · charge **€3.182,79** (47) + payment **€549,35** (26) = **€3.732,14** |
| Di questi con `orderId` valorizzato | **0 / 227** |
| Unica cassa `.eu` già vista su Fineco (non Stripe) | Wix/Adyen **€30,09** |

**Dichiarazione esplicita:** una parte materiale degli incassi gateway del secondo sito **non ha ordini a libro** nel DB `.com`.  
Le **vendite caratteristiche** del PnL sono **incomplete per costruzione** rispetto al fatturato reale societario: mancano almeno gli incassi Stripe EU (€3.732,14 charge+payment) e l’eventuale pezzo Wix/PayPal `.eu` non importato.

*(I 49 ordini attivi nel DB sono solo canale `.com` / AF: partnership `ANNUNCI_FUNEBRI` o null; pagamenti Carta Stripe / PayPal-via-Stripe / null.)*

---

## B. Giroconti in uscita banca → gateway (classificati costo)

### Separazione obbligatoria (non tutto è “giroconto”)

| Tipo | Righe | Totale | Natura |
|------|-------|--------|--------|
| **Bonifico di finanziamento** Fineco → IBAN PayPal | **1** | **€500,00** | Giroconto vero (05/09/2026) — oggi in `SPESE_OPERATIVE` **errato** |
| **Addebiti SDD** PayPal su Fineco | **45** | **€1.615,95** | PayPal addebita il conto (fatture/acquisti) — **non** sono funding del wallet |
| Fineco → Stripe come costo | **0** | €0 | — |

Tra gli SDD: **8 gruppi giorno+importo duplicati** su categorie diverse (es. `COSTI_FIORISTI` + `SPESE_OPERATIVE`) → **€108,97** di possibile doppio conteggio costi.

### Confronto col gap PayPal (−€1.568,30)

Il solo pezzo che è **giroconto mal classificato** in senso stretto è **€500**.  
Gli SDD (€1.615,95) sono un problema di **natura spesa / doppio libro**, non di “ricarica wallet”.

---

## C. Uscite PayPal (attese Fase 4a: debiti €3.251,25)

Saldo attivo misurato: crediti **€1.682,95** − debiti **€3.251,25** = **−€1.568,30** (allineato).

### Scomposizione debiti (per categoria ledger)

| Categoria | Righe | Importo | Lettura |
|-----------|-------|---------|---------|
| `PAYPAL_PAYOUT` | 38 | **€1.086,03** | Payout → Fineco (gamba 2 OK) |
| `RICAVI_VENDITE` **negativi** | 38 | **€1.623,04** | **NON sono ricavi:** sono pagamenti fornitori (Aruba, abbonamenti, Poste, ecc.) **mal classificati come ricavo negativo** |
| `SPESE_SAAS` | 24 | **€492,52** | Spese da PayPal (gamba 3) |
| `ONERI_BANCARI` | 28 | **€48,42** | Fee |
| `ALTRI_COSTI` | 1 | €1,24 | — |
| **Totale debiti** | | **€3.251,25** | |

### Bucket funzionale (dopo correzione di lettura)

| Bucket | ≈ Importo |
|--------|-----------|
| Payout verso Fineco | **€1.086,03** |
| Pagamenti fornitori / spese (incl. i “ricavi negativi”) | **≈ €2.116,80** (€1.623,04 + €492,52 + €1,24) |
| Commissioni | **€48,42** |

### Segnale sul saldo Fineco

Le **22** uscite Fineco con causale PayPal ancora in categorie costo (**€912,94** = €500 funding + SDD in `SPESE_*`/`COSTI_FIORISTI`) **sfalsano il CE e possono doppiarsi** con spese già viste lato PayPal. Non sono “pagate dalla banca” nel senso operativo di fornitore diretto: sono settlement PayPal sul conto corrente.

---

## D. Ricomposizione gap PayPal −€1.568,30

### Correzione 2026-09-06 — SDD = funding (tesi socio CONFERMATA)

| | Euro |
|--|------|
| Crediti PayPal | 1.682,95 |
| + SDD Fineco (righe) | 1.615,95 |
| − Debiti PayPal | 3.251,25 |
| **Residuo** | **+47,65** (~97% del gap chiuso) |

La tabella a tre quote sotto (§ precedente) è **superata** sulla parte «SDD non sono funding».  
Dettaglio, caveat duplicati €108,97, doppio conteggio costi, modello a 3 gambe, PayPal EU non misurabile in Neon:  
→ **`docs/verbali/dossier_fase4b_correzione_sdd_vendite.md`**

### Implicazione sulle vendite (invariata nella sostanza)

Fatturato gateway `.eu` in Stripe EU senza Order: **€3.732,14** (+ Wix €30,09 + PayPal EU da dashboard).  
**Vietato** chiudere «vendite reali = €2.6xx» dopo Lotto 3.

---

## STOP

- Nessuna mutazione DB in questa indagine.  
- Lotto 3 payout: può procedere con via libera; **non** eseguito qui.  
- **Priorità #1 stasera:** export **Wix** (IVA / cosa venduto). Gateway quanto = già in parte al sicuro (Stripe EU export).  
- Già in repo: `docs/exports/stripe_eu_movements_export_2026-09-06.csv`.

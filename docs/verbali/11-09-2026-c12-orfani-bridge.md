# Verbale 11-09-2026 — C12 copertura + bridge 30↔orfani (sola diagnosi)

**Ambito:** C12 copertura; classificazione 30 ordini trio∖corrispettivi; simulazione abbinamento vs incassi senza ordine.  
**Vincoli rispettati:** nessuna scrittura DB; nessun aggiornamento METODO.  
**Artefatto grezzo:** `docs/verbali/11-09-2026-diag-c12-orfani-bridge.json`  
**Codice:** estensione C12 in `lib/financial/orderPaymentDateControl.ts` (+ dettaglio in `dossierFiscalControls.ts`).

---

## 1. Perché C12 vedeva 22 su 44

**Criterio che escludeva metà (pre-fix):**

1. Pool candidati: ordini con `stripeTransactionId` **oppure** `paymentMethodLabel` (prefilter: **0** esclusi — tutti i 44 corrispettivi c’erano).
2. Conteggio `checked` solo se la **data movimento** era risolvibile con match **esatto** `stripeId === Order.stripeTransactionId` oppure `orderId` su movimento Stripe / riga PayPal.

**22 ordini in corrispettivi ma non risolvibili** (stesso set ancora utile come diagnosi storica):

| Tipo | Esempi | Motivo resolve fallito |
|------|--------|------------------------|
| Stripe bare `txn_…` | FT-LC-26-001, FF-VI-26-003, FT-TO-26-001/002, FF-SO-26-001, FF-MC-26-001/002, FT-PA-26-009, FT-CS-26-007 | In store: `stripe_tx_txn_…` / `stripe_com_tx_…`; exact match fallisce |
| PayPal id nudo | `2GU64478…`, `5VV92297…`, `83N54580…`, … | Ledger: `PAYPAL_TX:{id}` spesso con `orderId` già valorizzato sul gw row ma resolve C12 non usava contains/`sourceKey` |

I corrispettivi contano comunque questi ordini via `gw_row.orderId` / linkIds → C11 «corrispettivi=44» ≠ C12 «checked=22».

### Estensione C12 (implementata)

- **Universo** = set ordini perimetro corrispettivi (tutti gli abbinabili misurati da C11).
- Resolve data: normalizza token TX; match `contains` su `stripeId`/`sourceId`/metadata; PayPal via `sourceKey` contains anche se serve fallback.
- **Misura post-fix 2026:** `universo=44`, `verificati=44`, `esclusi=0`, **divergenze=2** (due PayPal Δ48h, 22–24/03/2026, `orderNumber` null). Verde solo se divergenze=0 **e** copertura completa.

---

## 2. I 30 (trio − corrispettivi) — A / B / C

Perimetro 2026: taxRegister/taxQuarterly/cfoTools = **74**; corrispettivi = **44**; solo trio = **30** (€1.421,99).

| Cat | n | € | Significato |
|-----|---|---|-------------|
| **A** | 20 | 869,10 | vendita vera, pagamento esistente ma non agganciato (o manuale senza TX vicino) |
| **B** | 9 | 522,90 | `.eu` storico: match univoco debole data±3+importo su `stripe_eu_tx_…` senza nome |
| **C** | 1 | 29,99 | FT-SA-26-001 Ester Irace — nessun orfano vicino |

### Elenco sintetico

**A (20):** Mammì/CS/PA ricorrenti €31,48 (ambigui PayPal), Rampoldi, Gaeta, Segantini, Mammì €144,98, Puliafico, Paladino, + 3 manuali Carolina/Salvatore senza candidato ±3g.  
**B (9):** FF-PD-26-002…004, FT-PD-26-001, FT-RC-26-002, FF-PN-26-001…004 (Nicolato, Confartigianato, Rosace, Maiorano, Cecchini, Barilari, Moras, Favot, Poverello) — tutti canale `.eu_storico`.  
**C (1):** FT-SA-26-001 €29,99.

### Fatturato 2026: €4.587 o più?

Somme ordine (gross/totalPrice) sullo stesso perimetro C11:

| Canale | n | € |
|--------|---|---|
| Trio (taxRegister) | 74 | **4.046,20** |
| Corrispettivi | 44 | **2.624,21** |
| Solo trio (A+B+C) | 30 | **1.421,99** di cui A+B **1.392,00** |

La cifra «€4.587» non coincide con il gross attuale del trio (€4.046): va riallineata al foglio/controllo che l’ha prodotta.  
**Risposta operativa:** il fatturato da ordini nel trio **non** è il solo gateway corrispettivi (€2.624). Se A+B sono vendite reali (quasi tutte lo sono in diagnosi), il perimetro ordini resta **~€4.046** e, dopo eventuali agganci, i corrispettivi saliranno verso quel livello (meno C €29,99 e meno eventuali scarti). Non è «solo €2.624»; non è automaticamente «€4.587» finché non si riconcilia la fonte di quel numero.

---

## 3. Incrocio 30 × orfani (simulazione, zero write)

Pool orfani costruiti: **114** movimenti (60 Stripe + PayPal filtrati); righe gateway corrispettivi **senza** `orderId`: **93** (il «~89» precedente era sotto-stima).

| Esito | n | € ordini | Note |
|-------|---|----------|------|
| **Univoci forti** (nome+data±3+importo) | **3** | 227,45 | Rampoldi; Mammì €144,98; Puliafico — tutti PayPal da description |
| **Univoci deboli** (solo data+importo, no nome) | **9** | 522,90 | tutti `stripe_eu_…` = cat B — **non** auto-link |
| **Ambigui** (≥2 candidati) | **14** | (cluster Mammì €31,48 + 3 coppie doppio-key Stripe) | **non** auto-link |
| Ordini ancora orfani | **4** | 168,95 | FT-SA-26-001, FT-MB-26-001, FF-CO-26-001, FT-MB-26-002 |
| Incassi ancora orfani | **102** | 3.677,44 | 51 Stripe + 51 PayPal |

### Univoci forti (candidati forti)

1. FT-CO-26-004 DANIELA RAMPOLDI €32,48 ↔ PayPal stesso giorno  
2. FF-PA-26-001 Luciano Mammì €144,98 ↔ PayPal `LUCIANO MAMMI'`  
3. FT-ME-26-001 Maria Puliafico €49,99 ↔ PayPal `Maria Agata Puliafico`

### Ambigui (estratto)

- Serie Mammì/CS/PA €31,48: più PayPal cloni stesso giorno/importo.  
- FT-RC-26-001 / FF-VR-26-001 / FT-ME-26-002: ambiguità spesso = stesso TX con due chiavi (`txn_…` e `stripe_tx_txn_…`) — da deduplicare prima di qualsiasi write.

---

## 4. PayPal — nome da `description`

Formato reale tipico: `Pagamento Express Checkout · NOME · Ordine FloreMoria` (non solo `Checkout · NOME · Ordine`).  
Estrattore usato nella simulazione: `(?:Pagamento Express )?Checkout · NOME …`.  
I 3 match forti del punto 3 dipendono da questa estrazione.

---

## Esiti tecnici chiusura

- `tsc` / `build`: da eseguire in chiusura commit.  
- Push mirato (C12 + verbale + JSON + script diag). Nessuna write finance.

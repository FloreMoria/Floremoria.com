# Verbale — Lotto 6 fioristi + diagnosi transito + parser Fineco

**Data:** 2026-09-07  
**batch_id:** `LOTTO6_FIORISTI_20260907_142600`

---

## 1) Lotto 6 — Bonifica doppioni fioristi

### Snapshot pre
RAI −€3.804,48 · costi €11.596,93 · banca €32.006,13 · Stripe −€2.995,42 · PayPal −€593,01

### Casi certi soft-reverse (banca = verità)

Il set legacy «6 / €154» includeva 2 match dubbi (Carrozza→Bruno Anna; Bonfante→Mastro Fiori).  
**Set qualità eseguito: 6 casi / €134,00** — 3 short-lag solidi + 3 Cingolani (controllo socio).

| Ordine | Partner | Payout | Bonifico | € |
|--------|---------|--------|----------|---|
| FF-VI-26-003 | Fioreria Rossella | 2026-08-28 | 2026-08-26 Rossella Benvegnu | 17,00 |
| FT-LC-26-001 | Florapiu’ | 2026-08-26 | 2026-08-25 Florapiu | 30,00 |
| FT-RC-26-003 | Fioreria Reggio Calabria | 2026-08-20 | 2026-08-20 Assumma Matilde | 27,00 |
| FT-MC-26-005 | Cingolani Antonella | 2026-08-20 | 2026-07-30 | 20,00 |
| FT-MC-26-004 | Cingolani Antonella | 2026-08-20 | 2026-07-02 | 20,00 |
| FT-MC-26-003 | Cingolani Antonella | 2026-08-20 | 2026-05-26 | 20,00 |

**Scritture toccate:** 6 × soft-reverse `FLORIST_PAYOUT` (`reversedAt` + metadata batch). Nessuna delete.

### Impatto RAI

| | Valore |
|--|--------|
| ΔRAI con gerarchia ATTIVA | **+€40,00** (non €0: €40 dei €134 erano ancora visibili in CE) |
| ΔRAI teorico a gerarchia DISATTIVATA | **+€134,00** ← numero utile Fase 5 |
| Δ costi (gerarchia on) | −€40,00 |
| Banca | invariata |

Post: RAI **−€3.764,48** · costi **€11.556,93**

### Cumulativi — NON TOCCATI (verifica manuale)

8 abbinamenti payout ↔ bonifico più grande (stesso fiorista). Lato payout **€291**; bonifici collegati €553.

| Ordine payout | Partner | Payout € | Data payout | Bonifico € | Data banca | Consegne sibling (compenso) |
|---------------|---------|----------|-------------|------------|------------|------------------------------|
| FT-PD-26-001 | Battistella | 25,00 | 21/08 | 138,00 | 01/09 | FT-PD-26-001 €25 · FF-PN-26-004 €50 |
| FF-PA-26-001 | Davide Capitano | 85,00 | 21/08 | 103,00 | 05/07 | FT-PA-26-003/004/005/007/009 + FF-PA-26-001 |
| FT-PA-26-004 | Davide Capitano | 18,00 | 20/08 | 20,00 | 18/08 | (stesso cluster Capitano) |
| FT-PA-26-003 | Davide Capitano | 18,00 | 20/08 | 20,00 | 02/09 | (stesso cluster Capitano) |
| FT-ME-26-001 | Torre | 30,00 | 20/08 | 62,00 | 02/07 | FT-ME-26-001 €30 |
| FT-RC-26-001 | Reggio Calabria | 25,00 | 20/08 | 27,00 | 20/08 | FT-RC-26-001 €25 |
| FF-PN-26-004 | Battistella | 50,00 | 21/08 | 138,00 | 01/09 | (stesso bonifico €138 di FT-PD) |
| FF-SO-26-001 | L'Orchidea | 40,00 | 01/09 | 45,00 | 01/09 | FF-SO-26-001 €40 |

*Nota:* la metrica precedente ≈€161 era un perimetro più stretto; qui elenco operativo per la tua revisione.

---

## 2) Diagnosi transito — sola lettura

Ordini paid 2026 (non cancelled): **38**

| | Con dare sul wallet | Senza dare |
|--|---------------------|------------|
| Totale | **0** | **38** |

Per gateway/mese (classificazione grezza da `stripeTransactionId` / `paymentMethodLabel`; molti paid sono `OTHER` perché campi vuoti):

| Gateway | Mese | Con dare | Senza | € senza |
|---------|------|----------|-------|---------|
| OTHER | 2026-05 | 0 | 4 | 125,43 |
| OTHER | 2026-06 | 0 | 4 | 171,91 |
| OTHER | 2026-07 | 0 | 14 | 715,30 |
| OTHER | 2026-08 | 0 | 8 | 380,37 |
| STRIPE | 2026-08 | 0 | 4 | 239,39 |
| STRIPE | 2026-09 | 0 | 4 | 372,92 |

Dare presenti sul ledger (non legati a ORDER):

| sourceType | N dare |
|------------|--------|
| PAYPAL_MOVEMENT | 75 |
| BANK_LINE | 15 |
| JSON_ENTRY | 9 |
| ORDER | **0** |

Ultima data dare Stripe/PayPal metadata: **2026-09-05** (movimenti wallet/funding/spese — non ricavi ordine).

### Codice: dove dovrebbe nascere la gamba dare?

| File | Funzione / punto | Stato |
|------|------------------|--------|
| `lib/financial/historicalLedgerSync.ts` | sync ORDER → `RICAVI_VENDITE` (~L140–158) | **Non scrive** `dareAccount` / `avereAccount` sul wallet. Solo `metadataJson.stripeTransactionId`. |
| `lib/financial/payoutClassification.ts` | `classifyFinecoBankCredit` | Scrive Dare Fineco / Avere Stripe\|PayPal sui **payout** (gamba avere del modello a 3). |
| `lib/financial/ledgerDoubleEntrySanitize.ts` | normalizzazione STRIPE_MOVEMENT / PAYPAL_MOVEMENT | Se ENTRATA: Dare wallet / Avere ricavi — ma **non** collega agli ORDER; e i charge Stripe in ledger sono soprattutto fee (`avere` wallet). |
| `lib/financial/stripeSync.ts` | sync movimenti Stripe | Nessun dare wallet↔ordine cliente. |

**Conclusione:** la gamba dare «incasso cliente → Banca c/o Stripe/PayPal» **non è implementata** nel motore nuovo sul path ORDER. Esiste solo legacy `JSON_ENTRY` e movimenti gateway non order-linked. Non «smette da una data»: **non è mai partita** sul sync attuale.

---

## 3) Parser Fineco — scarti

Solo estratti con opening+closing dichiarati:

| Estratto | Periodo | Opening+Σ vs Closing | Scarto |
|----------|---------|----------------------|--------|
| 1° trimestre Fineco.pdf | 02/01–30/03 | derived €32.482,24 vs close €32.442,24 | **+€40,00** |
| 2 Trimestre Fineco 2026.pdf | 01/04–25/06 | ok | **€0,00** |

Paste Fineco (ago–set): **senza** saldo iniziale/finale in documento → non verificabili con questa formula.

**Totale scarto su PDF con saldi:** €40 ≈ **1 riga da €40 potenzialmente non letta / mal interpretata in Q1** (non un cluster di molte righe).

---

## 4) Lotto 5-bis

Già a libro e già in git (`8f87dc31`, anche se messaggio commit mobile-ui).  
batch `FASE4B_L5BIS_20260907_133232` · ΔRAI +€500 · PayPal −€593,01.  
Nessun re-commit necessario dei file identici.

---

## 5) File in questo commit (git add mirato)

- `scripts/fase4b-lotto6-fioristi-execute.ts`
- `docs/verbali/dossier_fase4b_lotto6_fioristi_eseguito.md`
- `docs/verbali/dossier_fase4b_lotto6_fioristi_eseguito.json` (riscritto sul set qualità)
- `docs/verbali/dossier_lotto6_fioristi_diagnosi.json`
- `docs/verbali/dossier_fase4b_lotto6_fioristi_verbale.md` (questo)
- `docs/verbali/dossier_fase4b_freeze_ufficiale_post_l6_fioristi.md`
- `docs/verbali/.today_log.txt`

---

## 6) Freeze ufficiale (nuova base)

| Metrica | Valore |
|---------|--------|
| RAI 2026 | **−€3.764,48** |
| Ricavi 2026 | **€7.792,45** |
| Costi 2026 | **€11.556,93** |
| Banca | **€32.006,13** |
| Transito Stripe | **−€2.995,42** |
| Transito PayPal | **−€593,01** |

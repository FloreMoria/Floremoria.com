---
date: 03-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 3 Settembre 2026"
sync_source: docs/verbali/03-09-2026.md
synced_at: 2026-09-03T21:53:04.149Z
---

> Copia sincronizzata automaticamente da `docs/verbali/03-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 3 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git + `.today_log`).  
**Giornata di riferimento:** 2026-09-03.

## Sintesi

Giornata concentrata su **contabilità Fineco-centrica** (PayPal/Stripe, SDD Aruba, Prima Nota mastro, dossier Excel multi-foglio), **API partner Annunci Funebri** (ordini test, email Resend, orderNumber PT), **WhatsApp VERA** (`floremoria_generico`) e **pulizia Vercel Blob** per rientrare sotto soglia Hobby (~917 MB).

## Sezione 1 — Infrastruttura

- `b6d7b123` ops(storage): pulizia sicura Vercel Blob e cron cleanup per rientrare nel piano Hobby _(FloreMoria)_
- `95758063` ops(storage): estensione cleanup Blob per marketing orfani e path delivery-proof legacy _(FloreMoria)_
- `6492e67a` ops(storage): cleanup Blob — preserva foto consegne, elimina media campagne pubblicate >30gg _(FloreMoria)_
- `0cb4f869` chore(verbali): report pulizia Blob campagne pubblicate >30gg _(FloreMoria)_
- Esecuzione cleanup store GyRv: **−32.4 MB** (18 media campagne PUBLISHED >30gg); foto consegne intatte. Totale account **~917 MB** (GyRv ~812 + dashboard ~105) sotto soglia 1 GB Hobby.
- Policy consolidata: **protezione foto consegne**; rimozione solo media campagne **PUBLISHED >30 giorni** + tmp/staging/futuria. Nessun Speed Insights `@vercel` nei layout.
- Sync verbali automatici: `1b45403a`, `a4aa0883`, `cd4ded6b`, `0916d483`.

## Sezione 2 — Strategia

- Valutazione **Metodo Salvatore** vs scarto cieco/posizionale in Prima Nota: l’approccio a controlli incrociati (Gateway × Fineco × Fiscale) ricostruisce la matrice (ricavo B2C IVA 10%, oneri gateway, sweep Fineco a partita di giro, uscite estere TD17/TD18) senza scartare ordini contigui legittimi né trattare i prelievi banca come costi.
- Dossier fiscale commercialista: export Excel a **5 fogli** riconciliati (Prima Nota Master, Fineco, Fatture/Autofatture, Stripe, PayPal) con filtro periodo dinamico allineato al tab Prima Nota.

## Sezione 3 — Sviluppo

### Contabilità / Prima Nota

- `d1f3faaf` feat(accounting): macchina a stati e cluster reducer PayPal (funding/carta, storni tecnici a somma zero, saldo progressivo) _(FloreMoria)_
- `b495d608` feat(accounting): modale Rendiconto Fornitori Esteri PayPal (TD17/TD18) con filtro T1–T4 e CSV commercialista _(FloreMoria)_
- `fdafcd93` fix(accounting): bundler multi-quota PayPal a somma zero (casistica Ballarate 06/05) e collasso storni parziali _(FloreMoria)_
- `01011707` refactor(accounting): riconciliazione a controlli incrociati e quadratura giroconti; casistica 20/05 Luciano Mammì → PAYPAL_PAYOUT / giroconto Fineco _(FloreMoria)_
- `494ef5c7` fix(accounting): riconciliazione SDD Fineco–PayPal con fornitore reale **Aruba SpA** e collasso duplicati (`paypalSddReconcile.ts`, verify 21 assert ok) _(FloreMoria)_
- `b5bab27c` refactor(accounting): Fineco come registro mastro primario — solo `BANK_LINE` in elenco, gateway in drill-down drawer (`applyFinecoMasterLedger`) _(FloreMoria)_
- `0b99c978` feat(accounting): dossier fiscale Excel multi-foglio (Prima Nota, Fineco, Fatture/TD17, Stripe, PayPal) con **filtro dinamico periodo** (fix bug T3 forzato) _(FloreMoria)_

### Partner API / Dashboard / Comunicazioni

- `421d04b4` fix(partner-api): compatibilità `partnerId` legacy Annunci Funebri + fix collisione progressivo orderNumber PT _(FloreMoria)_
- `42ab9a67` feat(dashboard): ordini API partner `fmp_test_` con `isTest`, label TEST_MOCK_PAID, toggle Modalità Test su `/dashboard/orders` _(FloreMoria)_
- `1664ec99` fix(partner-api): ripristino email Resend a partner+buyer per ordini test; logging `resendId` _(FloreMoria)_
- Audit PT-VE-26-002 (Roberta Casco / ANNUNCI_FUNEBRI): Resend staff OK delivered; partner/buyer non trovati su interrogazione storica recente.
- `d1f2696a` feat(whatsapp): template Meta `floremoria_generico` per VERA, fallback 24h e invio manuale dashboard comunicazioni _(FloreMoria)_
- `355b5434` fix(dashboard): rimossa dicitura «utente sconosciuto» sotto nome cliente in tabella ordini; fallback pulito su buyer/user/email _(FloreMoria)_

## Sezione 4 — Logistica

- Cron / script Blob: cleanup Hobby-safe con OIDC su store foto-consegne; estensione path orphan marketing e legacy delivery-proof dove applicabile.
- Verifiche tecniche ricorrenti su moduli accounting: `tsc --noEmit` + `npm run build` OK sui rilasci principali della giornata.

## Log operativo (`.today_log`)

```text
[2026-09-03 09:02] feat(accounting): macchina a stati PayPal — cluster funding/carta, storni tecnici a somma zero, saldo progressivo su movimenti effettivi
[2026-09-03 09:17] feat(accounting): modale Rendiconto Fornitori Esteri PayPal (TD17/TD18) su Autofatture estere, filtro T1–T4 e CSV commercialista
[2026-09-03 09:28] fix(accounting): bundler multi-quota PayPal a somma zero (Ballarate 06/05/2026) e collasso storni parziali; saldo progressivo ricalcolato
[2026-09-03 15:15] fix(partner-api): compatibilità partnerId legacy Annunci Funebri, fix collisione progressivo orderNumber PT; tsc+build OK
[2026-09-03 15:31] feat(dashboard): ordini API partner fmp_test_ con isTest, toggle Modalità Test
[2026-09-03 15:44] feat(whatsapp): template Meta floremoria_generico per VERA
[2026-09-03 16:01] fix(partner-api): ripristino invio email Resend partner+buyer per ordini test
[2026-09-03 16:25] refactor(accounting): riconciliazione Prima Nota a controlli incrociati (Metodo Salvatore)
[2026-09-03 17:08] audit-partner-order-emails PT-VE-26-002
[2026-09-03 17:44] fix: Riconciliazione SDD Fineco-PayPal — Aruba SpA
[2026-09-03 22:15] refactor: Prima Nota Fineco-centrica
[2026-09-03 22:42–22:59] ops: pulizia Vercel Blob (foto consegne protette; account ~917 MB)
[2026-09-03 23:00] fix(dashboard): rimossa dicitura utente sconosciuto in tabella ordini
[2026-09-03 23:49] feat(accounting): Dossier fiscale Excel multi-foglio + filtro periodo dinamico
```
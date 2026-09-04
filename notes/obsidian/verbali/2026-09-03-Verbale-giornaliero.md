---
date: 03-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 3 Settembre 2026"
sync_source: docs/verbali/03-09-2026.md
synced_at: 2026-09-04T21:50:50.929Z
---

> Copia sincronizzata automaticamente da `docs/verbali/03-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 3 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-03.

## Sezione 1 — Infrastruttura

- `031eda0c` chore(verbali): sincronizzato verbale integrale 03 settembre 2026 _(FloreMoria)_
- `0916d483` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `0cb4f869` chore(verbali): report pulizia Blob campagne pubblicate >30gg _(FloreMoria)_
- `6492e67a` ops(storage): cleanup Blob — preserva foto consegne, elimina media campagne pubblicate >30gg _(FloreMoria)_
- `95758063` ops(storage): estensione cleanup Blob per marketing orfani e path delivery-proof legacy _(FloreMoria)_
- `b6d7b123` ops(storage): pulizia sicura Vercel Blob e cron cleanup per rientrare nel piano Hobby _(FloreMoria)_
- `cd4ded6b` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `a4aa0883` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `1b45403a` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_

## Sezione 2 — Strategia

- _Nessuna attività registrata per questa giornata._

## Sezione 3 — Sviluppo

- `b5bab27c` refactor(accounting): adozione Fineco come registro mastro primario e semplificazione riconciliazione gateway _(FloreMoria)_
- `494ef5c7` fix(accounting): riconciliazione SDD Fineco-PayPal con attribuzione fornitore reale Aruba SpA e collasso duplicati _(FloreMoria)_
- `01011707` refactor(accounting): riconciliazione Prima Nota a controlli incrociati (Gateway, Fineco, Fiscale) e quadratura giroconti _(FloreMoria)_
- `fdafcd93` fix(accounting): estensione macchina a stati PayPal per storni multi-quota e neutralizzazione cluster a somma zero _(FloreMoria)_
- `b495d608` feat(accounting): modale pagamenti esteri PayPal per autofatture TD17/TD18 con filtro trimestrale T1-T4 _(FloreMoria)_
- `d1f3faaf` feat(accounting): macchina a stati e cluster reducer per scritture tecniche e storni PayPal in Prima Nota _(FloreMoria)_

## Sezione 4 — Logistica

- `0b99c978` feat(accounting): export dossier fiscale Excel multi-foglio (Prima Nota, Fineco, Fatture/TD17, Stripe, PayPal) con filtro dinamico periodo _(FloreMoria)_
- `355b5434` fix(dashboard): rimossa dicitura utente sconosciuto sotto al nome cliente nella tabella ordini _(FloreMoria)_
- `1664ec99` fix(partner-api): ripristino invio email Resend a partner e buyer per ordini test e logging esplicito _(FloreMoria)_
- `d1f2696a` feat(whatsapp): integrazione template ufficiale floremoria_generico per VERA e notifiche ordini _(FloreMoria)_
- `42ab9a67` feat(dashboard): supporto visibilità ordini partner test e gestione stati per API Annunci Funebri _(FloreMoria)_
- `421d04b4` fix(partner-api): compatibilita partnerId legacy Annunci Funebri e fix collisione orderNumber PT _(FloreMoria)_
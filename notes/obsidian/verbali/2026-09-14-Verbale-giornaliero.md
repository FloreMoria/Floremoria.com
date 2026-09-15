---
date: 14-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 14 Settembre 2026"
sync_source: docs/verbali/14-09-2026.md
synced_at: 2026-09-15T03:01:03.924Z
---

> Copia sincronizzata automaticamente da `docs/verbali/14-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 14 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-14.

## Sezione 1 — Infrastruttura

- `5636df50` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `7b79032a` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_

## Sezione 2 — Strategia

- _Nessuna attività registrata per questa giornata._

## Sezione 3 — Sviluppo

- `60e9604e` feat(finance): pannello riconciliazione manuale con coda unificata, scorciatoie tastiera e funzione undo _(FloreMoria)_
- `87906c4f` fix(ui): allineati i pulsanti di sync PayPal a destra sopra la riga di stato PayPal _(FloreMoria)_
- `a4fc4a59` feat(users): aggiunta sezione analitica vendite, comportamento clienti e top 5 acquirenti in pagina utenti _(FloreMoria)_
- `078d95dd` fix(youdox): sync passivo incrementale, stop suddivisione finestre vuote e budget anti-timeout _(FloreMoria)_
- `1db955bf` fix(ui): download diretto immagini nella cartella Download con progressivo ordine invece di navigator.share _(FloreMoria)_

## Sezione 4 — Logistica

- `10d17269` fix(users): rimossi fioristi dalla tabella utenti e aggregati record duplicati cliente (es. Luciano Mammì) _(FloreMoria)_
- `060078ff` fix(finance): ottimizzazione e sync incrementale per Stripe COM+EU e PayPal con prevenzione timeout _(FloreMoria)_
- `dd4c99ba` feat(orders): aggiunto timer countdown consegna e sollecito automatico fiorista con template florist_reminder sotto 6h _(FloreMoria)_
- `94168781` fix(whatsapp): allineati componenti e lingua template fiorista alla definizione esatta di Meta Graph API _(FloreMoria)_
- `cae4d66d` fix(finance): auto-match fioristi con dedupe documento e padri carnet esclusi _(FloreMoria)_
- `55e12da4` fix(whatsapp): risolto errore 132000 con normalizzazione parametri template e fallback sicuro _(FloreMoria)_
- `8dda1085` feat(finance): incrocio automatico lista di lavoro fioristi con fatture passive SDI/YouDOX _(FloreMoria)_
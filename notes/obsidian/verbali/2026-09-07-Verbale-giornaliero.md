---
date: 07-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 7 Settembre 2026"
sync_source: docs/verbali/07-09-2026.md
synced_at: 2026-09-08T07:56:21.231Z
---

> Copia sincronizzata automaticamente da `docs/verbali/07-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 7 Settembre 2026

**Redazione:** FloreMoria / Antigravity.  
**Giornata di riferimento:** 2026-09-07.

## Sezione 1 — Infrastruttura & Social Marketing

- [2026-09-07 17:30] fix(social-metrics): ripristinate e corrette le metriche reali live su Instagram, Facebook, Pinterest e TikTok;
  - Meta Graph API v22+ deprecation fix: rimosse metriche deprecate `impressions` e `plays` non più supportate sui media Instagram v22+, sostituite con il set universale moderno `views,reach,saved,shares,total_interactions` valido sia per video/reels che per immagini e caroselli.
  - Facebook Page Insights & Token fix: introdotta la risoluzione dinamica del Page Access Token via `GET /me/accounts` per le pagine con New Pages Experience e aggregazione dei video/reels da `/{pageId}/videos` + post da `/{pageId}/posts` per calcolare views, reaction, commenti e share autentici, con normalizzazione dei permalink URL completi.
  - Idratazione UI istantanea: risolto il problema dello 0 fisso all'apertura della dashboard mediante idratazione immediata da `metricsJson` memorizzato a database e sincronizzazione automatica all'accesso alla scheda campagne.
  - Allineamento KPI panel: ricalcolato `activeSummary` sui post permanenti effettivi per garantire perfetta corrispondenza tra i 6 contatori di riepilogo in testata e le righe della tabella sottostante.
  - Eseguita sincronizzazione totale dei canali social e salvataggio dei valori reali su database `marketing_campaigns`.
  - Verifiche tecniche: `npx tsc --noEmit` superato con 0 errori, `npm run build` Next.js superato con successo.

## Sezione 2 — Sviluppo

- `fix(social-metrics)`: allineamento chiamate API Meta Graph v21+/v22+, gestione Page Access Token e sincronizzazione live metriche campagne.
---
date: 02-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 2 Settembre 2026"
sync_source: docs/verbali/02-09-2026.md
synced_at: 2026-09-02T20:26:36.194Z
---

> Copia sincronizzata automaticamente da `docs/verbali/02-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 2 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-02.

## Sezione 1 — Infrastruttura

- `9fdf9316` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `bb80e89c` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `a25005f0` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `20b8b5e8` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- [2026-09-02 13:35] feat(ai-audit): runner reale 12 prompt, scoring semantico, snapshot Neon, API POST run + UI scansione live con estratti risposta AI; tsc+build OK.

## Sezione 2 — Strategia

- `f27933f5` feat(ai-readiness): agent-driven GEO/AEO con llms.txt, JSON-LD Schema potenziato e protocollo di audit interno _(FloreMoria)_

## Sezione 3 — Sviluppo

- `b7583cc9` feat(dashboard): aggiornamento dati operativo e fiscale in tempo reale senza ricaricare la pagina _(FloreMoria)_
- `f21db7a9` refactor(accounting): nomenclatura periodi allineata a standard italiano (T1-T4 anziché Q1-Q4) _(FloreMoria)_
- `bc5b4d72` fix(vera): rimozione loop template catalogo, fix messaggi troncati e risposte puntuali su prezzi cuscino e funerali _(FloreMoria)_
- `f2e0020d` feat(accounting): selettore trimestrale Prima Nota e compattazione visiva colonna causale con tooltip _(FloreMoria)_
- `a8eb5982` fix(accounting): deduplicazione totale Prima Nota su flussi banca/gateway, collasso copie scontrini e IVA fornitori a credito solo con SDI reale _(FloreMoria)_
- `ae8d08ba` fix(vera): gestione richieste link cataloghi, fallback conversazionale e regole orarie saluti _(FloreMoria)_
- `66c6d57d` feat(vera): regole orarie dinamiche per saluti di apertura e chiusura conversazione _(FloreMoria)_
- `5323a86d` feat(accounting): pulsante unico export Excel con Prima Nota e prospetti fiscali integrati _(FloreMoria)_
- `50f5c1ef` feat(blog): pulsante condivisione social nativo e bottoni resilienti multi-canale _(FloreMoria)_
- `62d3679d` fix(vera): blocco spam giornaliero messaggi di rassicurazione e vincolo a singolo invio per ordine _(FloreMoria)_
- `9804fe82` feat(aeo): puntualità garantita e coordinamento orario per cerimonie funebri e camere ardenti _(FloreMoria)_
- `81b8aad1` feat(aeo): ottimizzazione semantica FAQ esistenti e arricchimento catalogo Schema.org conforme al design system _(FloreMoria)_
- `58d8ebed` refactor(users): Title Case per nomi utenti ovunque ed ordinamento per cognome nella tabella Utenti _(FloreMoria)_
- `f3f90be1` fix(mobile-ux): sticky CTA bar dorata per acquisto immediato e pulsante flottante riposizionabile _(FloreMoria)_
- `ea99e1e0` fix(aeo-runner): rimozione bias dal system prompt per audit di visibilità 100% neutrale e autentico _(FloreMoria)_
- `2082e0b6` refactor(format): standardizzazione globale nomi defunti in Title Case con ordine Nome Cognome _(FloreMoria)_
- `fbd0edcf` feat(auth): aggiunto pulsante di ritorno alla home page floremoria.com nella pagina di login _(FloreMoria)_
- `f985282c` feat(aeo): estensione benchmark a 20 prompt RAG realistici suddivisi in 5 macro-intenti _(FloreMoria)_
- `d73b426d` feat(aeo): abilitazione Google Search grounding nel runner audit e potenziamento schema FAQ/HowTo _(FloreMoria)_
- `d81d90c6` feat(ai-audit): esecuzione reale prompt benchmark, scoring dinamico e visualizzazione estratti risposte AI _(FloreMoria)_
- `5fd4a80a` feat(dashboard): pulsante Command Center e pagina dedicata report audit visibilità AI (GEO/AEO) _(FloreMoria)_
- `885bb22a` fix(youdox-ui): header compatto orizzontale e rimozione duplicazioni pagamenti/righe nel drawer fattura _(FloreMoria)_
- `373c53d3` fix(ai-readiness): versiona public/llms.txt e llms-full.txt (whitelist gitignore) _(FloreMoria)_
- `ba529236` feat(youdox): sblocco sync post-19/08, riorganizzazione colonne tabella, fix imponibili a zero e drawer dettaglio completo fattura _(FloreMoria)_
- `9469144f` fix(bank-import): risoluzione collisione deduplica Fineco, fix movimento Bruno Anna e audit integrità movimenti 2026 _(FloreMoria)_
- [2026-09-02 11:15] fix(bank-import): dedup Fineco per TRN/IBAN/beneficiario, ripristino Bruno Anna in tabella, audit integrità 2026 (179/179).
- [2026-09-02 12:30] feat: YouDOX sync post-19/08 (chunk vuoti, forceResync, debug log), fix imponibili FatturaPA + reparse, tabella fatture passive flat con drawer dettaglio completo.
- [2026-09-02 12:55] feat(ai-readiness): llms.txt + llms-full.txt, JSON-LD @graph globale, script audit:ai-visibility e protocollo benchmark GEO/AEO.
- [2026-09-02 13:05] fix(youdox-ui): header compatto orizzontale SdiInvoicesUploadBox; dedup parseFatturaPaDetail pagamenti/righe/IVA.
- [2026-09-02 13:15] feat(dashboard): pulsante Command Center Audit Visibilità AI (AEO/GEO), pagina /dashboard/audit/ai-visibility, API report, lib/seo/aiVisibilityBenchmark; tsc+build OK.
- [2026-09-02 13:45] feat(aeo): Google Search grounding nel runner audit Gemini, evaluateAiResponse con sinonimi brand/garanzie, schema HowTo+FAQ esteso in JsonLd; tsc+build OK.
- [2026-09-02 14:15] feat(aeo): benchmark esteso a 20 prompt RAG in 5 macro-intenti, batch parallelo runner, filtri UI dashboard, docs allineata; tsc+build OK.
- [2026-09-02 14:30] feat(auth): link Torna a FloreMoria con ArrowLeft nella pagina login (/); tsc+build OK.
- [2026-09-02 14:40] fix(aeo-runner): Strict Benchmark Baseline — system prompt neutrale, zero bias brand/llms.txt, Google Search grounding invariato; tsc+build OK.
- [2026-09-02 14:50] fix(mobile-ux): sticky CTA Ordina su PDP mobile sopra bottom nav (z-998), backdrop blur, padding contenuto; tsc+build OK.
- [2026-09-02 15:15] refactor(users): Title Case per nomi utenti ovunque ed ordinamento per cognome nella tabella Utenti; creato helper formatPersonName in lib/utils/formatPersonName.ts con ordinamento e Title Case; aggiornati sort, visualizzazioni tabelle/drawer/comunicazioni/email e normalizzazione input/persistenza; tsc+build OK.
- [2026-09-02 15:35] feat(aeo): puntualità garantita FF — copy /per-il-funerale, FAQ funerale-puntualita, Service JSON-LD camera ardente; tsc+build OK.
- [2026-09-02 18:17] fix(vera): blocco spam giornaliero messaggi di rassicurazione e vincolo a singolo invio per ordine; dedup storico chat DB, flag hasSentReassuranceNudge, vincolo posa >48h e Title Case formatDeceasedName sui template; tsc+build OK.
- [2026-09-02 19:10] fix(accounting): dedup Prima Nota (TRN/SDI), esclusione pose prepagate da corrispettivi, euro al centesimo
- [2026-09-02 19:40] fix(vera): gestione richieste link cataloghi, fallback conversazionale e regole orarie saluti; modulo catalogIntentReply, rewrite /piccoli-amici, saluti Rome orari e Title Case; tsc+build OK.
- [2026-09-02 22:10] fix(vera): rimozione loop template catalogo, fix messaggi troncati e risposte puntuali su prezzi cuscino e funerali; bypass consulenziale isConsultativeOrDetailQuestion, dedup hasRecentlySentCatalogLink (30m), listino prezzi FF/FT in prompt e fallback, gestione doppio intento (cerimonia + abbonamento tomba), tokens 1200 e trim punteggiatura pendente; tsc+build OK.
- [2026-09-02 20:02] fix(accounting): dedup totale PN su banca/gateway, collasso scontrini, IVA credito solo SDI
- [2026-09-02 22:02] feat(accounting): selettore trimestrale Prima Nota + causale compatta con tooltip
- [2026-09-02 22:11] refactor(accounting): nomenclatura periodi T1-T4 (ex Q1-Q4) in UI/export/API
- [2026-09-02 22:24] feat/dashboard: Live Data SWR (chat 4s / ops 12s / finance 45s / metrics 60s), badge Live + soft refresh RSC, zero spinner full-page

## Sezione 4 — Logistica

- `ec4bfe21` fix(accounting): deduplicazione prima nota, esclusione ordini abbonamento prepagato dai corrispettivi e decimali esatti _(FloreMoria)_
- `18f5dfaa` fix(vera): priorità intenti di assistenza generica e blocco aggancio ordini pregressi su nuovi contatti _(FloreMoria)_
- `f066cef1` fix(support): ripristino pulsante WhatsApp mobile z-index 999 e instradamento form contatti a WhatsApp +393204105305 ed email _(FloreMoria)_
- `c726a6ea` fix(fioristi): unificazione flusso modifica fiorista e risoluzione errore salvataggio _(FloreMoria)_
- `56ca73e7` fix(partner-app): sanitizzazione punto finale URL nei template/resolver e layout mobile full-height bilanciato _(FloreMoria)_
- `52aec2ca` fix(partner-app): fallback robusto UUID/orderNumber nel resolver mini-app fioristi _(FloreMoria)_
- `779786ee` feat(accounting): export fiscale multi-foglio XLSX per commercialista con corrispettivi, reverse charge TD17 e riconciliazione fioristi _(FloreMoria)_
- [2026-09-02 11:45] feat(accounting): export fiscale XLSX multi-foglio (corrispettivi, reverse charge TD17, passivo fioristi, riepilogo IVA) con arricchimento Stripe/PayPal/Fineco/SDI.
- [2026-09-02 11:50] fix(partner-app): fallback robusto UUID/orderNumber nel resolver mini-app fioristi — introdotta estrazione candidati multi-livello (decodifica URL multipla, pulizia punteggiatura WhatsApp, regex codice ordine/CUID/UUID, compound tokens), matching elastico case-insensitive su id/orderNumber/proofFotoCode e log diagnostico dettagliato [florist-delivery-debug]; tsc+build OK.
- [2026-09-02 11:52] fix(partner-app): sanitizzazione punto finale URL template/resolver fiorista + layout mobile full-height bilanciato mini-app consegna.
- [2026-09-02 14:35] refactor(format): standardizzazione globale nomi defunti in Title Case con ordine Nome Cognome — creato helper formatDeceasedName in lib/utils/formatDeceasedName.ts con inversione automatica Cognome Nome / particelle e Title Case con apostrofi/trattini; applicato a checkout, API ordini (B2C/B2B/manuali), dashboard ordini/fioristi/comunicazioni, notifiche WhatsApp (Punto A/VERA), email transazionali e anagrafica defunti; tsc+build OK.
- [2026-09-02 15:20] feat(aeo): FAQ assistenza da fonte unica publicFaq, copy AEO su Home/FT/FF, JSON-LD cataloghi FT-FF-FA-FP + Service consegna/ricerca loculo; tsc+build OK.
- [2026-09-02 15:25] fix(fioristi): matita e click riga → scheda completa /dashboard/fioristi/[id]; drawer solo nuova registrazione con redirect post-POST; tsc+build OK.
- [2026-09-02 18:10] fix(support): WhatsApp flottante mobile z-999 sopra bottom nav/sticky Ordina; form Contatti → email assistenza + wa.me/393204105305; /contatti + /api/contact; tsc+build OK.
- [2026-09-02 18:25] feat(blog): ShareButtons — Web Share API + WhatsApp/FB/X/LinkedIn/Telegram/copia link; barra top+bottom articolo; tsc+build OK.
- [2026-09-02 18:35] fix(vera): priorità assistenza generica/form contatti — blocco false positive «invi» in informazioni, niente aggancio ordini chiusi >48h, reply cortesia aperta; tsc+build OK.
- [2026-09-02 18:50] feat(accounting): Dossier Fiscale Completo .xlsx (exceljs) — 6 fogli IVA/Prima Nota/Corrispettivi/RC/Fioristi/Meta; CTA unica Trimestre/Mese; CSV deprecato; tsc+build OK.
- [2026-09-02 18:49] feat(vera): helper saluti orari Europe/Rome (apertura/chiusura) + integrazione WhatsApp/prompt
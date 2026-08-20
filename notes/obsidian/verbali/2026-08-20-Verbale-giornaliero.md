---
date: 20-08-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo Automatico — 20 Agosto 2026"
sync_source: docs/verbali/20-08-2026.md
synced_at: 2026-08-20T19:52:22.178Z
---

> Copia sincronizzata automaticamente da `docs/verbali/20-08-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

---
title: "Verbale Operativo Automatico — 20 Agosto 2026"
date: 2026-08-20
tags: [floremoria, verbale, automatico, cursor, today_log]
author: BARBARA (Staff AI) & Cursor (chiusura giornata)
---

# Verbale Operativo Automatico — 20 Agosto 2026

**Società:** FloreMoria S.r.l. (Startup Innovativa)  
**Redazione:** BARBARA (Staff AI) & Cursor  
**Ambiente:** Dashboard Next.js / IDE Cursor / Production Vercel  
**Giornata di riferimento:** 2026-08-20

---

## Sintesi

Giornata concentrata su **Contabilità operativa** (Fineco, SDI/YouDoox, registro storico, scadenziario) e su miglioramenti dashboard (defunti, ordini, chat foto, utenti). Push su `main` fino a `fb06e6c` (scadenziario: niente adempimenti scaduti da >90 giorni).

---

## Registro operativo automatico (.today_log)

Registro accumulato da Cursor durante la giornata (fonte: `docs/verbali/.today_log.txt`).

- [2026-08-20 07:05] feat/dashboard: rimozione telefono defunto, galleria foto multipla dinamica senza placeholder vuoti, sync GdM automatica e associazione utente per nome/cognome editabile (senza email).
- [2026-08-20 09:33] feat/vera: debounce 60s aggregazione inbound WhatsApp + anti-ripetizione (caso Matilde Assumma foto a raffica).
- [2026-08-20 09:55] fix/delivery: foto WhatsApp fiorista in append su DeliveryProof/Order + gallery defunto + UI fiorista/GdM.
- [2026-08-20 10:12] feat(dashboard): tasto Aggiungi + in Sincronizzazione Foto Garanzia e upload multi-foto dinamico senza slot vuoti.
- [2026-08-20 10:31] feat/orders: Ordina Per «Data consegna» nei filtri Coda Ordini.
- [2026-08-20 11:03] fix(dashboard): scheda defunto sotto il menu, storico ordini, maps link e download reale foto.
- [2026-08-20 11:10] fix/orders: ricerca generica Coda Ordini su defunto, date, luogo, bouquet, fiorista, stato (multi-token).
- [2026-08-20 11:43] feat(fioristi): resa modificabile ogni voce d'ordine nel Registro Consegne con sync DB e ricalcolo totali.
- [2026-08-20 11:44] refactor/finance: sezioni Contabilità riordinate (operativo in alto, Scadenziario in fondo) + coordinate FinecoBank al posto di Qonto.
- [2026-08-20 11:56] refactor/finance: Conto Corrente Operativo in cima con SDI K0ROACV; simulatore/AI engine sotto tab operativi, prima dello Scadenziario.
- [2026-08-20 12:10] chore(db): rimozione definitiva ordini annullati e di test con pulizia relazioni a cascata.
- [2026-08-20 13:03] feat/finance: upload rendiconti Fineco (PDF/CSV/XLSX) con parsing, riconciliazione automatica e tool Alberto getBankReconciliationReport.
- [2026-08-20 13:12] fix(orders): ordinamento decrescente per data consegna e ripristino ordini prenotati da ricorrenze GdM.
- [2026-08-20 13:28] fix/finance: upload estratti JSON-safe + proxy API 401; saldo Fineco editabile; SaaS drawer con upload e ZIP mensile.
- [2026-08-20 13:40] fix(chat): download universale foto con supporto galleria mobile (Web Share API) e download folder desktop.
- [2026-08-20 13:42] fix/finance: parsing PDF estratti Fineco con unpdf (elimina DOMMatrix/pdf-parse su Node/Vercel).
- [2026-08-20 14:20] fix/finance: polyfill DOMMatrix server-side + casting sicuro extractText (join never) per build Vercel.
- [2026-08-20 14:30] feat(chat): collegamento foto chat ad ordini con sync automatica su GdM, scheda defunto e fiorista.
- [2026-08-20 14:35] fix(chat): risoluzione errore salvataggio associazione foto ad ordine con fallback orderCode/id e upsert prova.
- [2026-08-20 14:40] fix(orders): unificazione stato e badge ricorrenze su singola dicitura 'Ricorrenza GdM'.
- [2026-08-20 14:42] fix/finance: parser PDF Fineco multiformato (regex tolleranti, multilinea, textPreview debug).
- [2026-08-20 14:45] feat(users): ricerca globale, filtri per ruolo/stato e ordinamento su URL in pagina Utenti.
- [2026-08-20 15:05] feat/finance: rimossi simulatore/AI engine; flusso Stripe/PayPal + fioristi; spese manuali; matching estratto Fineco.
- [2026-08-20 15:07] feat(defunti): unione profili duplicati e deduplicazione ordini intelligente senza perdita dati.
- [2026-08-20 15:22] fix(db): campi deletedAt/mergedIntoId su DeceasedProfile e Order — sblocca build Vercel merge defunti
- [2026-08-20 16:45] feat(finance): convertitore e parser tabellare automatico PDF estratto conto FinecoBank (coordinate unpdf)
- [2026-08-20 16:48] fix(chat): ricerca universale ordini per codice, defunto, cliente e fiorista nel modale collega foto.
- [2026-08-20 16:51] feat(users): script di pulizia e rimozione utenti anonimi senza nome/cognome e senza ordini.
- [2026-08-20 17:22] feat(users): script di pulizia ed eliminazione utenti con stato orfano.
- [2026-08-20 17:26] perf(core): ottimizzazione serverless cpu e caching rotte per mitigazione consumi vercel.
- [2026-08-20 17:30] feat(auth): protezione anti-bot e registrazione vincolata a ordini pagati.
- [2026-08-20 17:31] fix(finance): calibrazione anomalie Fineco — layout USCITE/ENTRATE, oneri bancari, note a margine silenziose + UI badge
- [2026-08-20 17:59] feat(finance): auto-riconciliazione payout Stripe/PayPal, spese ricorrenti, compensi fioristi + tabella movimenti Contabilità
- [2026-08-20 18:20] feat(finance): upload massivo ZIP/XML/CSV fatture elettroniche SDI/YouDoox + match Fineco
- [2026-08-20 20:22] feat/finance: upload report fatture xlsx/csv (SDI_XLSX), riconciliazione Fineco e alert Fioristi in attesa di Fattura.
- [2026-08-20 20:34] feat/finance: update fatture duplicate/NC su re-import + alert YouDoox giorno 1 nello scadenziario.
- [2026-08-20 20:48] fix(finance): dedupe P.IVA IT su report YouDoox XLSX (falso 24 duplicati) + colonne documento_*/tot_*.
- [2026-08-20 21:37] feat/finance: registro contabile storico permanente Neon (bilancio, IVA, export libro giornale, sync fonti).
- [2026-08-20 21:43] feat/finance: scadenziario solo da 2026-04-01; auto-match potenziato Fineco + modale Abbina guidata + ri-analisi non abbinati.
- [2026-08-20 21:51] fix/finance: scadenziario — esclusione definitiva adempimenti scaduti da >90 giorni; alert urgenti solo su imminenti 0–10gg.
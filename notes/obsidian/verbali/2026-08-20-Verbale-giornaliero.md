---
date: 20-08-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Giornaliero Operativo & Tecnico — FloreMoria S.r.l."
sync_source: docs/verbali/20-08-2026.md
synced_at: 2026-08-21T07:36:49.695Z
---

> Copia sincronizzata automaticamente da `docs/verbali/20-08-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

---
title: "Verbale Giornaliero Operativo & Tecnico — 20 Agosto 2026"
date: 2026-08-20
tags: [floremoria, verbale, BARBARA, Cursor, Antigravity, finance, auth, performance]
author: BARBARA (Staff AI) & Cursor (integrazione chiusura)
---

# Verbale Giornaliero Operativo & Tecnico — FloreMoria S.r.l.

**Data:** 20 Agosto 2026  
**Ambiente:** Next.js (App Router), TypeScript, Prisma ORM, Neon PostgreSQL, Vercel Serverless  
**Agenti coinvolti:** Cursor AI, Antigravity AI, Gemini AI, BARBARA  
**Branch:** `main`  
**Produzione:** progetto Vercel `floremoria-dashboard` (`www.floremoria.com`)

---

## 1. Sintesi esecutiva

Nella sessione sono stati completati interventi strutturali su quattro macro-aree (redazione BARBARA), più consolidamenti operativi Cursor su dashboard/GdM e registro storico fiscale:

1. **Modulo Finanza & Contabilità:** riconciliazione bancaria Fineco PDF, report fatture passive SDI (ZIP/XML/CSV + XLSX), alert fioristi senza fattura, registro storico permanente Neon, pulizia scadenziario S.r.l. (solo da **01/04/2026** e **mai** scadenze scadute da >90 giorni).
2. **Sicurezza accessi & anti-bot:** registrazione vincolata a ordini pagati, honeypot, rate limiting.
3. **Database cleanup & deduplicazione:** soft-delete di account anonimi/orfani privi di ordini (~248), merge profili defunti.
4. **Performance & mitigazione CPU Vercel:** ISR/revalidate, Prisma singleton, polling staff rallentato.

**Nota deploy:** push frequenti della pipeline verbali hanno spesso *cancellato* i build intermedi; production è tornata `READY` su `b3a66aa` (include i fix finance della serata).

---

## 2. Dettaglio interventi tecnici per modulo

### A. Modulo Finance & riconciliazione bancaria (Cursor)

* **Parser tabellare posizionale Fineco (`lib/financial/parseFinecoPdf.ts` + polyfill DOM):**
  - Estrazione posizionale con coordinate X/Y (`unpdf`) oltre al fallback testo multilinea.
  - Mappatura colonne: Data operazione, Data valuta, Descrizione multilinea, Dare/Uscite, Avere/Entrate, Saldo.
  - Esclusione note a margine / footer / informative (es. ~57 note) senza falsi movimenti.
  - Estrazione tipica: **72 movimenti bancari reali**.
* **Motore auto-matching (`lib/financial/reconciliation.ts`):**
  - Match cumulativo payout Stripe/PayPal aggregati.
  - Auto-categorizzazione oneri bancari, canoni, bollo, F24.
  - Tolleranza ±1€ + fuzzy fornitore/P.IVA; fioristi anche senza prefisso `PT-`; giroconti / versamenti soci / finanziamenti.
  - `POST /api/dashboard/finance/bank-statements/[id]/re-reconcile` + UI *Ri-analizza non abbinati*.
  - Modale *Abbina* con top 3 suggerimenti e categorie rapide (Fattura Fornitore, Compenso Fiorista, Scontrino/Ricevuta, Giroconto/Patrimonio, Altro Ricavo) → Libro Mastro.
* **SDI / YouDoox:**
  - Upload massivo ZIP/XML/CSV fatture elettroniche.
  - `POST /api/dashboard/finance/invoices/upload-xlsx` (report ricevute) con dedupe P.IVA+numero+data; fix allineamento prefisso `IT`.
  - Update su re-import / note di credito; tab *Fioristi in attesa di Fattura* (compensi liquidati senza fattura >15gg).
* **Registro storico permanente (`financial_ledger_entries`):** sync fonti → bilancio/IVA/export libro giornale; tab Archivio Storico Fiscale.
* **Scadenziario S.r.l. (`lib/financial/compliance/deadlines.ts`):**
  - Solo adempimenti **≥ 2026-04-01**.
  - Esclusione definitiva scadenze con `daysRemaining < -90`.
  - Banner “urgenti” limitato a imminenti 0–10 giorni (non alle già scadute).

### B. Sicurezza autenticazione & anti-bot (Antigravity)

* `lib/security/antiBot.ts`, `lib/auth/identity.ts`: niente registrazione autonoma generica; solo a fronte di ordine pagato (Stripe/PayPal).
* Honeypot sui form pubblici; rate limit in memoria (~5 tentativi / 10 min per IP).
* Inviti manuali dashboard admin/partner preservati.

### C. Database cleanup & bonifica utenti (Antigravity)

* Script `scripts/cleanup-incomplete-users.ts`, `scripts/cleanup-orphan-users.ts`: soft-delete (`deletedAt`, `isActive=false`) account anonimi/orfani senza ordini (~248).
* `/dashboard/users` esclude di default `deletedAt != null`.
* Merge defunti + soft-delete schema (`deletedAt` / `mergedIntoId`).

### D. Performance Vercel serverless (Antigravity)

* ISR `revalidate` 300/3600 su cataloghi/pagine statiche.
* Singleton Prisma connection pool anche in produzione.
* `StaffAlertPoller`: polling 30s (da 4s) + pausa se `document.hidden`.

### E. Modale foto chat & ricerca ordini (Antigravity / Cursor)

* `LinkPhotoToOrderModal` + `GET /api/dashboard/orders/search`: ricerca normalizzata (codice, defunto, cliente, fiorista, cimitero); limite iniziale ~150; sync foto su GdM / scheda defunto / fiorista.
* Download universale foto (Web Share mobile + folder desktop).

### F. Dashboard operativa aggiuntiva (Cursor — presente nel registro, non nel draft BARBARA)

* Galleria multi-foto defunto, sync GdM, associazione utente nome/cognome.
* VERA: debounce 60s aggregazione inbound WhatsApp (anti-ripetizione).
* Coda Ordini: ordinamento/ricerca per data consegna e multi-token; badge unico *Ricorrenza GdM*.
* Registro Consegne fioristi: voci d’ordine editabili con ricalcolo totali.
* Contabilità UI: Fineco al posto Qonto, SDI `K0ROACV`, scadenziario in fondo; rimozione simulatore/AI engine.

---

## 3. Riepilogo commit & versionamento (selezione)

| SHA | Messaggio |
|-----|-----------|
| `468d76d` | feat(finance): parser tabellare Fineco posizionale |
| `edb30e0` | feat(users): cleanup utenti anonimi incompleti |
| `63ccdeb` | fix(chat): ricerca universale ordini nel modale collega foto |
| `270a118` | feat(users): cleanup utenti orfani |
| `c7f658a` / `d227f87` | perf(core): ottimizzazione CPU serverless / caching |
| `ecbcf11` | feat(auth): anti-bot + registrazione vincolata a ordini pagati |
| `075562f` | feat(finance): auto-riconciliazione payout + tabella movimenti |
| `9d72606` | feat(finance): upload ZIP/XML/CSV SDI/YouDoox |
| `8d1deb9` | feat(finance): upload report XLSX + alert fioristi senza fattura |
| `27e53d6` | fix(finance): dedupe P.IVA IT YouDoox XLSX vs XML |
| `344cf9f` | feat(finance): registro contabile storico permanente Neon |
| `301ded8` | feat(finance): auto-matching potenziato + modale Abbina + scadenziario ≥ 2026-04-01 |
| `fb06e6c` | fix(finance): nasconde adempimenti scaduti da >90 giorni |
| `8bbfe2d` | chore(verbali): sincronizzato verbale integrale 20 agosto 2026 |
| `b3a66aa` | chore(verbali): pipeline BARBARA + DEVIN → Obsidian *(deploy production READY)* |

---

## 4. Stato delle verifiche

- **TypeScript (`npx tsc --noEmit`):** 0 errori (verifiche ripetute sui fix finance).
- **Production build (`npm run build`):** OK (route compilate).
- **Integrità DB:** soft-delete preserva storico; nessun hard-delete massivo su utenti con ordini.
- **Deploy:** dopo cancellazioni a catena da push verbali, production `READY` su `b3a66aa` con alias `www.floremoria.com`.

---

## 5. Registro operativo automatico (.today_log)

Fonte cronologica Cursor (`docs/verbali/.today_log.txt` al momento della chiusura).

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
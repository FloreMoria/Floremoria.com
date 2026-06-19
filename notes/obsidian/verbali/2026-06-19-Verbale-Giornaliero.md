---
date: 2026-06-19
tipo: verbale_sviluppo
tags: [verbale, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sync_source: docs/verbali/19-06-2026.md
synced_at: 2026-06-19T18:50:15.649Z
---

> Copia sincronizzata automaticamente da `docs/verbali/19-06-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale di Sviluppo FloreMoria — 19 Giugno 2026

**Redazione:** BARBARA / VITO / PETRA / DEVIN (Consolidamento Sessione)  
**Stato infrastruttura:** Neon AWS Production · Futuria gate live · Sync verbali automatizzata (Drive + Dashboard)  
**Fonte canonica:** [Google Docs BARBARA](https://docs.google.com/document/d/1pCmUS7L6c4PMDnIRutgd0fcTBq_ryegtfRsxTIHb3_c/edit)

## 1. Infrastruttura — traguardi e configurazioni live

### Automazione sync verbali, chiavi auth e ponte Google Drive

Intervento strutturale completato e deployato in produzione (**commit `e6b0de4`**):

1. **Risoluzione blocco 401 sul middleware:** allineata `ADMIN_API_KEY` su Vercel Production al valore `nu0v08170` (identico a `.env.local` sul Mac). Il middleware consente ora chiamate server-to-server con header `x-admin-key` verso `/api/admin/*` e `/api/logs/sync-verbale` senza cookie Super Admin. Auth centralizzata in `lib/auth/verbaleSyncAuth.ts`.

2. **Ponte automatico bidirezionale Google Drive Desktop:** attivato nel percorso  
   `/Users/floremoria/Google Drive/Il mio Drive/FloreMoria - Verbali`  
   con sottocartelle operative:
   - `Ingresso-Barbara/` — ingresso Google Doc esportati .md (BARBARA / Antigravity)
   - `Obsidian-Mirror/` — mirror pipeline verso vault Obsidian
   - `Docs-Mirror/` — mirror `docs/verbali/DD-MM-YYYY.md`  
   Integrazione: `lib/verbali/googleDriveBridge.ts`, setup `npm run verbali:setup-drive`, lettura in `barbaraSource.ts`, scrittura in `mirrorPaths.ts`.

3. **Test connessione automatica:** `npm run verbali:verify-keys` — esito **positivo totale** su produzione (`https://www.floremoria.com`) per **`x-admin-key`** e **`x-api-key`** dopo redeploy Vercel. Push consolidato verbali: `npm run log:verbale:push-api`.

Documentazione operativa: `docs/VERBALI_SYNC_SETUP.md`.

### Risoluzione definitiva dei doppioni anagrafici (fase storica e futura)

Implementato il modulo centralizzato `lib/deceased/deceasedProfileIdentity.ts`, che effettua un match normalizzato (case-insensitive, rimozione spazi extra) su nome, cognome e comune/cimitero.

Lanciato con successo lo script di migrazione atomica `scripts/unify-deceased-duplicates.ts --all` sul database di produzione Neon: i profili duplicati di **SALVATORE TUSA** ed **ERMELINDA MAMMI'** sono stati accorpati sotto un'unica anagrafica canonica, spostando tutti gli ordini e i link relazionali (`UserDeceasedLink`, `PartnerDeceasedAssignment`) ed eliminando le schede orfane.

Per i nuovi ordini pagati, `resolveDeceasedProfileForOrder` riusa il profilo esistente invece di crearne uno parallelo.

**Commit:** `656c85a`.

### Politica restrittiva dei contatti su Futuria CRM (gate di sicurezza)

Introdotto il file di controllo rigido `lib/futuria/contactGate.ts`. Sbarrato l'accesso a bot o iscrizioni non autorizzate.

La creazione di una scheda contatto cliente su Futuria può avvenire **esclusivamente** dopo un acquisto reale andato a buon fine tramite webhook Stripe (`paid_order`) o per i fioristi B2B certificati (`partner_florist`). I tentativi di accesso tramite OTP o Magic Link senza ordine associato generano un errore controllato invece di creare contatti abusivi.

| Componente | Intervento |
|------------|------------|
| Webhook Stripe | `ensurePaidOrderEntities` + `syncPaidCustomerToFuturia` + tag `floremoria-cliente-pagante` |
| Auth OTP / magic link | solo `updateFuturiaExistingContactIfPresent` |
| Dashboard comms | messaggi solo verso contatti già sincronizzati post-pagamento |
| Webhook Futuria | `FUTURIA_WEBHOOK_SECRET` obbligatorio in produzione |

**Commit:** `fe2f468`.

### Pulizia centralizzata dei log di dashboard (esclusione assistenza)

Risolto il problema del filtro troppo aggressivo in Overview e Log di Sistema. Centralizzata la logica in `lib/floremoriaLogFilters.ts` per nascondere **esclusivamente** i flussi legati a `assistenza@floremoria.com` e al tag `POSTMAN_ASSISTENZA`, ripristinando la visibilità asincrona di tutti i log operativi e transazionali reali degli ordini.

Correzione tecnica aggiuntiva: il filtro `NOT tag contains POSTMAN_ASSISTENZA` escludeva in PostgreSQL anche le righe con `tag IS NULL` (zero record in overview) — risolto con esclusione NULL-safe e cache overview `force-dynamic`.

**Commit:** `36244b9`, `36bfaac`, `9eb02b3`, `0e90cc6`.

### Allineamento file di configurazione ambientale (`.env.local`)

Mappata ed esplicitata la variabile `FUTURIA_TAG_CLIENTE_PAGANTE=floremoria-cliente-pagante` nel file locale del Mac, in allineamento con l'ambiente di produzione Vercel. Aggiunte `FLOREMORIA_WEBHOOK_KEY`, `GOOGLE_DRIVE_VERBALI_DIR` e `VERBALI_SYNC_PRODUCTION_URL` per la pipeline verbali automatizzata.

## 2. Mappa strategica Futuria AI Workflow

Analizzata la documentazione interna dell'azione **Agente AI** nei workflow di Futuria.

**Strategia aziendale determinata:**

- L'azione premium basata su LLM resterà in modalità **OFF** per i flussi transazionali critici (es. invio link mini-app ai fioristi), gestiti in modalità deterministica tramite tag gratuiti per massima sicurezza e velocità.
- Verrà testata in futuro come leva di marketing per il recupero lead e per i flussi empatici di **Nutrimento Parenti / Custodi del Ricordo** nelle ricorrenze annuali.

## 3. Backlog e prossimi passi (riavvio sessione successiva)

- Monitoraggio sul campo dei link reali inviati ai fioristi di **Tortora** (`FT-CS-26-002`) e **Palermo** (`FT-PA-26-004`) per il caricamento delle prove visive e delle coordinate GPS delle tombe.
- Verifica della tenuta del Contact Gate su Futuria per confermare il blocco totale delle iscrizioni estranee.
- Template Meta link consegna fiorista e workflow `floremoria-invia-link-consegna-fiorista` (integrazione avviata 18/06, commit `0025fa8`, `f477244`, `0cdb703`).

## Agenti coinvolti

| Agent | Ruolo |
|-------|-------|
| BARBARA | Redazione verbale, consolidamento sessione CEO |
| VITO | Gate Futuria, segreti env, scope CRM, auth sync verbali |
| PETRA | Flusso ordine → fiorista → consegna e collaudo campo |
| DEVIN | Backend Stripe, deduplica defunti, pipeline verbali + Drive |
| POSTMAN | Template WhatsApp e workflow Futuria |

**Consolidamento 19/06/2026:** verbale definitivo rigenerato e sincronizzato su Dashboard Admin (`floremoria_logs`, log id=53 aggiornato via upsert), Obsidian (`notes/obsidian/verbali/2026-06-19-Verbale-Giornaliero.md`) e mirror Google Drive (`Obsidian-Mirror/` + `Docs-Mirror/`).
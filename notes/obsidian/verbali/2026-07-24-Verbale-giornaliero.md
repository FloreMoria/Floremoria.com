---
date: 24-07-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 24 Luglio 2026"
sync_source: docs/verbali/24-07-2026.md
synced_at: 2026-07-24T17:05:25.319Z
---

> Copia sincronizzata automaticamente da `docs/verbali/24-07-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 24 Luglio 2026

**Redazione:** BARBARA.  
**Giornata di riferimento:** 2026-07-24.

---

## Sezione 1 — Infrastruttura & Integrazioni Esterne
- **Pinterest OAuth & App Setup:** Sistemati Secret e App ID; registrata l'URI di redirect e collegato il flusso di autenticazione OAuth.
- **Pinterest Boards Endpoint:** Configurato l'endpoint boards e associata la variabile `PINTEREST_BOARD_ID` per la categoria *Funerale*.
- **Pinterest Trial vs Standard:** La pubblicazione automatica dei Pin pubblici risulta momentaneamente bloccata dal livello Trial. Inviata la richiesta formale per il livello Standard corredata da video dimostrativo. Finché non verrà approvata la richiesta Standard, i Pin pubblici restano in standby.
- **Bypass Sandbox WhatsApp:** Verificato il comportamento delle notifiche su Vercel e allineate le variabili d'ambiente per consentire i test Sandbox.

---

## Sezione 2 — Strategia & Gestione Partner (B2B)
- **Supporto Tecnico & Diagnostica per Annunci Funebri (AF):**
  - **Diagnostica Ordine Test:** Analizzato l'ordine `PT-MI-26-001` a database, chiarificando il motivo della mancata notifica WhatsApp (ordine in stato `ACCEPTED`, in attesa di assegnazione fiorista; la notifica scatta automaticamente al passaggio in `IN_PROGRESS`).
  - **Mappatura Stati Ordine:** Fornito a Paolo (AF) il prontuario degli stati ufficiali (`PENDING`, `ACCEPTED`, `IN_PROGRESS`, `DELIVERING`, `COMPLETED`, `CANCELLED`) per consentire la corretta gestione e colorazione del loro pannello di backoffice.

---

## Sezione 3 — Sviluppo & Architettura Software
- **Command Center:**
  - **Delete Contenuti:** Implementata la funzionalità di cancellazione contenuti dal pannello.
  - **Auto-copy & Hashtag:** Implementato il sistema di copia automatica di testo e hashtag generati dai media per velocizzare la pubblicazione manuale dei post.
- **Aggiornamento API B2B (Foto di Consegna - PoD):**
  - Arricchiti gli endpoint B2B (`GET /api/v1/partner/orders` e `GET /api/v1/partner/orders/[agencyId]`).
  - Ciascun ordine restituito ora include in tempo reale i campi: `deliveryPhotoUrl` (immagine principale), `deliveryPhotos` (lista completa immagini) e `deliveryProofStatus` (stato prova di consegna, es. `COMPLETED`).
- **Piattaforma Verbali & Normalizzazione Naming (Format ISO `YYYY-MM-DD`):**
  - Aggiornato l'helper `lib/verbali/paths.ts` per fare in modo che tutti i verbali futuri vengano generati nativamente nel formato ISO `YYYY-MM-DD-Verbale-giornaliero.md`.

---

## Sezione 4 — Gestione Documentale & Vault
- **Consolidamento e Pulizia Verbali Storici:**
  - Scansionati, unificati e normalizzati **54 verbali storici** sparsi nel vault e nel repository.
  - Rimossi i file orfani presenti nella radice del vault Obsidian (`Second Brain`), riposizionandoli nella cartella corretta.
  - Normalizzati nel frontmatter YAML e migrati nella cartella verbali tutti i log di sviluppo storici in `20_ARCHIVIO_LOG` (`Diario_Lavoro`, `Addestramento_AI_Futuria`, ecc.).
- **Ordinamento Cronologico Nativo:** Convertiti tutti i nomi file dei verbali al formato ISO `YYYY-MM-DD-Titolo-Dettagliato.md` ed eliminati i vecchi prefissi sequenziali (`01 `, `02 `).
- **Verifica e Push:** Tutti i test di tipo (`npx tsc --noEmit`) superati con successo e codice caricato su GitHub (`main`).
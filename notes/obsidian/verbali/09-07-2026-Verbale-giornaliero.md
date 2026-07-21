---
date: 2026-07-09
tipo: verbale_sviluppo
tags: [verbale, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sync_source: docs/verbali/09-07-2026.md
synced_at: 2026-07-21T07:26:04.641Z
---

> Copia sincronizzata automaticamente da `docs/verbali/09-07-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale giornaliero — 09/07/2026

**Riassunto (BARBARA):** Chiusura sessione operativa dashboard staff, automazione consegne e UX fioristi/GdM. Da domani pivot prioritario sul marketing.

STATO: Piattaforma staff stabilizzata su deploy, PWA, VERA e gestione rete fioristi.
DISPOSIZIONI: Da **10/07/2026** si avvia il lavoro strutturato sul **marketing** (acquisizione, contenuti, campagne). Il codice dashboard resta in manutenzione evolutiva.

## Dettagli operativi

- **Prompt Chiave:** Chiusura sessione DEVIN 09/07 — dashboard, VERA, consegne, fioristi
- **Punti Discussi:** UX profili a pagina intera; notifiche staff; cortesia VERA su WhatsApp; deploy affidabile
- **Allarmi Critici:** Nessuno bloccante a fine giornata
- **Task in Sospeso:** Avvio piano marketing (MARK / AXEL / ZIGGY) dal 10/07
- **Risultati Raggiunti:** Vedi sezione tecnica sotto

---

## Sviluppo tecnico (repo DEVIN)

### 1. VERA AI — conversazione WhatsApp
- Eliminati risposte robotiche su saluti isolati (`ciao`, `buongiorno`, `grazie`)
- Saluto simmetrico + richiesta intento prima di azioni automatiche
- Commit: `43fb5ad`

### 2. PWA staff — notifiche e messaggistica
- Suoni/avvisi default ON per messaggi, ordini e foto fioristi
- Web Push su dashboard Communications
- Lightbox foto chat con chiusura e swipe indietro su PWA
- Menu hamburger mobile e layout chat responsive
- Commit principali: `1c0900c`, `4a8dee3`, `0761bb4`, `de71705`, `ce50bec`

### 3. Automazione consegna — foto fiorista → cliente
- Dopo upload foto WhatsApp del fiorista: ingest automatico, salvataggio proof, notifica cliente con magic link e template `customer_delivery_photo`
- Commit: `8ae16b7`

### 4. Deploy Vercel — stabilità
- Rimosso `prisma migrate deploy` dal build Vercel (lock P1002 su deploy paralleli)
- Migrazioni DB delegate a GitHub Actions (`db-migrate-deploy.yml`)
- Commit: `431151e`

### 5. Dashboard Utenti (Giardino della Memoria)
- Click su riga/nome → profilo a **pagina intera** (overlay full-screen, non drawer)
- Commit: `b211228`

### 6. Dashboard Fioristi — dossier e anagrafica
- Click su fiorista → pagina dossier dedicata `/dashboard/fioristi/[id]`
- Layout sotto la navbar principale (logo + menu sempre visibili)
- Header con nome, codice, comune, provincia; pulsanti **Elenco fioristi · Modifica · Scarica Scheda**
- Modifica anagrafica funzionante via API `PUT /api/dashboard/partners/[id]`
- Tabella elenco ripristinata con nome nella stessa riga
- Commit: `8961b8b`, `3bb049b`, `07d697f`

### 7. Verbali e knowledge base
- Pipeline BARBARA + DEVIN → Obsidian + dashboard logs operativa
- Mirror su Google Drive dove disponibile

---

## Nota di passaggio consegne (CEO)

Oggi si chiude un ciclo di **hardening operativo** (staff dashboard, WhatsApp, consegne, fioristi, deploy).

**Da domani (10/07):** focus su **marketing sul serio** — acquisizione, messaggi, asset creativi e canali paid/organic secondo piano MARK.
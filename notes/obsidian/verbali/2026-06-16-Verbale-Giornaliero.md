---
date: 2026-06-16
tipo: verbale_sviluppo
tags: [verbale, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sync_source: docs/verbali/16-06-2026.md
synced_at: 2026-06-18T13:49:54.762Z
---

> Copia sincronizzata automaticamente da `docs/verbali/16-06-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale di Sviluppo FloreMoria — Stato e Roadmap (16 Giugno 2026)

## 1. Traguardi raggiunti e deploy live

- **Risoluzione bug iOS (Safari / immagini pesanti):** compressione client-side automatica (max 1600px) prima del caricamento. Niente più crash del server dovuto ai file HEIC dell'iPhone.
- **Ottimizzazione GPS:** la richiesta di geolocalizzazione avviene una sola volta all'apertura e viene mantenuta in `sessionStorage`. Eliminato il doppio pop-up.
- **Sincronizzazione database Neon AWS:** migrate con successo le nuove tabelle pivot per la gestione molti-a-molti (M2M) trilaterale: `UserDeceasedLink` e `PartnerDeceasedAssignment`.
- **Infrastruttura storage Vercel Blob pubblica:** creato un bucket pubblico nativo agganciato al progetto principale per rendere le foto immediatamente visibili tramite Magic Link.
- **Denominazione elegante dei file:** le foto si auto-nominano come `[nome-cognome-defunto]-[data-consegna]-[stringa-casuale].webp`, ripulite da spazi e accenti.
- **Bypass di test e codici parlanti:** predisposto l'accesso alla Mini-App fioristi tramite codice d'ordine reale (es. `PT-UD-26-002`) e attivato il bypass di sicurezza per i test.

**Commit di riferimento (main):** `aeeb045` → `070be69` (PoD, bacheca admin, prove visive custodite).

---

## 2. Raffinamenti e bug-fix immediati (stato al 16/06)

| Voce | Stato | Note |
|------|-------|------|
| Mappa admin raddoppiata | ✅ Completato | `CustodiedProofGallery` — `h-80` + bbox ampliato per ADMIN |
| Download diretto foto admin | ✅ Completato | `forceDownload()` nativo, nome file elegante |
| Unificazione flusso fiorista → scheda ordine | ✅ Completato | `getOrderProofPhotos()` + sezione **Prove Visive Custodite** |
| Pulsanti admin Scarica / Sostituisci / Cancella | ✅ Completato | API `POST /api/dashboard/delivery-proof/photo` |
| Rotazione forzata 90° (Paolo Cantoni) | ✅ Completato | Sharp server-side + rewrite su Vercel Blob |
| Strip EXIF orientamento su nuovi upload | ✅ Completato | `lib/deliveryProof/imagePipeline.ts` |

---

## 3. Nuovo sviluppo: pagina «Defunti» nella dashboard (priorità mattina)

Crea una nuova pagina **Defunti** all'interno della dashboard di amministrazione che implementi questa struttura:

### Vista tabellare leader

Tabella pulita ed enterprise che mostri a prima vista:

- Nome e cognome del defunto
- Data di nascita
- Data di morte
- Comune
- Cimitero
- Posizione esatta della tomba (campo/loculo)

### Finestra modale espansa al clic

Cliccando su una riga della tabella, deve aprirsi una finestra modale di grandi dimensioni (ampia ed elegante come «Il Giardino dell'utente») contenente:

- Informazioni storiche e cronologiche di ogni singolo ordine associato a quel defunto
- Indicazioni di consegna
- Utenti (parenti) collegati
- Fiorista incaricato in esclusiva per quella zona

**Stato:** ✅ Implementato — `/dashboard/defunti` (tabella leader, righe orfane, modale, cambio fiorista unico).

---

## Agenti coinvolti

| Agent | Ruolo nel task |
|-------|----------------|
| DEVIN | Architettura pagina Defunti, query Prisma, API |
| PETRA | Flusso operativo ordini ↔ defunto ↔ fiorista |
| NINA | UX tabella + modale enterprise |
| VITO | RBAC dashboard, object-level su modale |
| SOFIA + ALMA | Tono modale commemorativo (no leva emotiva) |

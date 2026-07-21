---
date: 2026-06-22
tipo: verbale_sviluppo
tags: [verbale, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sync_source: docs/verbali/22-06-2026.md
synced_at: 2026-07-21T07:26:04.646Z
---

> Copia sincronizzata automaticamente da `docs/verbali/22-06-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# 📌 Verbale Stato Avanzamento Lavori: Integrazione WhatsApp (Evolution API)

**Data:** 22 Giugno 2026  
**Stato:** Infrastruttura Pronta / Interfaccia in Cache (Sospeso per allineamento)  
**Riferimento Progetto:** FloreMoria (Integrazione VERA su iPhone 12 Proprietario)

---

## 🟩 1. ATTIVITÀ COMPLETATE E FUNZIONANTI (100%)

* **Database Neon (Produzione):** Applicata con successo dal Mac la migrazione `20260622150000_phone_blacklist`. La tabella `PhoneBlacklist` è attiva e pronta in produzione.
* **Sincronizzazione Git & Codice:** Eseguito il pull con rebase per integrare i commit remoti (Devin) e completato il `git push origin main` del commit `ab24fa5`. Tutto il codice delle rotte WhatsApp (`/admin-panel/whatsapp-setup` e `/api/whatsapp/*`) è ufficialmente su GitHub ed è stato compilato da Vercel.
* **VPS (Evolution API):** Il server su `94.177.198.140:8080` è sano e configurato.
* **Creazione Istanza:** L'istanza `floremoria-iphone12` è stata creata con successo lato server con integrazione `WHATSAPP-BAILEYS` (Stato attuale: *Connecting* / In attesa di handshake).

---

## 🟨 2. PROBLEMA CORRENTE (Blocco Generazione QR Code)

* **Sintomo:** Nonostante il codice sia su Vercel e le variabili d'ambiente siano state inserite, la pagina `/admin-panel/whatsapp-setup` restituisce ancora lo stato `not_configured` o l'Evolution Manager non mostra visivamente i quadratini del QR (restituendo `count: 0`).
* **Causa probabile:** Un disallineamento di cache a runtime tra le sessioni serverless di Vercel (che faticano a leggere le nuove Env senza un ciclo pulito) e il modulo Baileys sulla VPS che ha esaurito i tentativi iniziali di generazione del token visivo.

---

## 🚀 3. ROADMAP DI RIAPERTURA (Azioni per lo Staff / Devin domani mattina)

1. **Reset Istanza VPS:** Svuotare la cache dei token rimasti appesi sulla VPS riavviando lo stack Docker di Evolution API per forzare un nuovo ciclo di rigenerazione dei QR (`docker compose down && docker compose up -d`).
2. **Verifica Env Vercel:** Accedere al pannello web di Vercel (Progetto `floremoria`), verificare che le 4 variabili inserite manualmente non siano marcate come "Sensitive" (altrimenti il codice serverless non le legge) e lanciare un Redeploy pulito svuotando la cache di build ("Clear Build Cache").
3. **Accoppiamento iPhone 12:** Effettuare il login come Superadmin, navigare su `/admin-panel/whatsapp-setup` e inquadrare il QR.
4. **Attivazione Intelligenza Artificiale:** Ricordarsi di sostituire il placeholder della `GEMINI_API_KEY` su Vercel Production per dare la parola a VERA una volta associato il telefono.

## Dettagli operativi

- **Prompt Chiave:** DEVIN/Cursor — Verbale chiusura sessione WhatsApp Evolution API (22/06/2026)
- **Punti Discusi:** Deploy VPS Evolution; env Vercel; istanza floremoria-iphone12; QR count:0; rotte WhatsApp su main.
- **Allarmi Critici:** QR non generato; `not_configured` su pannello admin produzione.
- **Task in Sospeso:** Reset Docker VPS; env Vercel con `--value`; CONFIG_SESSION_PHONE_VERSION o upgrade v2.3.7; GEMINI_API_KEY produzione.
- **Risultati Raggiunti:** Neon phone_blacklist; VPS healthy; istanza Baileys creata; codice WhatsApp su GitHub/Vercel.
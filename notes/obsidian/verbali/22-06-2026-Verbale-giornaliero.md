---
date: 22-06-2026
tipo: verbale_giornaliero
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea, sync_pipeline]
sommario: "📌 Verbale Stato Avanzamento Lavori: Integrazione WhatsApp (Evolution API)"
sync_sources: ["consolidate-backfill"]
synced_at: 2026-07-24T08:24:52.390Z
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica — fonti: consolidate-backfill.

# 📌 Verbale Stato Avanzamento Lavori: Integrazione WhatsApp (Evolution API)

**Data:** 22 Giugno 2026  
**Stato:** Infrastruttura Pronta / Interfaccia in Cache (Sospeso per allineamento)  
**Riferimento Progetto:** FloreMoria (Integrazione VERA su iPhone 12 Proprietario)


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

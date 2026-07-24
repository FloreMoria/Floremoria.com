---
date: 12-06-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Stato Setup WhatsApp & Twilio (12 Giugno 2026)"
sync_source: docs/verbali/12-06-2026.md
synced_at: 2026-07-24T08:42:56.604Z
---

> Copia sincronizzata automaticamente da `docs/verbali/12-06-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Stato Setup WhatsApp & Twilio (12 Giugno 2026)
**Argomento:** Configurazione WhatsApp Business Platform tramite Twilio  
**Stato Attuale:** 🔴 Bloccato (In attesa di onboarding grafico per autorizzazione partner)

## 2. Dettaglio del Problema
Abbiamo tentato la registrazione forzata del mittente WhatsApp tramite le API di Twilio utilizzando lo script scratch `twilio-create-sender.js`. La chiamata API ha restituito il seguente errore:

```json
{
  "code": 63101,
  "message": "waba_id provided is not valid or unable to be used",
  "status": 400
}
```

### Causa Radice
La rimozione di tutti i partner dal WABA ha revocato i permessi di gestione a Twilio. Anche se il WABA e il numero sono corretti, Twilio non ha l'autorizzazione di partner per quel WABA ID. Di conseguenza, le chiamate API dirette falliscono finché non viene stabilita la relazione di fiducia.

---

## 3. Prossimi Passaggi Richiesti (Onboarding Grafico)
Per ripristinare la partnership, è necessario eseguire una volta sola il flusso guidato nella console di Twilio:

1. Accedere a **Twilio Console** > **Messaging** > **Senders** > **WhatsApp Senders**.
2. Cliccare su **Register a WhatsApp Sender**.
3. Accedere a Facebook tramite il popup e selezionare il Portfolio Business reale di Salvatore Marsiglione.
4. Associare il WABA corretto `I Fiori della Memoria FloreMoria` (ID: `2421986764948620`) e il numero `+39 320 410 5305`.
5. Una volta completato il popup, la partnership si attiverà e potremo agganciare il Webhook tramite lo script `twilio-set-webhook.js`.
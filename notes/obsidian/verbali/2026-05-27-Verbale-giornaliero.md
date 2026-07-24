---
date: 27-05-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale operativo del 27-05-2026"
sync_source: docs/verbali/27-05-2026.md
synced_at: 2026-07-24T10:07:24.527Z
---

> Copia sincronizzata automaticamente da `docs/verbali/27-05-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

VERBALE 3: 27 MAGGIO 2026
Data ISO: 2026-05-27

Categoria: WEBHOOK

Oggetto/Topic: Risoluzione Blocchi Webhook Twilio-Vercel e Hardening Rotte API

Breve Riassunto (Short Summary): Sbloccato il payload POST su Vercel correggendo l'instradamento della rotta e gestendo il bypass condizionale sulla firma di sicurezza.

1) PREMESSA
Il collaudo della chat dell'Agent VERA su WhatsApp Sandbox si era bloccato in produzione, restituendo errori 405 (Method Not Allowed) e 500 (Internal Server Error) nei log di Vercel.

2) ANALISI
L'ispezione tecnica ha rivelato due criticità bloccanti nel flusso dei dati:
- Twilio indirizzava i payload POST sulla rotta root (/), che rifiutava il metodo. Il traffico andava dirottato correttamente sull'endpoint dedicato `/api/webhooks/whatsapp`.
- Il server andava in crash (Errore 500) per via dell'assenza della variabile `TWILIO_AUTH_TOKEN` nell'ambiente di staging/produzione, che faceva fallire la funzione di validazione della firma.

3) CONCLUSIONE E DECISIONE
La rotta POST è stata correttamente configurata e puntata. È stato introdotto un hardening del codice con un bypass di sicurezza controllato (`TWILIO_VALIDATE_SIGNATURE=false`) per isolare i test. Il sistema ha risposto con successo intercettando il payload reale con la stringa "Ciaocomoradio". Si è deciso di congelare temporaneamente la demo live al pubblico per calibrare i prompt e prevenire loop di messaggi.
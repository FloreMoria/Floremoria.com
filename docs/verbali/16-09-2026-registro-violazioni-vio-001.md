# Verbale — Registro violazioni dati · VIO-2026-001 · fioristi@

**Data:** 16 settembre 2026  
**METODO:** v1.23 §14  
**Registro:** `docs/REGISTRO_VIOLAZIONI_DATI.md`

## Eseguito

1. Creato il registro organizzativo versionato `docs/REGISTRO_VIOLAZIONI_DATI.md`.
2. Registrata **VIO-2026-001** (FF-PN-26-005 → Fioreria Battistella; nome/email/tel cliente +
   prezzo vendita €129,99). Interessati: campo **aperto** in attesa audit storico.
3. Termine valutazione notifica Garante / interessati: **2026-09-19** (72h dalla scoperta).
4. METODO 1.23: rimando al registro + regola «voce prima del fix».
5. Verifica prioritaria `fioristi@floremoria.com` (vedi sotto).

## fioristi@ — risposta secca

**Non è una lista verso fioristi partner.** È una **casella Aruba interna** monoutente
(display name «Fioristi-FloreMoria»), usata dallo scout zone scoperte
(`staffFloristsEmail` → `florist_partner_search`).

Le email ops con dettaglio ordine completo (`buildOrderStaffHtml`) vanno a
`ordini@floremoria.com` (`staffOrdersEmail`), non a `fioristi@`.

**Componenti dell’indirizzo (destinatari effettivi):**

1. `fioristi@floremoria.com` — unico

Non espande a email di fioristi esterni. Fonti: `Delivered-To: fioristi@floremoria.com` in
Apple Mail (account dedicato), Resend TO unico su PT-VE-26-002 scout, codice
`lib/mail/staffMailRecipients.ts` + `lib/ai/floristScoutOrder.ts`.  
Login Aruba pannello non eseguito (auth interattiva); conclusione basata su casella/Mail/Resend/codice.

Quindi l’audit PT-VE-26-002 che elenca `fioristi@` insieme alle uscite **non** implica che
il dettaglio ops sia arrivato a tutti i fioristi.

## Hash

Da compilare dopo push.

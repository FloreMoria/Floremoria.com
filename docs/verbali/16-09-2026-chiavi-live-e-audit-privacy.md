# Verbale — Chiavi live AF/IOF · audit privacy contenuto · VIO-2026-001

**Data:** 16 settembre 2026  
**METODO:** 1.23 · Registro: `docs/REGISTRO_VIOLAZIONI_DATI.md`

## Chiavi API live

- Rimosso il gate Stripe Connect da emissione/rigenerazione credenziali (API ≠ denaro;
  AF è piattaforma, FloreMoria connected — il controllo cercava una condizione impossibile).
- Generate LIVE su Neon produzione:
  - Annunci Funebri → public id in chat response
  - IOF San Marco → public id in chat response
- Segreti: **non** in verbale/chat/log. One-shot file locale `~/.floremoria/live-secrets-one-shot-*.txt`
  e/o **Rigenera** dal Florem B2B Hub (mostra il nuovo segreto una sola volta).
- Probe produzione: `fmp_test_…` valida → **403**
  `TEST_CREDENTIAL_NOT_ALLOWED_IN_PRODUCTION` (non 200).

## Privacy — audit contenuto 2026

Destinatario esterno + body con segnali Cliente/email/tel/Totale/staff reuse:

| Data | Destinatario | Ordine | Stato |
|---|---|---|---|
| 2026-09-16 | info@fioreriabattistella.it | FF-PN-26-005 | delivered |

**1** consegna esterna.  
Anomalia 28/08 suppressed → `salvatoremarsigliore@gmail.com`: Partner «Fioreria Salvatore Test»
ha quella email in anagrafica (meccanismo ripetibile se Partner.email = email cliente).

## fioristi@

Casella Aruba **interna** monoutente. Componenti: solo `fioristi@floremoria.com`.
Non lista fioristi partner. Ops dettaglio → `ordini@`.

## FloristOrderBrief + kill switch

Esempio verificato (solo campi operativi + compenso FloreMoria).  
Kill switch: attivo solo se `FLOREM_FLORIST_EMAIL_KILL_SWITCH=1` (email fiorista riaccese).

## Registro

VIO-2026-001 aggiornata: interessati=1; notifica Garante/interessati **No** motivata;
termine riesame **19/09/2026**.

## Hash

Da compilare dopo push.

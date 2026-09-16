# Verbale — Partner B2B tre categorie · FF-VE-26-001 · fee C14

**Data:** 16 settembre 2026  
**Ambito:** Annunci Funebri / IOF San Marco / Florem B2B Hub  
**METODO:** v1.21

## Audit uscite di `PT-VE-26-002` (prima della rinumerazione)

| Canale | Trovato | Dettaglio |
|--------|---------|-----------|
| WhatsApp fiorista | Sì | Template `floremoria_nuovo_ordine_fiorista` + freetext bonifico a LA ROSA ROSSA (+393288193546) |
| Email cliente | Sì | Resend → `info@isolinea.it` «Conferma ordine PT-VE-26-002» (delivered) |
| Email AF | Sì | `assistenza@annuncifunebri.it` trasparenza B2B |
| Email ops | Sì | `ordini@floremoria.com` (marcata B2B TEST all’ingresso) + `fioristi@floremoria.com` scout |
| API partner | Sì | `orderNumber` / `code` nella risposta create (persistito in DB) |
| Stripe metadata | Non verificabile da qui | PI `pi_3UGDblDRGteEHz9n2KNvWNXU` assente su Stripe EU live; chiave COM locale scaduta |
| PDF / CustomerOrderReceipt | No | Nessuna ricevuta archiviata |
| Ledger / bank | No | Nessuna riga |

Natura ordine: prodotto categoria **Funerale** → rinumerato **`FF-VE-26-001`**.  
`legacyOrderNumber = PT-VE-26-002` (ricerca legacy OK). Prossimo funerale VE = **FF-VE-26-002**.

## Eseguito

1. Rinumerazione + cancellazione `PT-VE-26-001` (fee stornata).
2. Anagrafica: AF master 10%; IOF → master; CasPer ripulito (**0 ordini** attribuiti via `fmp_test_…`); duplicato AF florist soft-deleted.
3. Schema: `masterPartnerId`, `apiCredentialId`, `legacyOrderNumber`, fee IVA split, `PartnerFeeMonthClose`, credential `environment`.
4. Stop scrittura `referralPartnerId`; C14; gate Connect su chiavi live.
5. Hub UI a tre categorie.
6. METODO v1.21; tsc OK; build OK.

## Stripe Connect — blocco chiavi live

Su account Stripe EU: **0 connected accounts**. `stripeConnectAccountId` AF non valorizzato.  
**Chiavi live non emesse** (gate Hub + API). Quando Connect sarà collegato e `charges_enabled` + `payouts_enabled`, generare da Hub (segreto one-shot, mai in verbale/chat/log).

Policy split fallito a runtime: ordine resta; debito fee PENDING; no secondo costo; alert `PARTNER_CONNECT_SPLIT_FAILED`.

## Fee FF-VE-26-001

Lordo ordine €89,99 → fee €9,00 · imponibile €7,38 · IVA €1,62.  
`PartnerFeeMonthClose` 2026-09: maturato 900¢ · stato **NON_VERIFICABILE** (fattura assente).

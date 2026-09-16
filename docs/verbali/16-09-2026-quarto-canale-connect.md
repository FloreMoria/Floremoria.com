# Verbale — Quarto canale Stripe Connect partner

**Data:** 16 settembre 2026  
**METODO:** v1.24 §8.2.0  
**Guida:** `docs/finance/Guida_Contabilita_Dashboard_FloreMoria.csv`

## Cosa

Aggiunto il **quarto canale di incasso** «Stripe Connect – partner» (account connesso
FloreMoria in piattaforma Annunci Funebri), accanto a Stripe COM, Stripe EU, PayPal.

## Tre gambe + trasferimento (es. FF-VE-26-001)

| Voce | Importo | Natura |
|---|---|---|
| Corrispettivo | €89,99 | Ricavo (lordo cliente) |
| Fee AF | €9,00 (imp. 7,38 + IVA 1,62) | Costo COMMISSIONI_PARTNER |
| Fee Stripe | €3,58 | Costo ONERI_BANCARI |
| Netto Fineco atteso | €77,41 | TRASFERIMENTO_INTERNO OPEN |

Seed su Neon: 4 scritture ledger inserite; riga `ConnectPartnerCharge` + C14 connectCents.

## UI / API

- Tab Gateway → pannello inserimento manuale (campi = futura sync API)
- Filtro Connect in tabella sync
- Fatture fee master (C14) nel pannello Fisco
- Tax register: margine = lordo − fee Stripe − fee partner − fiorista
- Conti: `10500` transito Connect, `70300` commissioni partner

## Guida Contabilità

Aggiornata a C1–C14, conto di transito, quarto canale, Florem B2B Hub, definizione
«modulo finito» (flusso mensile + controlli + dossier T1–T3).

## Aperti (fuori scope oggi)

- Sblocco T2/T3 sopra 30%
- Diagnosi sync YouDOX
- Lettura API account connesso (oggi solo manuale)

## Hash

Da compilare dopo push.

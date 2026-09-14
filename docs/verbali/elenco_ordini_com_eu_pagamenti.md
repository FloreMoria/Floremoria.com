# Elenco ordini — floremoria.com vs floremoria.eu + pagamenti

**Generato:** 2026-09-11T18:48:58.448Z  
**Fonte:** Neon `Order` + `StripeFinanceMovement` (prefissi `stripe_tx_` = COM, `stripe_eu_tx_` = EU) + lista titolare incassi .eu.

## Come si distingue il sito

| Sito | Significato | Evidenza usata |
|------|-------------|----------------|
| **COM** | Checkout / Stripe **floremoria.com** | Movimento `stripe_tx_*` collegato, oppure `stripeTransactionId` presente senza match EU |
| **EU** | Checkout / Stripe **floremoria.eu** (PSA San Marco) | Movimento `stripe_eu_tx_*`, match importo+data vs charge EU, o lista titolare .eu (nome+importo+data) |
| **UNKNOWN** | Non determinabile | Tipico: UNPAID, test mock, o PAID legacy senza id Stripe e senza match lista |

## Come si distingue il pagamento

Da `paymentMethodLabel` (+ `stripeTransactionId`):

| Gateway riportato | Origine tipica |
|-------------------|----------------|
| Stripe · Carta | `Carta (Stripe)` |
| Stripe · PayPal (wallet) | `PayPal (Stripe)` — PayPal **tramite** Stripe Elements su .com |
| PayPal | PayPal nativo (raro se label senza Stripe) |
| Stripe (metodo non etichettato) | Solo id `txn_`/`pi_` |
| Non registrato su Order | Label e id entrambi vuoti (molti ordini .eu legacy) |
| Test mock | `TEST_MOCK_PAID` |

## Riepilogo

| Metrica | N |
|---------|---|
| Ordini totali (non cancellati) | **82** |
| `partnerPaymentStatus = PAID` | 73 |
| Test | 0 |
| Sito **COM** (.com) | **10** |
| Sito **EU** (.eu) | **43** |
| Sito **UNKNOWN** | **29** |
| Charge/payment Stripe COM in DB | 51 |
| Charge/payment Stripe EU in DB | 73 |
| Charge EU senza ordine abbinato (lista sotto) | 43 |

### Stato pagamento partner

- **PAID**: 73
- **UNPAID**: 9

### Gateway

- **Non registrato su Order**: 38
- **Stripe · stripe_eu**: 21
- **PayPal**: 13
- **Stripe · Carta**: 5
- **Stripe · PayPal (wallet)**: 4
- **Stripe (metodo non etichettato)**: 1

### Matrice sito × pagamento

| Sito | Gateway | N |
|------|---------|---|
| EU | Stripe · stripe_eu | 21 |
| EU | PayPal | 13 |
| EU | Non registrato su Order | 9 |
| UNKNOWN | Non registrato su Order | 29 |
| COM | Stripe · Carta | 5 |
| COM | Stripe · PayPal (wallet) | 4 |
| COM | Stripe (metodo non etichettato) | 1 |

## Elenco per sito

### A — floremoria.com (COM) (10)

| # | Ordine | Data | Pag. | Gateway | Lordo | Acquirente | Città |
|---|--------|------|------|---------|-------|------------|-------|
| 1 | `FT-RC-26-003` | 2026-08-19 | PAID | Stripe (metodo non etichettato) | 47,46 € | Andrea Gaeta | Reggio Calabria (RC) RC |
| 2 | `FT-LC-26-001` | 2026-08-24 | PAID | Stripe · PayPal (wallet) | 53,97 € | Annamaria Ferri | Robbiate (LC) LC |
| 3 | `FF-VI-26-003` | 2026-08-26 | PAID | Stripe · PayPal (wallet) | 52,98 € | Silvia Tregnaghi | Non specificato VI |
| 4 | `FT-TO-26-001` | 2026-08-28 | UNPAID | Stripe · Carta | 29,99 € | Erika  Vanotti | Torino TO |
| 5 | `FT-TO-26-002` | 2026-08-28 | UNPAID | Stripe · Carta | 29,99 € | Erika Vanotti | Torino TO |
| 6 | `FF-SO-26-001` | 2026-08-31 | PAID | Stripe · Carta | 84,98 € | Stella Scibilia | Chempo Di Civo Sondrio SO |
| 7 | `FT-CS-26-007` | 2026-09-01 | PAID | Stripe · PayPal (wallet) | 31,48 € | LUCIANO MAMMI' | Tortora (cs) CS |
| 8 | `FT-PA-26-009` | 2026-09-01 | PAID | Stripe · PayPal (wallet) | 31,48 € | LUCIANO MAMMI' | Palermo (PA) PA |
| 9 | `FF-MC-26-001` | 2026-09-05 | UNPAID | Stripe · Carta | 104,98 € | Oscar Delgadillo | San Severino Marche (MC) MC |
| 10 | `FF-MC-26-002` | 2026-09-05 | UNPAID | Stripe · Carta | 204,98 € | Oscar Delgadillo | San Severino Marche (MC) MC |


### B — floremoria.eu (EU) (43)

| # | Ordine | Data | Pag. | Gateway | Lordo | Acquirente | Città |
|---|--------|------|------|---------|-------|------------|-------|
| 1 | `cmtvn3at0000` | 2026-01-16 | PAID | PayPal | 39,99 € | Giulia Grappone | Italia XX |
| 2 | `cmtvn3b68000` | 2026-01-20 | PAID | Stripe · stripe_eu | 39,99 € | — | Italia XX |
| 3 | `cmtvn3bjf000` | 2026-01-21 | PAID | PayPal | 29,99 € | Luciano Mammì | Italia XX |
| 4 | `cmtvn3c2r000` | 2026-01-22 | PAID | PayPal | 29,99 € | Luciano Mammì | Italia XX |
| 5 | `cmtvn3bpt000` | 2026-01-22 | PAID | Stripe · stripe_eu | 40,97 € | Rosetta Paladino | Italia XX |
| 6 | `cmtvn3cbg000` | 2026-02-10 | PAID | PayPal | 39,99 € | Ester Irace | Italia XX |
| 7 | `cmtvn3chu000` | 2026-02-16 | PAID | PayPal | 29,99 € | Luciano Mammi | Italia XX |
| 8 | `cmtvn3cpz000` | 2026-02-19 | PAID | Stripe · stripe_eu | 39,99 € | Luigina Dereani | Italia XX |
| 9 | `cmtvn3d03000` | 2026-02-22 | PAID | PayPal | 29,99 € | Luciano Mammi | Italia XX |
| 10 | `cmtvn3d8y000` | 2026-02-25 | PAID | Stripe · stripe_eu | 29,99 € | Moreno Venturino | Italia XX |
| 11 | `cmtvn3dmv000` | 2026-02-26 | PAID | Stripe · stripe_eu | 39,99 € | Norm Marchi | Italia XX |
| 12 | `cmtvn3dyt000` | 2026-03-01 | PAID | Stripe · stripe_eu | 144,98 € | Mimma Congedo | Italia XX |
| 13 | `cmtvn3e97001` | 2026-03-13 | PAID | PayPal | 49,99 € | Maria Puliafico | Italia XX |
| 14 | `cmtvn3ei3001` | 2026-03-14 | PAID | Stripe · stripe_eu | 69,98 € | Rosetta Paladino | Italia XX |
| 15 | `cmtvn3euj001` | 2026-03-14 | PAID | PayPal | 72,48 € | Chiara Durì | Italia XX |
| 16 | `cmtvn3f1k001` | 2026-03-18 | PAID | Stripe · stripe_eu | 39,99 € | L'Alternativa Srl | Italia XX |
| 17 | `cmtvn3fdh001` | 2026-03-19 | PAID | Stripe · stripe_eu | 34,99 € | Silvia Tregnaghi | Italia XX |
| 18 | `cmtvn3fp5001` | 2026-03-22 | PAID | PayPal | 29,99 € | Luciano Mammi | Italia XX |
| 19 | `cmtvn3fyh001` | 2026-03-24 | PAID | PayPal | 29,99 € | Luciano Mammi | Italia XX |
| 20 | `cmtvn3g59001` | 2026-03-29 | PAID | Stripe · stripe_eu | 29,99 € | Agostino Buttignol | Italia XX |
| 21 | `cmtvn3ghh001` | 2026-03-31 | PAID | Stripe · stripe_eu | 144,98 € | Francesco Redivo | Italia XX |
| 22 | `cmtvn3gt0001` | 2026-04-01 | PAID | Stripe · stripe_eu | 29,99 € | Cristiano Mariani | Italia XX |
| 23 | `cmtvn3h36002` | 2026-04-16 | PAID | Stripe · stripe_eu | 29,99 € | Rosaria Di Pasquale | Italia XX |
| 24 | `cmtvn3hf8002` | 2026-04-20 | PAID | Stripe · stripe_eu | 39,99 € | Elena Lombardi | Italia XX |
| 25 | `cmtvn3hrv002` | 2026-04-20 | PAID | PayPal | 59,98 € | Luciano Mammi | Italia XX |
| 26 | `cmtvn3i0h002` | 2026-04-27 | PAID | Stripe · stripe_eu | 39,99 € | Famiglia Deotti-Buzzi | Italia XX |
| 27 | `cmtvn3i9w002` | 2026-04-28 | PAID | Stripe · stripe_eu | 54,98 € | Silvia Tregnaghi | Italia XX |
| 28 | `cmtvn3ilg002` | 2026-04-29 | PAID | Stripe · stripe_eu | 45,97 € | Rosetta Paladino | Italia XX |
| 29 | `cmtvn3iwt002` | 2026-05-03 | PAID | PayPal | 53,48 € | Maria Antonia Pozzi | Italia XX |
| 30 | `FT-MC-26-007` | 2026-05-03 | PAID | Stripe · stripe_eu | 284,90 € | Isabella Cesaroni | Civitanova Alta (MC) MC |
| 31 | `cmtvn3j39002` | 2026-05-16 | PAID | PayPal | 49,99 € | Maria Puliafico | Italia XX |
| 32 | `cmtvn3jbi002` | 2026-05-25 | PAID | Stripe · stripe_eu | 84,98 € | Petra Manakova | Italia XX |
| 33 | `cmtvn3joi002` | 2026-06-05 | PAID | Stripe · stripe_eu | 89,99 € | Cyrille Magali Maman-Sernaglia | Italia XX |
| 34 | `cmtvn3kg1003` | 2026-06-16 | PAID | Stripe · stripe_eu | 49,46 € | Rosetta Paladino | Italia XX |
| 35 | `FF-PD-26-002` | 2026-07-02 | PAID | Non registrato su Order | 104,98 € | Francesco Nicolato | Pordenone (PN) PD |
| 36 | `FF-PD-26-003` | 2026-07-03 | PAID | Non registrato su Order | 69,99 € | Confartigianato Pordenone | Pordenone (PN) PD |
| 37 | `FF-PD-26-004` | 2026-07-10 | PAID | Non registrato su Order | 39,99 € | Giulio Rosace | Pordenone (PN) PD |
| 38 | `FT-PD-26-001` | 2026-07-16 | PAID | Non registrato su Order | 37,99 € | Filomena Maiorano | Pordenone (PN) PD |
| 39 | `FT-RC-26-002` | 2026-08-01 | PAID | Non registrato su Order | 29,99 € | Valentina Cecchini | Siderno Superiore (RC) RC |
| 40 | `FF-PN-26-001` | 2026-08-07 | PAID | Non registrato su Order | 39,99 € | Daniela Barilari | Pordenone (PN) PN |
| 41 | `FF-PN-26-002` | 2026-08-10 | PAID | Non registrato su Order | 69,99 € | Edy, Lori and Dana Moras | Cordenons (PN) PN |
| 42 | `FF-PN-26-003` | 2026-08-17 | PAID | Non registrato su Order | 39,99 € | Amanda Favot | Pordenone (PN) PN |
| 43 | `FF-PN-26-004` | 2026-08-21 | PAID | Non registrato su Order | 89,99 € | Oreste Poverello | Pordenone (PN) PN |


### C — Sito non determinato (UNKNOWN) (29)

| # | Ordine | Data | Pag. | Gateway | Lordo | Acquirente | Città |
|---|--------|------|------|---------|-------|------------|-------|
| 1 | `FT-SA-26-001` | 2026-05-19 | PAID | Non registrato su Order | 29,99 € | Ester Irace | Praiano (SA) SA |
| 2 | `FT-SA-26-002` | 2026-05-19 | PAID | Non registrato su Order | 34,99 € | Ester Irace | Praiano (SA) SA |
| 3 | `FT-PA-26-002` | 2026-05-20 | UNPAID | Non registrato su Order | 31,48 € | Luciano Mammì | Palermo (PA) PA |
| 4 | `FT-PA-26-003` | 2026-05-20 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Palermo (PA) PA |
| 5 | `FT-CS-26-001` | 2026-05-20 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Tortora (CS) CS |
| 6 | `FT-CO-26-004` | 2026-05-23 | PAID | Non registrato su Order | 32,48 € | DANIELA RAMPOLDI | Dongo (CO) CO |
| 7 | `FF-RM-26-001` | 2026-05-30 | PAID | Non registrato su Order | 54,98 € | Claudia  Burtone | Non specificato RM |
| 8 | `FT-RC-26-001` | 2026-06-13 | PAID | Non registrato su Order | 43,97 € | Andrea Gaeta | Reggio Calabria (RC) RC |
| 9 | `FT-CS-26-002` | 2026-06-17 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Tortora (CS) CS |
| 10 | `FT-PA-26-004` | 2026-06-17 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Palermo (PA) PA |
| 11 | `FF-VR-26-001` | 2026-06-22 | PAID | Non registrato su Order | 64,98 € | Riccardo Segantini | Legnago (VR) VR |
| 12 | `FT-MC-26-003` | 2026-07-02 | PAID | Non registrato su Order | 0,00 € | Isabella Cesaroni | Civitanova Alta (MC) MC |
| 13 | `FT-MC-26-004` | 2026-07-02 | PAID | Non registrato su Order | 0,00 € | Isabella Cesaroni | Civitanova Alta (MC) MC |
| 14 | `FF-PA-26-001` | 2026-07-04 | PAID | Non registrato su Order | 144,98 € | Luciano Mammì | Palermo (PA) PA |
| 15 | `FT-PA-26-005` | 2026-07-04 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Palermo (PA) PA |
| 16 | `FT-CS-26-003` | 2026-07-04 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Tortora (CS) CS |
| 17 | `FT-MC-26-005` | 2026-07-06 | PAID | Non registrato su Order | 0,00 € | Isabella Cesaroni | Civitanova Alta (MC) MC |
| 18 | `FT-ME-26-001` | 2026-07-15 | PAID | Non registrato su Order | 49,99 € | Maria  Puliafico | Mazzarrà Sant'Andrea (ME) ME |
| 19 | `FT-MB-26-001` | 2026-07-20 | PAID | Non registrato su Order | 37,99 € | Carolina Negrini Bertelli | Desio (MB) MB |
| 20 | `FF-CO-26-001` | 2026-07-21 | PAID | Non registrato su Order | 44,98 € | Salvatore Marsiglione | Olgiate Comasco (CO) CO |
| 21 | `FT-PA-26-007` | 2026-07-30 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Palermo (PA) PA |
| 22 | `FT-CS-26-004` | 2026-07-30 | UNPAID | Non registrato su Order | 31,48 € | Luciano Mammì | Tortora (CS) CS |
| 23 | `FT-MC-26-006` | 2026-08-03 | UNPAID | Non registrato su Order | 0,00 € | Isabella Cesaroni | Civitanova Alta (MC) MC |
| 24 | `FT-ME-26-002` | 2026-08-04 | PAID | Non registrato su Order | 47,46 € | Rosetta  Paladino | Raccuja (ME) ME |
| 25 | `FT-RM-26-002` | 2026-08-13 | UNPAID | Non registrato su Order | 52,48 € | Angelica Blancussi | Roma (RM) RM |
| 26 | `FT-CS-26-005` | 2026-08-17 | UNPAID | Non registrato su Order | 31,48 € | Luciano Mammì | Tortora (CS) CS |
| 27 | `FT-CS-26-006` | 2026-08-17 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Tortora (CS) CS |
| 28 | `FT-PA-26-008` | 2026-08-17 | PAID | Non registrato su Order | 31,48 € | Luciano Mammì | Palermo (PA) PA |
| 29 | `FT-MB-26-002` | 2026-09-09 | PAID | Non registrato su Order | 55,99 € | Carolina Negrini Bertelli | Desio MB |


## Dettaglio evidenza (tutti)

| Ordine | Sito | Gateway | Evidenza sito |
|--------|------|---------|---------------|
| `cmtvn3at0000` | EU | PayPal | lista titolare .eu «Giulia Grappone» 2026-01-16 (score 1.00) |
| `cmtvn3b68000` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3Src7YRrkwwcYwep0cGIOVep) |
| `cmtvn3bjf000` | EU | PayPal | lista titolare .eu «Luciano Mammì» 2026-01-21 (score 1.00) |
| `cmtvn3c2r000` | EU | PayPal | lista titolare .eu «Luciano Mammì» 2026-01-22 (score 1.00) |
| `cmtvn3bpt000` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3SsPVeRrkwwcYwep17HxuA4b) |
| `cmtvn3cbg000` | EU | PayPal | lista titolare .eu «Ester Irace» 2026-02-10 (score 1.00) |
| `cmtvn3chu000` | EU | PayPal | lista titolare .eu «LUCIANO MAMMI'» 2026-02-16 (score 1.00) |
| `cmtvn3cpz000` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3T2SsURrkwwcYwep0EeZT0fV) |
| `cmtvn3d03000` | EU | PayPal | lista titolare .eu «LUCIANO MAMMI'» 2026-02-22 (score 1.00) |
| `cmtvn3d8y000` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3T4dUERrkwwcYwep1ZQ0gk4b) |
| `cmtvn3dmv000` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3T4uOsRrkwwcYwep1ZLIMDXn) |
| `cmtvn3dyt000` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3T6AndRrkwwcYwep0FD8FIxe) |
| `cmtvn3e97001` | EU | PayPal | lista titolare .eu «Maria Puliafico» 2026-03-13 (score 1.00) |
| `cmtvn3ei3001` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TArJQRrkwwcYwep1rCXtycD) |
| `cmtvn3euj001` | EU | PayPal | lista titolare .eu «Chiara Durì» 2026-03-14 (score 1.00) |
| `cmtvn3f1k001` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TCJsERrkwwcYwep0KrHg1yR) |
| `cmtvn3fdh001` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TCgrURrkwwcYwep0YXvm8J7) |
| `cmtvn3fp5001` | EU | PayPal | lista titolare .eu «LUCIANO MAMMI'» 2026-03-22 (score 1.00) |
| `cmtvn3fyh001` | EU | PayPal | lista titolare .eu «LUCIANO MAMMI'» 2026-03-24 (score 1.00) |
| `cmtvn3g59001` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TG8URRrkwwcYwep1eqtkuES) |
| `cmtvn3ghh001` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TH2KrRrkwwcYwep1XdNSY1q) |
| `cmtvn3gt0001` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3THRDzRrkwwcYwep1IWuTvYj) |
| `cmtvn3h36002` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TMlfaRrkwwcYwep1OK1tykj) |
| `cmtvn3hf8002` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TOEwqRrkwwcYwep0PWa3mde) |
| `cmtvn3hrv002` | EU | PayPal | lista titolare .eu «LUCIANO MAMMI'» 2026-04-20 (score 1.00) |
| `cmtvn3i0h002` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TQnuORrkwwcYwep1Dfft678) |
| `cmtvn3i9w002` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TR8vSRrkwwcYwep0aagA2z5) |
| `cmtvn3ilg002` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TRYzSRrkwwcYwep0XTghGkM) |
| `cmtvn3iwt002` | EU | PayPal | lista titolare .eu «Maria ANTONIA Pozzi» 2026-05-03 (score 1.00) |
| `FT-MC-26-007` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TSzMsRrkwwcYwep11EAvI3P) |
| `cmtvn3j39002` | EU | PayPal | lista titolare .eu «Maria Puliafico» 2026-05-16 (score 1.00) |
| `FT-SA-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-SA-26-002` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-PA-26-002` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-PA-26-003` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-CS-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-CO-26-004` | UNKNOWN | Non registrato su Order | nessun indizio |
| `cmtvn3jbi002` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TaxywRrkwwcYwep0nknWw0e) |
| `FF-RM-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `cmtvn3joi002` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3Tf2qURrkwwcYwep1JTdxIH6) |
| `FT-RC-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `cmtvn3kg1003` | EU | Stripe · stripe_eu | StripeFinanceMovement.orderId (stripe_eu_tx_txn_3TitsVRrkwwcYwep03OyeUT2) |
| `FT-CS-26-002` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-PA-26-004` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FF-VR-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-MC-26-003` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-MC-26-004` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FF-PD-26-002` | EU | Non registrato su Order | match charge EU €104.98 ±0g (score 0.55) |
| `FF-PD-26-003` | EU | Non registrato su Order | match charge EU €69.99 ±0g (score 0.55) |
| `FF-PA-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-PA-26-005` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-CS-26-003` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-MC-26-005` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FF-PD-26-004` | EU | Non registrato su Order | match charge EU €39.99 ±1g (score 0.55) |
| `FT-ME-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-PD-26-001` | EU | Non registrato su Order | match charge EU €37.99 ±0g (score 0.55) |
| `FT-MB-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FF-CO-26-001` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-PA-26-007` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-CS-26-004` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-RC-26-002` | EU | Non registrato su Order | match charge EU €29.99 ±0g (score 0.55) |
| `FT-MC-26-006` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-ME-26-002` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FF-PN-26-001` | EU | Non registrato su Order | match charge EU €39.99 ±1g (score 0.55) |
| `FF-PN-26-002` | EU | Non registrato su Order | match charge EU €69.99 ±0g (score 0.55) |
| `FT-RM-26-002` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-CS-26-005` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-CS-26-006` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FT-PA-26-008` | UNKNOWN | Non registrato su Order | nessun indizio |
| `FF-PN-26-003` | EU | Non registrato su Order | match charge EU €39.99 ±0g (score 0.55) |
| `FT-RC-26-003` | COM | Stripe (metodo non etichettato) | StripeFinanceMovement.orderId (stripe_tx_txn_3U64Fm4W4pZWhSUs0zv3AM23) |
| `FF-PN-26-004` | EU | Non registrato su Order | match charge EU €89.99 ±0g (score 0.55) |
| `FT-LC-26-001` | COM | Stripe · PayPal (wallet) | StripeFinanceMovement.orderId (stripe_tx_txn_3U7xmV4W4pZWhSUs1FFamXIo) |
| `FF-VI-26-003` | COM | Stripe · PayPal (wallet) | StripeFinanceMovement.orderId (stripe_tx_txn_3U8bE54W4pZWhSUs0ueA2Maq) |
| `FT-TO-26-001` | COM | Stripe · Carta | StripeFinanceMovement.orderId (stripe_tx_txn_3U9K9m4W4pZWhSUs1N4SXPkI) |
| `FT-TO-26-002` | COM | Stripe · Carta | StripeFinanceMovement.orderId (stripe_tx_txn_3U9KCm4W4pZWhSUs0wI7vlzm) |
| `FF-SO-26-001` | COM | Stripe · Carta | StripeFinanceMovement.orderId (stripe_tx_txn_3UAa8I4W4pZWhSUs1ui4IlqC) |
| `FT-CS-26-007` | COM | Stripe · PayPal (wallet) | StripeFinanceMovement.orderId (stripe_tx_txn_3UAtNU4W4pZWhSUs0DFIwZXL) |
| `FT-PA-26-009` | COM | Stripe · PayPal (wallet) | StripeFinanceMovement.orderId (stripe_tx_txn_3UAtR64W4pZWhSUs1J3PImQy) |
| `FF-MC-26-001` | COM | Stripe · Carta | StripeFinanceMovement.orderId (stripe_tx_txn_3UCKIc4W4pZWhSUs1A6Thkoj) |
| `FF-MC-26-002` | COM | Stripe · Carta | StripeFinanceMovement.orderId (stripe_tx_txn_3UCNGm4W4pZWhSUs0AnTRWbQ) |
| `FT-MB-26-002` | UNKNOWN | Non registrato su Order | nessun indizio |

## Charge Stripe EU senza ordine Order abbinato

Queste sono incassi sull’account **EU** presenti in `stripe_finance_movements` che non risultano collegati a un `Order` (o non matchati in questo export). Utile per capire gap .eu → Neon.

| Data | Importo | Tipo | stripeId | Descrizione |
|------|---------|------|----------|-------------|
| 2026-05-03 | 0,00 € | payment | `txn_3TT0p4RrkwwcYwep1MNarUZe` | — |
| 2026-05-16 | 0,00 € | payment | `txn_3TXhANRrkwwcYwep0VwwAbM9` | — |
| 2026-03-13 | 0,00 € | payment | `txn_3TAS5xRrkwwcYwep1o0nXdYh` | — |
| 2026-03-24 | 0,00 € | payment | `txn_3TEUw1RrkwwcYwep1mMbYaAJ` | — |
| 2026-03-22 | 0,00 € | payment | `txn_3TDuT4RrkwwcYwep1zesBHYX` | — |
| 2026-03-14 | 0,00 € | payment | `txn_3TAsK2RrkwwcYwep0wsuaT3w` | — |
| 2026-01-21 | 0,00 € | payment | `txn_3Ss2yLRrkwwcYwep1uaA2uZf` | — |
| 2026-02-10 | 0,00 € | payment | `txn_3SzBTjRrkwwcYwep1ORvGjOp` | — |
| 2026-02-22 | 0,00 € | payment | `txn_3T3c2GRrkwwcYwep17za1uD8` | — |
| 2026-02-16 | 0,00 € | payment | `txn_3T1TnTRrkwwcYwep0qUftFfE` | — |
| 2026-01-16 | 0,00 € | payment | `txn_3SqBl3RrkwwcYwep0dcGRaZF` | — |
| 2025-12-20 | 15,00 € | payment | `txn_3SgPBBRrkwwcYwep1lC0B7b0` | — |
| 2025-12-19 | 0,00 € | payment | `txn_3Sg2shRrkwwcYwep0cLVIvAT` | — |
| 2025-12-05 | 29,99 € | charge | `txn_3Sb3hIRrkwwcYwep1ZfyAFen` | — |
| 2025-11-28 | 0,00 € | payment | `txn_3SYStDRrkwwcYwep1p7VeaAz` | — |
| 2025-11-26 | 0,00 € | payment | `txn_3SXje8RrkwwcYwep1ruPO6dP` | — |
| 2025-11-18 | 109,07 € | charge | `txn_3SUqFXRrkwwcYwep0Oq8Q4Qa` | — |
| 2025-11-10 | 84,98 € | charge | `txn_3SRzX8RrkwwcYwep0r6vaFQa` | — |
| 2025-11-07 | 0,00 € | payment | `txn_3SQlHARrkwwcYwep01ZmATTZ` | — |
| 2025-11-03 | 179,94 € | charge | `txn_3SPI3iRrkwwcYwep05xigl5S` | — |
| 2025-10-30 | 33,99 € | charge | `txn_3SNtOhRrkwwcYwep1vXeANpY` | — |
| 2025-10-28 | 34,99 € | charge | `txn_3SNDRORrkwwcYwep1TuSnu3b` | — |
| 2025-10-27 | 0,00 € | payment | `txn_3SMvcdRrkwwcYwep1QbNIIzP` | — |
| 2025-10-27 | 34,99 € | charge | `txn_3SMtJQRrkwwcYwep0jzRHjWb` | — |
| 2025-10-27 | 29,99 € | charge | `txn_3SMs6LRrkwwcYwep0ogPri6F` | — |
| 2025-10-24 | 144,98 € | charge | `txn_3SLrFxRrkwwcYwep1i6LJ6Jv` | — |
| 2025-10-23 | 39,99 € | charge | `txn_3SLO05RrkwwcYwep0XjcN3lu` | — |
| 2025-10-18 | 0,00 € | payment | `txn_3SJW4WRrkwwcYwep0tyNG4lb` | — |
| 2025-10-06 | 104,98 € | charge | `txn_3SFCelRrkwwcYwep0GK1VOIJ` | — |
| 2025-09-23 | 89,99 € | charge | `txn_3SAXmKRrkwwcYwep0VNB2gWn` | — |
| 2025-09-03 | 102,48 € | payment | `txn_3S3MLLRrkwwcYwep0vcCPhq3` | — |
| 2025-08-27 | 431,87 € | payment | `txn_3S0pGyRrkwwcYwep1uQGhLls` | — |
| 2025-08-24 | 39,99 € | charge | `txn_3RzjYIRrkwwcYwep1PAMWQyR` | — |
| 2025-08-13 | 199,99 € | charge | `txn_3Rvf0VRrkwwcYwep0NtxUfUo` | — |
| 2025-08-03 | 32,48 € | charge | `txn_3RrxUjRrkwwcYwep0RbN6k7u` | — |
| 2025-07-23 | 0,00 € | payment | `txn_3RnzCxRrkwwcYwep1sZVzu6X` | — |
| 2025-07-23 | 0,00 € | payment | `txn_3Rnx6dRrkwwcYwep0xf7e8bI` | — |
| 2025-08-07 | 29,99 € | charge | `txn_3RtUfIRrkwwcYwep196LBZ7K` | — |
| 2025-12-19 | 0,00 € | payment | `txn_3Sg38VRrkwwcYwep1bts0FyH` | — |
| 2025-10-30 | 33,48 € | charge | `txn_3SNwO0RrkwwcYwep0CbucAuW` | — |
| 2025-10-23 | 0,00 € | payment | `txn_3SLK9vRrkwwcYwep0IwIsHD8` | — |
| 2026-04-20 | 0,00 € | payment | `txn_3TOFWURrkwwcYwep1T5ie17D` | — |
| 2026-01-22 | 0,00 € | payment | `txn_3SsQrBRrkwwcYwep01FEJRKF` | — |


## Allegati

- CSV completo: [`elenco_ordini_com_eu_pagamenti.csv`](./elenco_ordini_com_eu_pagamenti.csv)
- JSON: [`elenco_ordini_com_eu_pagamenti.json`](./elenco_ordini_com_eu_pagamenti.json)
- Rigenera: `npx tsx scripts/export-orders-com-eu.ts`

## Limiti noti

1. `Order` non ha campo `site`/`domain`: la classificazione è **derivata**.
2. Molti ordini .eu storici sono PAID ma senza `paymentMethodLabel` / `stripeTransactionId` → gateway «Non registrato»; il sito EU si ricava da lista titolare o charge.
3. «PayPal (Stripe)» è pagamento **su Stripe COM** con wallet PayPal, non PayPal standalone.

# Riconciliazione sola lettura — incassi ↔ ordini (2026 T1–T3)

**Generato:** 2026-09-09T17:27:20.773Z
**Scritture DB:** nessuna

Gerarchia: (1) già collegato · (2) `Order.stripeTransactionId` ↔ id gateway · (3) email · (4) nome + data ±3 giorni · importo solo conferma.

| Periodo | Incassi | Già collegati | Match tx id | Match email | Match nome+data | Scoperti | Lordo scoperto | Mancante build |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| T1 2026 | 25 | 0 | 0 (imp.OK 0) | 0 (imp.OK 0) | 0 (imp.OK 0) | 25 | € 1057.39 | 38.0% |
| T2 2026 | 57 | 0 | 0 (imp.OK 0) | 0 (imp.OK 0) | 0 (imp.OK 0) | 57 | € 1801.88 | 56.7% |
| T3 2026 | 55 | 10 | 0 (imp.OK 0) | 0 (imp.OK 0) | 0 (imp.OK 0) | 45 | € 1708.73 | 49.8% |

## Note

- «Già collegati» = `orderId` sul movimento gateway **oppure** riga corrispettivi con `orderId` (anche PRESUNTA).
- «Match tx id» = `Order.stripeTransactionId` uguale a `txn_` / `pi_` / `ch_` / source del movimento (senza scrivere).
- Email/nome sui movimenti Stripe in DB sono quasi assenti (`metadataJson` sync senza receipt email): match email/nome sottostimano finché non si arricchisce il sync.
- Blocco export MANCANTE >30% resta attivo.

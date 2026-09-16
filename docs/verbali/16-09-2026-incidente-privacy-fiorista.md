# Verbale — Incidente privacy fiorista FF-PN-26-005

**Data:** 16 settembre 2026  
**Priorità:** assoluta  
**METODO:** v1.22 §14

## Ricostruzione

Import manuale dashboard (`IMPORT_MANUALE: dashboard admin`) per **FF-PN-26-005**
(Fioreria Battistella). `POST /api/dashboard/orders` chiama
`sendPartnerOrderNotifications(order.id, { emailsOnly: true })`.

Nel dispatcher, il canale `email_florist` inviava **`buildOrderStaffHtml`** — il modello
interno «ordine pagato» destinato a ops/contabilità — con
`stripeSessionId: 'Nuovo ordine assegnato'`. Da qui l’etichetta «ID Sessione Stripe» con
quel testo spurio, più Cliente / Email / Telefono / Totale Ordine (€129,99).

**Ipotesi confermata dal codice** (`lib/orders/partnerOrderNotifications.ts`, blocco 4b
pre-fix): riuso del modello staff verso il fiorista.

## Ampiezza 2026 (Resend, path `Nuovo ordine FloreMoria … consegna da effettuare` → email fiorista)

| Data (UTC) | Destinatario | Ordine | Evento | Leak body |
|---|---|---|---|---|
| 2026-08-28 15:26 | salvatoremarsigliore@gmail.com | FF-CO-26-003 | **suppressed** | sì (Cliente, Telefono, Totale, ID Sessione Stripe / Nuovo ordine assegnato) |
| 2026-09-16 15:11 | info@fioreriabattistella.it | FF-PN-26-005 | **delivered** | sì (Cliente, Email natalefed@…, Telefono, €129, Totale, ID Sessione) |

**2 email** sullo stesso path nel 2026; **1 sola consegnata** (Battistella). Non è una
prassi massiva di migliaia di invii, ma è un bug di codice strutturale: ogni assegnazione
con email fiorista poteva ripeterlo.

## Blocco immediato

- Kill switch **`FLOREM_FLORIST_EMAIL_KILL_SWITCH`** attivo di default (`!== '0'`).
- Canale `email_florist` in `sendPartnerOrderNotifications` **non invia** (skip
  `privacy_kill_switch_florist_email_2026_09_16`).
- Per riattivare dopo verifica: env `FLOREM_FLORIST_EMAIL_KILL_SWITCH=0` (usa solo
  `FloristOrderBrief`).

## Correzione

- Nuovo tipo **`FloristOrderBrief`**: solo cimitero, defunto, biglietto, consegna, prodotto,
  budget fiorista, riferimento ordine. Niente buyer/email/tel/`totalPriceCents`.
- Render email da brief; assert runtime + **`npm run test:florist-privacy`** in `prebuild`
  (rompe la build se lo staff HTML passa come contenuto fiorista).

## Altri canali

| Canale | Esito |
|---|---|
| WhatsApp Punto A | OK — `floremoria_nuovo_ordine_fiorista` usa compenso fiorista, non prezzo vendita / contatti cliente |
| Mini-app `/fiorista/consegna` | OK — select senza buyerEmail/customerPhone/totalPriceCents |
| PDF fiorista | Nessun PDF outbound fiorista trovato su questo path |

## Verifica

- `npx tsc --noEmit` — OK
- `npm run test:florist-privacy` — OK
- `npm run build` (prebuild include privacy test) — OK

## Hash

`419270a9d4391550dea25c7bf1a832fa23a734c0` (main, push 16/09/2026)

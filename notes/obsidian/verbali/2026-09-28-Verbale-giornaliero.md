---
date: 28-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 28 Settembre 2026"
sync_source: docs/verbali/28-09-2026.md
synced_at: 2026-09-28T21:26:47.958Z
---

> Copia sincronizzata automaticamente da `docs/verbali/28-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 28 Settembre 2026

**Redazione:** BARBARA / DEVIN / PETRA / ALBERTO (consolidato da `.today_log.txt` + Git + riepilogo titolare + digest mail Second Brain / Antigravity).  
**Giornata di riferimento:** 2026-09-28.  
**Deployment Production a fine giornata:** `dpl_98pymzKeZhdULohyXo2u4zvVo5wV` (`2c07a524`) su `www.floremoria.com`.  
**Database:** Neon main `ep-wild-field-al7mvn8a` (nessuna scrittura su branch senza etichetta esplicita).  
**Rollback pronto:** `dpl_3vfhqvVA2zttVMxLFNmpxLRF5JLJ` (`237b3822`).

---

## Sintesi esecutiva (approvata dal titolare)

Giornata di chiusura del percorso **Rete fioristi / QR Partner (Fasi 1–2 + Operazione 3)** e di riconciliazione **T1 2026** con il commercialista. In produzione: schema rete, attribuzione fee QR Art. 2.3, smoke test reale FT-CO-26-009 (poi rimborsato e marcato test), viste admin Origine QR / Rete & QR / badge lista ordini. Kill-switch notifiche fiorista rimossi e verificati assenti. Nuove regole operative su DB e audit.

---

## Sezione 1 — Infrastruttura / dati

- Migrazione `florist_partner_leader_network` applicata prima su Neon **dev-florist-network**, poi su **produzione main** dopo backup `backup-pre-florist-network-20260929`. Conteggio invariato: **32 fioristi**, **103 ordini**.
- Anagrafica Partner estesa: slug, ruolo (Leader/Partner/Esecutore), stato, Leader di riferimento, date contratto, zona affidata.
- Tabella `FloristScanEvent`: IP mai in chiaro (hash), scansioni immutabili come prova fee.
- Campi ordine: referral QR, fee, esecutore/coordinatore, fee coordinamento 10%, SLA accettazione, `cancellationCause`, penale; importi in centesimi.
- **AdminFieldChangeLog** (chi / quando / prima / dopo): introdotto; usato anche per audit tardivi Battistella e marca-test FT-CO-26-009.
- Config tariffe: fee QR **500 ¢**, coordinamento **10%**.
- **Incidente pomeriggio:** seed Battistella (slug/ruolo/stato/zona) scritto sul DB di sviluppo scambiato per produzione → QR in prod non avrebbe funzionato. Corretto su **neon_main** + audit tardivi. **Regola:** ogni report nomina il DB; nessuna write su main senza riga di registro.
- Env Production: `WHATSAPP_SKIP_FLORIST_NOTIFY` e `FLOREM_FLORIST_EMAIL_KILL_SWITCH` **assenti**; notifiche fiorista/cliente ripristinate (nessun ordine reale nel frattempo oltre lo smoke).

### Deploy chiave della giornata

| Ora (approx) | Deploy | Commit | Note |
|---|---|---|---|
| ~22:02 | `dpl_B7sN2m6` Production | `642e42ac` | Merge QR attribution Art. 2.3 |
| ~22:03 | (DB write) | — | Battistella slug+LEADER+ACTIVE su neon_main |
| ~23:04 | `dpl_3vfhqvVA` Production | `237b3822` | Operazione 3 viste admin |
| ~23:22 | `dpl_98pymzKe` Production | `2c07a524` | Icona QR + filtro lista ordini (**attivo**) |

---

## Sezione 2 — Strategia / legale / fiscale

### Conti T1 2026 (verificati)

- Registro IVA commercialista = dashboard FloreMoria al centesimo: **21 vendite**, **€ 1.038,23** incassati (**€ 943,80** imponibile + **€ 94,43** IVA 10%).
- Gateway: Stripe **€ 655,84** + PayPal **€ 382,39** = corrispettivi; nessun pagamento mancante/surplus.
- Conferma commercialista: IVA **10%** su tutto (prevalenza acquisto fiori).
- **Aperto:** ~€ 40 PayPal non spiegati dalle sole commissioni → verificare saldo PayPal al **31/03**.

### Contratto Battistella

- Documento online allineato al PDF definitivo inviato a Carlo.
- Art. 2.3: fee € 5 solo su carrello concluso nella sessione nata dalla scansione QR.

### Digest mail (Second Brain / Antigravity, 28/09 — run 23:00)

Automazione giornaliera Second Brain: **21 mail** esportate (6 escluse); generazione verbale automatica fallita (`agent login` / `CURSOR_API_KEY`). Contenuti rilevanti raccolti:

- **Battistella (Carlo):** conferma incontro in negozio **sabato 3 ottobre**, pomeriggio **15:30–19:30** (vetrofania QR + firma accordo Leader FVG). Thread «Incontro di persona consegna adesivo e contratto».
- **Diego Capellini (DC Studio):** conferma copertura annualità **2026 € 2.750 + IVA** fino all’approvazione bilancio 2026 / dichiarazioni; segnalazione bando Regione Lombardia startup innovative (scadenza candidature 25/11/2026).
- **Smoke FT-CO-26-009:** Stripe pagamento € 29,99 + rimborso stesso giorno; conferma ordine cliente; mail operative contabile/ordini; Scout AI fioristi Como (partner non auto-assegnato — coerente con percorso QR/test).
- **Galleria MAG (personale):** avviso bonario INPS contributi fissi 2025 rate 2–3, totale **€ 1.564,84**, pagamento entro **01/10/2026** (F24 allegato da segreteria DC).

---

## Sezione 3 — Sviluppo

### Fase 1 — Database (produzione)

Vedi Sezione 1. Pipeline: branch → test → backup Neon → produzione.

### Fase 2 — QR e attribuzione (produzione)

- Route pubblica `/fioristi/[slug]` → scan event + cookie `floremoria_partner_ref` dominio `.floremoria.com` → home.
- Attribuzione fee solo a conferma Stripe (webhook async + idempotenza); una scansione ≤ una fee; anteprime/bot escluse; `isTest` → no fee; manuali / API B2B / import esclusi (contratto).
- Commit principali: `523d4fea`, `4b2c9ad9`, `9a382779`, merge `642e42ac`.

### Smoke test reale

- **FT-CO-26-009:** PAID dopo scan QR Battistella → `referralFeeCents = 500`.
- Post-test: rimborso Stripe; ordine `isTest=true`, `cancellationCause=FLOREMORIA`, soft-delete + audit su neon_main → escluso da corrispettivi e totali fee.
- Kill-switch fiorista usati solo durante lo smoke, poi rimossi.

### Operazione 3 — Vista admin (produzione)

- Drawer ordine: riquadro **Origine QR** (sempre se `referralFloristId`, anche test/annullati) con stato fee granulare.
- Scheda fiorista **Rete & QR:** ruolo, zona, link + download PNG/SVG, KPI mese corrente/precedente; esclusi **tracciabili** ma fuori totali Art. 3.3; Art. 7.2 zero PII acquirente.
- Lista `/dashboard/orders`: icona QR + tooltip «QR {fiorista} – {stato fee}» + filtro «Solo ordini da QR».
- Commit: `af57fdc7`, `7a4eb72f`, merge `237b3822`, `2c07a524`.

### Log operativo Cursor (estratto `.today_log.txt`)

- 16:18–16:31 — check T1 commercialista vs Excel / gateway.
- 17:42–17:58 — schema + migrate dev poi produzione + Battistella LEADER.
- 18:15–20:52 — Operazione 2 QR, pre-merge checks, gate isTest, preview Stripe.
- 22:02–22:37 — release prod, fix Battistella main, smoke FT-CO-26-009, marca test + audit.
- 22:45–23:22 — Op3 admin views, preview, merge, badge lista, release `dpl_98pymzKe`.

### Commit Git rilevanti (Europe/Rome, 28/09)

- `523d4fea` feat(florist-network): QR vetrina /fioristi/[slug] e attribuzione fee Art. 2.3  
- `4b2c9ad9` fix(florist-network): cookie .floremoria.com, webhook async e idempotenza fee  
- `0898b78e` docs(legal): cookie tecnico `floremoria_partner_ref` in Cookie Policy  
- `9a382779` fix(florist-network): skip fee QR su isTest + backlog Stripe preview  
- `7615760e` feat(dashboard): marca ordine isTest+FLOREMORIA con audit log  
- `642e42ac` merge: feat/florist-qr-attribution  
- `af57fdc7` / `7a4eb72f` / `237b3822` Operazione 3 admin QR  
- `2c07a524` feat(dashboard): icona QR e filtro «Solo ordini da QR»

---

## Sezione 4 — Logistica / partnership

- Appuntamento **Battistella — sabato 3 ottobre 2026**, pomeriggio (15:30–19:30): consegna adesivo/vetrofania QR + firma contratto Leader FVG (mail Carlo 28/09).
- Smoke QR ha validato il percorso end-to-end su produzione; ordine di prova non deve restare nei prospetti (già escluso).

---

## Da fare

### Domattina

- Stampare adesivo dal SVG scaricato dalla scheda Battistella (Rete & QR).
- Prova adesivo stampato col telefono: la scansione deve comparire in «Rete & QR».

### Sabato 3 ottobre — Pordenone (Battistella)

- Firma contratto + adesivo in vetrina.
- Registrare data firma su anagrafica Battistella.
- (Opzionale) raccontare a Carlo del test QR FT-CO-26-009.

### Questa settimana

- Commercialista: riga sull’ordine di prova 28/09 pagato e rimborsato lo stesso giorno.
- Saldo PayPal al 31 marzo (~€ 40 da chiarire).
- Cookie QR: allineamento dichiarato in policy Iubenda (repo già aggiornato in Cookie Policy interna `0898b78e`).
- **Personale / Galleria MAG:** F24 INPS € 1.564,84 entro **01/10/2026**.

### Entro fine ottobre

- Area riservata Battistella (scansioni, ordini, fee) — Art. 3.4.
- Prospetto mensile scaricabile Art. 9: primo invio primi giorni di novembre.

### Backlog tecnico

- Chiavi Stripe **test** per tutte le anteprime Vercel (oggi usano live) — priorità alta.
- Registrare nello schema `whatsapp_delivery_status_pending`.
- Riparare vecchia migrazione `partner_handoff`.
- Cancellare backup Neon `backup-pre-florist-network-*` dopo una settimana senza problemi.
- Registro modifiche: mai più orari retrodatati.

---

## Chiusura

Operazioni 1–3 (schema, QR attribution, viste admin) **in produzione** e verificate. Notifiche fiorista/cliente **ON**. Rollback disponibile. Giornata chiusa con verbale consolidato titolare + log Cursor + digest Antigravity/Second Brain.
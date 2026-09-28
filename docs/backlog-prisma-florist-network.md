# Backlog — Prisma / rete fioristi Partner-Leader

Aggiornato: 2026-09-28  
Contesto: Operazione 1 modello dati rete fioristi (`20260928154000_florist_partner_leader_network`), applicata **solo** su Neon branch `dev-florist-network`.

## Priorità alta (dopo merge QR attribution)

1. **Stripe: chiavi TEST su tutte le Preview (senza toccare Production)**  
   Oggi `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` e `STRIPE_WEBHOOK_SECRET` sono **condivise** Preview+Production → ogni preview usa chiavi **LIVE**.  
   **Proposta:**
   - In Production lasciare solo le chiavi **live** (target Production).
   - Per Preview: impostare chiavi **test** a livello Environment=Preview (non branch-specific), così tutte le preview ereditano TEST.
   - Oppure: rimuovere le chiavi Stripe dal target Preview della riga “Production+Preview” e creare voci separate Preview (test) vs Production (live).
   - Webhook Stripe in modo Test → URL preview (o endpoint stabile) + `STRIPE_WEBHOOK_SECRET` test solo su Preview; Production resta sul webhook live.
   - Verifica smoke: checkout preview deve creare sessioni `cs_test_…`, mai `cs_live_…`.
   - Opzionale: `STRIPE_EU_SECRET_KEY` stesso schema (test preview / live prod) se usato in checkout EU.

## Da fare (non ora)

2. **`whatsapp_delivery_status_pending`**  
   Tabella presente nel DB Neon ma assente da `prisma/schema.prisma`.  
   Un futuro `migrate diff` / migrazione potrebbe proporne il `DROP`.  
   **Azione:** registrare il modello nello schema (o documentare drop deliberato) prima di altre migrazioni su main.

3. **Migrazione storica `20260504120000_partner_handoff`**  
   Fallisce sul shadow DB di `prisma migrate dev` (`Order` non esiste ancora a quel punto della catena).  
   Blocca `--create-only` / `migrate dev` classici.  
   **Azione:** riparare la storia migrazioni (o baseline) senza toccare i dati di produzione.

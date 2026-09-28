# Backlog — Prisma / rete fioristi Partner-Leader

Aggiornato: 2026-09-28  
Contesto: Operazione 1 modello dati rete fioristi (`20260928154000_florist_partner_leader_network`), applicata **solo** su Neon branch `dev-florist-network`.

## Da fare (non ora)

1. **`whatsapp_delivery_status_pending`**  
   Tabella presente nel DB Neon ma assente da `prisma/schema.prisma`.  
   Un futuro `migrate diff` / migrazione potrebbe proporne il `DROP`.  
   **Azione:** registrare il modello nello schema (o documentare drop deliberato) prima di altre migrazioni su main.

2. **Migrazione storica `20260504120000_partner_handoff`**  
   Fallisce sul shadow DB di `prisma migrate dev` (`Order` non esiste ancora a quel punto della catena).  
   Blocca `--create-only` / `migrate dev` classici.  
   **Azione:** riparare la storia migrazioni (o baseline) senza toccare i dati di produzione.

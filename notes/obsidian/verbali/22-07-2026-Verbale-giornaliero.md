---
date: 22-07-2026
tipo: verbale_giornaliero
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea, sync_pipeline]
sommario: "Verbale Operativo FloreMoria — 22 Luglio 2026"
sync_sources: ["consolidate-backfill"]
synced_at: 2026-07-24T08:24:52.398Z
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica — fonti: consolidate-backfill.

# Verbale Operativo FloreMoria — 22 Luglio 2026

**Redazione:** BARBARA.  
**Giornata di riferimento:** 2026-07-22.

## Sezione 2 — Strategia
- **Posizionamento e Relazioni Fioristi:** Confermata la linea "Quiet Luxury & Caring" per la comunicazione verso i fioristi partner. Il tono dei messaggi WhatsApp è stato trasformato da stringhe tecniche/log a una struttura calda, collaborativa e trasparente.
- **Integrazioni e Canali Esterni:** Monitoraggio e gestione in sospeso per l'Accesso al Trial su Pinterest.
- **E-commerce & Trasparenza Ordini:** Stabilita la regola operativa per cui la presenza di un ordine in Dashboard equivale a pagamento già confermato dal cliente, eliminando verifiche ridondanti prima delle notifiche ai partner.


## Sezione 4 — Logistica
- **Finestra Oraria Notifiche Fioristi:** Definita la finestra operativa di produzione tra le 08:00 e le 20:00 (i messaggi fuori orario vengono messi in coda per le 08:00 successive).
- **Test Sandbox:** Registrato ed elaborato l'ordine B2B/Sandbox `PT-UD-26-004` (o `FF-CO-26-003`) per la verifica sul campo delle tabelle prodotti e dei messaggi formattati.

---

## Sviluppo tecnico (repo DEVIN)

# Verbale Operativo FloreMoria — 22 Luglio 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-07-22.

## Sezione 1 — Infrastruttura

- `73a7c72` fix(whatsapp): stop spam automatici e log messaggi operator _(FloreMoria)_

## Sezione 2 — Strategia

- `ef92fa8` chore(verbali): pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `ba69d84` chore(verbali): pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `9c2b0d1` chore(verbali): pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `175ae1e` chore(verbali): pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `12a21a0` chore(verbali): sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `9140be9` chore(verbali): pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `26dc39a` chore(verbali): pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_

## Sezione 3 — Sviluppo

- `a5329d6` fix(offers): auth cookie staff per creazione buoni + omaggio CAROLINA10 _(FloreMoria)_

## Sezione 4 — Logistica

- `e80b537` refactor(email): formattazione tabella prodotti, prezzi unitari e totale per notifiche ordini@floremoria.com _(FloreMoria)_
- `e70bf70` fix(whatsapp): blocca anche Punto E/F se auto-notify spento _(FloreMoria)_
- `b727d4d` fix(whatsapp): JPEG+staging per foto chat e recovery FT-MB-26-001 (Carolina) _(FloreMoria)_
- Nuovi ordini registrati: **2**
- Pagamenti confermati: **3**
- Consegne completate: **2**

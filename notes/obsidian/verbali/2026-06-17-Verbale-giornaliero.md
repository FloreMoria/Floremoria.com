---
date: 17-06-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale di Sviluppo FloreMoria — Stato e Roadmap (17 Giugno 2026)"
sync_source: docs/verbali/17-06-2026.md
synced_at: 2026-07-24T08:42:56.608Z
---

> Copia sincronizzata automaticamente da `docs/verbali/17-06-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale di Sviluppo FloreMoria — Stato e Roadmap (17 Giugno 2026)

## 1. Deploy su main (commit di riferimento)

| Commit | Contenuto |
|--------|-----------|
| `f733333` | Pagina **Defunti** (`/dashboard/defunti`): tabella, orfani, modale, cambio fiorista unico |
| `f477244` | Notifica Futuria al fiorista su `IN_PROGRESS`/`DELIVERING`: tag `floremoria-invia-link-consegna-fiorista`, custom field `contact.link_mini_app_consegna` |
| `0cdb703` | **Auto-assegnazione tomba censita** al pagamento Stripe → stato `IN_PROGRESS` + notify fiorista |

**Pattern integrazione Futuria (standard, come benvenuto utente):**

```
Backend → upsert contatto + custom field → tag trigger
Futuria → workflow published → WhatsApp (template Meta Utility)
```

## 3. Futuria — configurazione operativa (in corso)

### Workflow già published

- Invia WhatsApp di benvenuto utente — tag `floremoria-nuovo-ordine`
- Invia WhatsApp Nuovo Fiorista — tag `nuovo-fiorista`
- Notifica di consegna — tag `floremoria-invia-foto-consegna`

### Da completare

- Template **`floremoria_link_consegna_fiorista`** → submit Meta → attendere Approved
- Workflow link fiorista: duplicare «Invia WhatsApp di benvenuto utente», trigger `floremoria-invia-link-consegna-fiorista`, tag finale `floremoria-link-inviato`
- **Non usare** workflow con `custom_webhook` creato dall'AI Futuria
- Risolvere draft duplicato «FloreMoria Benvenuto Ordine» vs benvenuto published

**Location ID verificato:** `7cjy5uPfkHMJtu7PZy9C`

---

## 4. Collaudo

- Link test mini-app fiorista: `https://www.floremoria.com/fiorista/consegna/PT-UD-26-002`
- Test E2E atteso: ordine pagato → auto `IN_PROGRESS` → WhatsApp fiorista con link mini-app

---

## 5. In sospeso

### Codice

- Commit + push blocco modalità `workflow`/`api` Futuria (se confermato)
- Valutare `contact.costo_servizio` in `floristDeliveryLinkNotify`

### Operativo

- Verificare env Vercel: `FUTURIA_API_KEY`, `FUTURIA_LOCATION_ID`, `FUTURIA_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`
- Deploy Vercel commit `0cdb703`

---

## Agenti coinvolti

| Agent | Ruolo |
|-------|-------|
| DEVIN | Auto-assegnazione, integrazione Futuria, pagina Defunti |
| PETRA | Flusso ordine → fiorista → mini-app consegna |
| POSTMAN | Template WhatsApp e workflow Futuria |
| VITO | Secrets env, scope API Futuria |
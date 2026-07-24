---
date: 22-06-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Integrazione WhatsApp Evolution API (22 Giugno 2026)"
sync_source: docs/verbali/22-06-2026.md
synced_at: 2026-07-24T10:07:24.526Z
---

> Copia sincronizzata automaticamente da `docs/verbali/22-06-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Integrazione WhatsApp Evolution API (22 Giugno 2026)

**Argomento:** VERA nativa via Evolution API (iPhone 12 +39 320 410 5305)  
**Stato:** 🟡 Codice su `main` — deploy Vercel automatico; VPS + env + migration Neon da completare  
**Repo:** `FloreMoria/Floremoria.com`

## Verifica pre-deploy (checklist)

### Codice
- [x] `npx tsc --noEmit` OK
- [x] Push su `main` → Vercel redeploy automatico

### Neon (DB produzione)
- [ ] `npx prisma migrate deploy` con URL Neon **oppure** GitHub Actions → **Database migrate deploy**
- [ ] `npm run db:verify:phone-blacklist` su Neon (host `ep-….neon.tech`)

### Vercel — variabili (nomi corretti nel codice)

| Variabile Vercel | Valore |
|------------------|--------|
| `EVOLUTION_API_BASE_URL` | `http://94.177.198.140:8080` (non `EVOLUTION_API_URL`) |
| `EVOLUTION_API_KEY` | = `AUTHENTICATION_API_KEY` in `.env.evolution` |
| `EVOLUTION_INSTANCE_NAME` | es. `floremoria-iphone12` |
| `WHATSAPP_WEBHOOK_SECRET` | stesso token in `WEBHOOK_GLOBAL_HEADERS` Evolution |
| `GEMINI_API_KEY` | già presente (VERA LLM) |

### VPS `94.177.198.140`
```bash
scp docker-compose.yml .env.evolution root@94.177.198.140:~/floremoria-whatsapp/
ssh root@94.177.198.140
cd ~/floremoria-whatsapp && docker compose up -d
```
- Creare istanza Evolution (`floremoria-iphone12`) se non esiste
- Aprire porta **8080** firewall verso Vercel (o tunnel HTTPS)

### Accoppiamento
1. https://www.floremoria.com/admin-panel/whatsapp-setup
2. Genera QR → scansiona con iPhone 12
3. Badge verde **Connesso**

---

## Limitazioni note (v1)

- **Dashboard Comunicazioni** invia ancora via **Futuria**, non Evolution — handoff umano va collegato in fase 2
- **PhoneBlacklist**: solo check in webhook; **nessuna UI admin** (a differenza di email blacklist)
- **Ordini post-checkout**: welcome WhatsApp ancora su Futuria/Twilio (`orderNotify.ts`)

---

## Canali WhatsApp attivi (coesistenza)

| Canale | Uso |
|--------|-----|
| **Evolution** | Inbound VERA + risposte automatiche (nuovo) |
| **Futuria** | Dashboard operatori, delivery magic link |
| **Twilio** | Fallback legacy ordini |

---

*Log aggiornato post-commit Evolution API — sessione Cursor*
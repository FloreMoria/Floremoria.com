# PROMEMORIA DEPLOY — Produzione = Vercel

**Aggiornato:** 2026-09-24 (chiusura Fase 1 sicurezza contabilità)

---

## Regola non negoziabile

| Cosa | Dove |
|------|------|
| **Sito pubblico + dashboard** (`www.floremoria.com`, `floremoria.com`) | **Vercel** — progetto **`floremoria-dashboard`** |
| Database produzione | **Neon** (env su Vercel) |
| **NON** è il sito reale | VPS Aruba `94.177.198.140` |

**Nessun agente e nessun operatore deve pubblicare sul VPS come se fosse produzione del sito.**  
Un `deploy-incremental.sh` / rsync sul VPS **non aggiorna** `www.floremoria.com`.

Il progetto Vercel `floremoria` (`floremoria.vercel.app`) **non** è il dominio pubblico.

### Cosa significa «pubblicato» (obbligatorio)

**«Pubblicato» = solo** un deployment Vercel sul progetto `floremoria-dashboard` che sia:

1. **Status verde / Ready** (non Error, non Canceled, non Building), **e**
2. **Environment / etichetta Production**, **e**
3. **Verificato** con CLI o pannello, es.:
   - `npx vercel ls floremoria-dashboard --scope floremoria-srl-s-projects` → riga più recente Production = Ready  
   - `npx vercel inspect www.floremoria.com --scope floremoria-srl-s-projects` → `status ● Ready`, `target production`, SHA atteso

**Non** contano come pubblicati: commit su `main`, ancestry git («il commit è antenato di un Ready»), deploy VPS, preview, deploy Error/Canceled, né «il codice c’è nel repo».

Se l’ultimo tentativo Production è **Error**, il sito può ancora servire un Ready **precedente**: va detto esplicitamente («live = SHA X; ultimo tentativo fallito = SHA Y»).

---

## 1. Pubblicazione in produzione (unica via)

### Automatica (preferita)

1. Commit + push su `main` del repo `FloreMoria/Floremoria.com`.
2. Vercel costruisce e promuove su `floremoria-dashboard` → alias `www.floremoria.com`.
3. Verifica: `npx vercel inspect www.floremoria.com --scope floremoria-srl-s-projects`  
   oppure Dashboard Vercel → progetto `floremoria-dashboard` → Deployment Production → SHA git.

### Manuale (solo se auto-deploy manca / bloccato)

```bash
cd /percorso/floremoria
npx vercel@latest --prod --scope floremoria-srl-s-projects
# oppure dalla UI Vercel: Promote / Redeploy sul progetto floremoria-dashboard
```

**Se la build fallisce:** fermarsi, leggere i log Vercel, **non** “riparare” pubblicando sul VPS.

### Migrazioni Prisma / Neon

- Schema produzione = Neon collegato a Vercel.
- Applicare migrazioni dal Mac/CI contro Neon (`prisma migrate deploy`), **non** nel `buildCommand` Vercel se lo storico è `db push`.
- Il VPS ha un Postgres **locale** distinto: non confonderlo con Neon.

---

## 2. Checklist post-deploy (2 minuti)

1. `https://www.floremoria.com/` → header `server: Vercel`.
2. Home HTTP 200.
3. `/dashboard/finance` → login admin → dati caricati (non pagina vuota/500).
4. Checkout di prova fino a `checkout.stripe.com` (senza pagare).

---

## 3. VPS Aruba — ruolo residuo (non sito)

Server: **94.177.198.140** (`ServerFloreMoria`).

| Servizio | Stato tipico | Note |
|----------|--------------|------|
| `pm2` `floremoria` (Next :3000) | Spesso acceso | **Copia parallela**, DB locale; nginx blocca `/dashboard` con 404 |
| nginx 80/443 | Acceso | `server_name` ancora su floremoria.com ma **DNS punta a Vercel** |
| Docker Evolution API `:8080` | Acceso | Legacy WhatsApp; produzione Vercel usa **WhatsApp Cloud API** (env Meta) |
| Postgres locale | Acceso | **Non** è Neon |
| Crontab root | Vuoto | Verbali/cron Mac o Vercel Cron |

**Deploy sul VPS** (`deploy.sh` / `deploy-incremental.sh`): solo se serve mantenere Evolution o un laboratorio.  
**Mai** come sostituto del deploy Vercel.

Dettaglio tecnico legacy (archivio lean, PM2, rsync): sezione «Appendice VPS» sotto.

---

## 4. Webhook e URL da tenere su Vercel

Configurare su Stripe / PayPal / Meta verso:

`https://www.floremoria.com/api/webhooks/...`

Non puntare webhook all’IP Aruba per il traffico ordini/pagamenti.

---

## Appendice — VPS (solo manutenzione infrastruttura legacy)

> Usare solo se si lavora esplicitamente sul VPS. Non aggiorna il sito reale.

### Deploy incrementale (laboratorio)

```bash
export DEPLOY_SSH_USER="root"
export DEPLOY_HOST="94.177.198.140"
export DEPLOY_PATH="/var/www/floremoria"
./deploy-incremental.sh
```

Attenzione: su VPS da ~2 GB RAM `npm ci` / `next build` possono andare in OOM. Preferire build locale + rsync `.next` se serve proprio aggiornare quella copia.

### Archivio lean

```bash
./scripts/build-deploy-archive.sh
./deploy.sh
```

### Variabili tipiche sul VPS

Vedi `.env.example`. Sul VPS attuale `DATABASE_URL` punta a **localhost**, non a Neon.

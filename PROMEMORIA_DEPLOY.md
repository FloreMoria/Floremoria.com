# PROMEMORIA DEPLOY — VPS Aruba (Lean, archivio + PM2)

Server di riferimento: **94.177.198.140** (adatta utente/path se diversi).

---

## 1. Prerequisiti sul server (una tantum)

### Node.js 20 LTS (Debian/Ubuntu)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # v20.x
```

### PM2 (process manager)

```bash
sudo npm install -g pm2
pm2 startup systemd
# Esegui il comando che PM2 stampa (sudo env PATH=...)
```

---

## 2. Cartella applicazione sul VPS

Esempio: `/var/www/floremoria` (creala se non esiste).

```bash
sudo mkdir -p /var/www/floremoria
sudo chown -R "$USER:$USER" /var/www/floremoria
```

Il file `deploy.sh` (sul Mac) carica l’archivio e lo estrae qui (variabile `DEPLOY_PATH`).

---

## 3. Variabili `.env` sul server (obbligatorie / consigliate)

Crea `/var/www/floremoria/.env` (o `.env.production`) sul VPS, **mai** committare.

| Variabile | Note |
|-----------|------|
| `DATABASE_URL` | PostgreSQL in produzione (stringa completa `postgresql://...`) |
| `NEXT_PUBLIC_BASE_URL` | Es. `https://www.floremoria.com` (senza `/` finale) |
| `NEXT_PUBLIC_SITE_URL` | Di solito uguale a `NEXT_PUBLIC_BASE_URL` |
| `STRIPE_SECRET_KEY` | Live da Dashboard Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Se usi Elements / publishable |
| `STRIPE_WEBHOOK_SECRET` | Quando attivi i webhook |
| `PARTNER_INBOUND_API_SECRET` | Opzionale (legacy API partner) |
| `PARTNER_INBOUND_CORS_ORIGIN` | CSV origini consentite in produzione |
| `ADMIN_API_KEY` | Protezione route admin interne |
| `FLOREMORIA_WEBHOOK_KEY` | Se usi `/api/logs/update` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Checkout / mappe |
| `GOOGLE_PLACES_API_KEY` / `GOOGLE_PLACE_ID` | Recensioni / Places |
| `GA4_PROPERTY_ID` / `NEXT_PUBLIC_GA4_PROPERTY_ID` | Dashboard analytics |
| `TWILIO_*` | Se invii WhatsApp da server |
| `NEXT_PUBLIC_LEGAL_PRIVACY_URL` / `NEXT_PUBLIC_LEGAL_COOKIE_URL` | Link Iubenda quando pronti |

Riferimento completo: **`.env.example`** nel repository.

---

## 4. Dopo aver caricato e estratto l’archivio (sul server)

Esegui **nella cartella dell’app** (es. `/var/www/floremoria`):

```bash
cd /var/www/floremoria

# Dipendenze di produzione (--ignore-scripts evita il postinstall prisma senza CLI installata)
npm ci --omit=dev --ignore-scripts

# Client Prisma (obbligatorio sul server dopo l’estrazione)
npx --yes prisma@6.19.2 generate
# (Allinea la versione a quella in package-lock.json se aggiorni Prisma.)

# Avvio / riavvio
pm2 start npm --name floremoria -- run start
# oppure, se usi ecosystem file:
# pm2 start ecosystem.config.cjs
pm2 save
```

**Nota:** il pacchetto **non** include `node_modules` (lean). `npm ci --omit=dev` ricostruisce solo le dipendenze runtime.

---

## 5. Dal Mac — preparazione archivio

```bash
cd /percorso/floremoria
chmod +x scripts/build-deploy-archive.sh
./scripts/build-deploy-archive.sh
```

Genera **`floremoria-deploy.tar.gz`** nella root del progetto.

---

## 6. Dal Mac — caricamento (SCP)

```bash
chmod +x deploy.sh
export DEPLOY_SSH_USER="tuouser"      # es. root o utente SSH Aruba
export DEPLOY_HOST="94.177.198.140"
export DEPLOY_PATH="/var/www/floremoria"
./deploy.sh
```

---

## 6-bis. Deploy incrementale (consigliato per modifiche frequenti)

Trasferisce solo i file cambiati (rsync delta), poi build e restart PM2 sul server.

```bash
chmod +x deploy-incremental.sh
export DEPLOY_SSH_USER="root"
export DEPLOY_HOST="94.177.198.140"
export DEPLOY_PATH="/var/www/floremoria"
./deploy-incremental.sh
```

Dry-run per vedere quali file verrebbero inviati:

```bash
DRY_RUN=1 ./deploy-incremental.sh
```

---

## 7. Firewall / reverse proxy

- Apri **80/443** verso il processo (Nginx/Caddy → `localhost:3000` se Next ascolta in locale).
- `NEXT_PUBLIC_*` richiede **rebuild** se cambi dominio dopo il primo deploy.

---

## 8. File inclusi nell’archivio (lean)

`.next/`, `public/`, `prisma/`, `package.json`, `package-lock.json`, **`next.config.ts`** (nel repo non esiste `next.config.js`).

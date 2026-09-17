# Diagnosi accessi Contabilità — 2026-09-17 (sola lettura)

**Ambito:** `/dashboard/finance` e API `/api/dashboard/finance/*`  
**Fonte:** codice (`proxy.ts`, `requireDashboardAdmin`, hub Mission Control) + query Neon produzione  
**Stato B (ruoli/2FA/registro):** **non implementato** — in attesa conferma Salvatore

---

## 1. Chi può aprire `/dashboard/finance` oggi

**Non è “sei loggato”.** Il proxy (`proxy.ts`) ammette a tutta la dashboard staff (incluso Contabilità) solo:

| Ruolo cookie/DB | Accesso pagina `/dashboard/finance` |
|-----------------|--------------------------------------|
| `SUPER_ADMIN` | Sì |
| `ADMIN` | Sì |
| `OPERATOR` / altri (`ACCOUNTANT`, `FLORIST`, …) | No — redirect a `/dashboard` o solo ordini |

Account elevati in Neon (query 2026-09-17):

| Email | Ruolo | Attivo | Ultimo accesso (`last_login_at`) | Note |
|-------|-------|--------|----------------------------------|------|
| `ceo@floremoria.com` | `SUPER_ADMIN` | sì | 2026-08-26 09:43 UTC | Titolare |
| `staff.floremoria@gmail.com` | `ADMIN` | sì | 2026-09-16 19:28 UTC | Uso quotidiano |
| `admin@floremoria.local` | `ADMIN` | no | 2026-06-08 | Soft-deleted |
| `fioristi@floremoria.com` | `USER` | no | — | Soft-deleted; casella monoutente, non staff |

**Conclusione:** oggi possono entrare in Contabilità **due account attivi** (ceo + staff). Nessun `OPERATOR` / `ACCOUNTANT` elevati in DB.

---

## 2. Distinzione ruoli vs cosa si vede

Esiste l’enum `UserRole` (USER…SUPER_ADMIN), ma **non c’è ACL contabile a grana fine**.

| Dato | Chi lo vede oggi |
|------|------------------|
| Fatturato / dossier / corrispettivi | ADMIN + SUPER_ADMIN (stessa pagina) |
| Margini / costi fiorista / fee partner | Idem |
| Saldi bancari Fineco / estratti | Idem |
| Menu «Contabilità» (Mission Control) | Visibile a chi raggiunge la home dashboard staff (= ADMIN/SUPER_ADMIN). Nessun filtro per ruolo più stretto. |

`requireDashboardAdmin` tratta **ADMIN + SUPER_ADMIN + OPERATOR** come equivalenti sulle API. Quindi un futuro OPERATOR potrebbe chiamare le API finance anche se il proxy gli nega la pagina — gap da chiudere in B.

**Vera / collaboratore / titolare:** oggi **non** vedono cose diverse in Contabilità. Vera (se USER) resta su `/dashboard/user`.

---

## 3. Autenticazione a due fattori

**Non attiva** su account staff Contabilità.

- OTP / magic link (`lib/auth/otp.ts`) sono per flusso **USER** (cliente), non 2FA obbligatorio admin.
- Nessun TOTP/WebAuthn/MFA sul modello `User`.

---

## 4. Registro accessi pagine finanziarie / export

**Non esiste.**

- C’è il registro violazioni dati (`docs/REGISTRO_VIOLAZIONI_DATI.md`, logica “cosa è successo”) — **non** un access log finance.
- Nessuna tabella/audit trail “chi ha aperto Contabilità / chi ha esportato XLSX o ZIP”.

---

## 5. Segreti in codice / git

### Tracking pericoloso (valori reali presenti nel working tree / history di tracking)

File **tracciati da git** con chiavi/URL completi (valori **non** riportati qui):

| File | Tipi di segreto (nomi) |
|------|-------------------------|
| `.env.vercel.check` | `DATABASE_URL`, `POSTGRES_*`, `PGPASSWORD`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`, `EVOLUTION_API_KEY`, `FUTURIA_API_KEY`, `GEMINI_API_KEY`, `ADMIN_API_KEY`, … |
| `.env.vercel.production.local` | Stesso famiglia (Stripe, Postgres, Blob, Futuria, …) |
| `.env.vercel.production` | principalmente token OIDC Vercel (runtime dump) |
| `.env.evolution.example` | URI Postgres con password inline (template “esempio” non opaco) |

Azione immediata in questo intervento: **rimozione dall’indice git** + `.gitignore` rafforzato.  
**Rotazione consigliata** (fuori da questo commit): Stripe secret/webhook, Postgres/Neon password se esposte in remoto, Blob token, Futuria, Evolution, Admin API key, Gemini.

### Storia git (pickaxe, senza valori)

- `sk_live_` / `npg_`: nessun file trovato con `-S` in history recente.
- `whsec_`: compare in file storici tipo `env-per-vercel.txt` (già in ignore list) e script setup Resend.
- Codice applicativo: legge `process.env.*` — pattern corretto; nessun secret hardcoded trovato nelle route finance.

### Non tracciati (corretti)

`.env`, `.env.local`, `.env.production.local` — ignorati.

---

## Emergenza chiusa in questo ciclo (non è il piano B)

Due API finance **senza** `requireDashboardAdmin` (aperte a chiunque potesse raggiungerle):

- `/api/dashboard/finance/connect-partner`
- `/api/dashboard/finance/partner-fee-invoices`

Blindate con la stessa auth delle altre route Contabilità.

---

## Cosa resta per B (dopo conferma)

1. Ruoli: titolare / operativo / sola lettura contabile + menu nascosto.
2. Account admin separato da uso quotidiano (no delete / no regen chiavi partner).
3. 2FA obbligatorio su chi accede alla contabilità.
4. Registro accessi + export (stessa logica del registro violazioni).

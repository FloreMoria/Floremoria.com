# Partnership e scambio dati (handoff API)

Ripristino del flusso compatibile con il vecchio sito ASP.NET (`POST api/external/order-data` + redirect con `externalKey`), adattato al progetto **Next.js** attuale.

## Cosa fa il sistema

1. Il **sito partner** (server-to-server consigliato) invia i dati del defunto/acquirente con `POST` su FloreMoria.
2. FloreMoria risponde con un **`externalKey`** (UUID) e salva il payload in database per **30 minuti**.
3. Il partner reindirizza l’utente su:  
   `https://<TUO_DOMINIO>/checkout?externalKey=<UUID>`
4. Il checkout **precompila** i campi e imposta il **codice referral**; al pagamento l’ordine viene associato al **Partner** (se `uniqueCode` coincide) e salva **`partnerNotifyEmail`** per le comunicazioni alla controparte.

## Passi manuali (una tantum su ogni ambiente)

### 1. Database

Dopo aver aggiornato il codice, applica le migrazioni Prisma (tra cui `partner_handoff_sessions`, `partner_notify_email` su `Order`, tabella `partner_api_credentials`):

```bash
cd /percorso/floremoria
npx prisma migrate deploy
```

In sviluppo locale (con DB Docker acceso):

```bash
npx prisma migrate dev
```

Se usi solo `db push` invece delle migrazioni, allinea lo schema con:

```bash
npx prisma db push
```

### 2. Variabili d’ambiente (solo CORS / legacy)

| Variabile | Obbligatorio | Descrizione |
|-----------|--------------|-------------|
| `PARTNER_INBOUND_API_SECRET` | **No** (opzionale, legacy) | Se impostato, consente ancora `Authorization: Bearer <solo questo>` senza `X-Florem-Api-Key`. Utile per migrazione; per nuovi partner preferisci le credenziali create in dashboard. |
| `PARTNER_INBOUND_CORS_ORIGIN` | Produzione se il partner chiama **dal browser** | Lista di origini separate da virgola, oppure `none` per disabilitare CORS (solo chiamate server-to-server). In **development** è consentito `*` in automatico. |

### 3. Credenziali API partner (Dashboard — consigliato)

1. Dashboard → **API Partner** (menu in alto).
2. Scegli il **partner** (deve avere già un **`uniqueCode`** / referral in anagrafica Fioristi).
3. Clicca **Genera credenziale**: copia **subito** `X-Florem-Api-Key` e `Authorization: Bearer` (il segreto **non** è più recuperabile).
4. **Revoca** quando la chiave è compromessa o il contratto termina: la riga resta in elenco ma le chiamate falliscono.

Autenticazione richiesta:

- `X-Florem-Api-Key: <publicId>` (es. `fmp_…`)
- `Authorization: Bearer <segreto>` (es. `fms_…`)

Il `codiceReferral` nel JSON deve coincidere con il **`uniqueCode` dello stesso partner** collegato alla credenziale (altrimenti **403**).

### 4. Creare un nuovo partner (anagrafica)

1. Dashboard → **Fioristi**.
2. Crea/modifica partner con **`uniqueCode`** univoco (è il `codiceReferral` che il sito esterno invierà nel payload).

**Regola:** se `codiceReferral` non corrisponde a nessun partner attivo, l’API risponde **422** e non crea la sessione.

### 5. Contratto API (nuovo sito)

**Endpoint:** `POST /api/external/order-data`  
**Header (modalità dashboard):**

- `X-Florem-Api-Key: <publicId dalla dashboard>`
- `Authorization: Bearer <segreto mostrato una sola volta>`
- `Content-Type: application/json`

**Header (modalità legacy, se `PARTNER_INBOUND_API_SECRET` è impostato):**

- `Authorization: Bearer <PARTNER_INBOUND_API_SECRET>`
- `Content-Type: application/json`

**Body (camelCase o PascalCase come nel vecchio .NET):**

Campi obbligatori:

- `nomeDefunto` / `NomeDefunto`
- `cognomeDefunto` / `CognomeDefunto`
- `codiceReferral` / `CodiceReferral` → deve uguagliare `Partner.uniqueCode`
- `redirectUrl` / `RedirectUrl` → URL HTTPS dove reinviare l’utente dopo il pagamento (salvato in `sessionStorage`, pulsante «Torna al sito partner» su `order-completed`)
- `emailAziendaPartner` / `EmailAziendaPartner` → salvata su `Order.partnerNotifyEmail`

Campi opzionali (precompilano checkout / nota): `nomeUtente`, `cognomeUtente`, `telefonoUtente`, `emailUtente`, `indirizzoUtente`, `cittaUtente`, `provinciaUtente`, `capUtente`, `indirizzoConsegna`, `dataNascita`, `dataMorte`, `info`, ecc.

**Risposta 200:**

```json
{ "message": "Dati ricevuti correttamente!", "externalKey": "uuid..." }
```

**Redirect utente:**

```
https://<TUO_DOMINIO>/checkout?externalKey=<externalKey>
```

L’utente completa carrello (se vuoto aggiunge prodotti), date e pagamento.

### 6. Test manuale con `curl` (dal tuo terminale)

Sostituisci `BASE`, `PUBLIC_ID`, `BEARER_SECRET` (dalla dashboard), `CODICE_REFERRAL` (= `uniqueCode` del partner collegato alla credenziale).

```bash
BASE="https://www.floremoria.it"   # oppure http://localhost:3000
PUBLIC_ID="fmp_…"
BEARER_SECRET="fms_…"

curl -sS -X POST "$BASE/api/external/order-data" \
  -H "X-Florem-Api-Key: $PUBLIC_ID" \
  -H "Authorization: Bearer $BEARER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "nomeDefunto": "Mario",
    "cognomeDefunto": "Rossi",
    "codiceReferral": "CODICE_REFERRAL_UNICO",
    "redirectUrl": "https://www.sitopartner.it/grazie",
    "emailAziendaPartner": "ordini@sitopartner.it",
    "nomeUtente": "Luigi",
    "cognomeUtente": "Verdi",
    "emailUtente": "cliente@example.com",
    "telefonoUtente": "+393331234567",
    "indirizzoConsegna": "Cimitero comunale di Como",
    "provinciaUtente": "CO"
  }'
```

Copia `externalKey` dalla risposta JSON e apri nel browser:

```text
$BASE/checkout?externalKey=<incolla_uuid>
```

### 7. Differenze rispetto al vecchio ASP.NET

| Vecchio | Nuovo |
|---------|--------|
| `MemoryCache` 30 min (perso al riavvio) | Tabella Postgres `partner_handoff_sessions` |
| Nessuna auth | Obbligatorio `Bearer` + `codiceReferral` valido |
| Redirect su `Home/Prodotti?...&externalKey=` | Redirect su **`/checkout?externalKey=`** |
| CORS `*` | CORS configurabile (`PARTNER_INBOUND_CORS_ORIGIN`) |

### 8. Dashboard vs sistema esterno

- **Dashboard attuale:** continua a essere il posto giusto per **creare partner** e **`uniqueCode`** (referral).
- **Questa API:** è un **ingresso tecnico**; non duplicare la logica partner in un altro tool salvo necessità di **segreti diversi per partner** (evoluzione futura: tabella credenziali per-partner).

### 9. Sicurezza (BARBARA / VITO)

- Non committare `PARTNER_INBOUND_API_SECRET` nel repository.
- Preferire **chiamate server-to-server** dal sito partner (niente segreto in JavaScript browser).
- Ruotare il segreto se esposto: aggiorni env su Vercel/hosting e comunichi al partner.

---

Per domande su redirect Stripe o estensioni (firma HMAC per payload, rate limit, IP allowlist), apri un task dedicato.

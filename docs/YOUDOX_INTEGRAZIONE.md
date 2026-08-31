# YouDOX Fatturazione — integrazione FloreMoria

Fonte: [SpecificheTecniche_YouDOXFatturazione.pdf](https://servizi.youdox.it/documentazione/SpecificheTecniche_YouDOXFatturazione.pdf) (DocuMI).

## Protocolli

| Canale | Uso FloreMoria | Note |
|--------|----------------|------|
| **SOAP/WSDL** (HTTPS) | **Primario** | `ExchangeService`, `InvoicesService`, `AccountService`, `VendorService` |
| **SFTP** (SSH :22) | Massivo / backup | White-list IP; user/pass o RSA |
| **GetToken.aspx** | Auth | Unica risposta **JSON** OAuth-like |
| YouDOX inCloud / web | Fuori scope API | Sync desktop / UI umana |
| REST JSON documentale | **Non esiste** | Solo token in JSON |

Demo WSDL: `https://servizi-demo.youdox.it/fatturazione/api/[ServiceName].svc?wsdl`  
Produzione + `client_id`: comunicati da DocuMI via mail.

## Autenticazione

1. `POST/GET GetToken.aspx` con `username`, `password`, `client_id`
2. Risposta: `{ access_token, expires_in }`
3. Token come **parametro input** dei metodi SOAP (non WS-Security, non Bearer standard su tutto)

Env:

```bash
YOUDOX_API_BASE_URL=https://servizi-demo.youdox.it/fatturazione/api
YOUDOX_TOKEN_URL=https://servizi-demo.youdox.it/…/GetToken.aspx   # URL esatto da DocuMI
YOUDOX_CLIENT_ID=
YOUDOX_USERNAME=
YOUDOX_PASSWORD=
YOUDOX_DRY_RUN=true   # stub locali senza SOAP
YOUDOX_INVOICES_SERVICE_URL=   # override esplicito endpoint SOAP InvoicesService
# opzionale SFTP
YOUDOX_SFTP_HOST=
YOUDOX_SFTP_USER=
YOUDOX_SFTP_PORT=22
```

## Mappa metodi → route FloreMoria

| Esigenza | WS YouDOX | Route |
|----------|-----------|-------|
| Health / token | GetToken | `GET /api/v1/finance/youdox/health` |
| Invio attiva XML | `Exchange_ImportXMLToSend` / Zip | `POST /api/v1/finance/youdox/invoices/send` |
| Stati SdI (report) | `Invoices_GetStatusReport` | `GET /api/v1/finance/youdox/status-report` |
| Lista emesse | `Invoices_ListSent*` | `GET /api/v1/finance/youdox/invoices/sent` |
| Lista passive | `Invoices_ListReceived*` | `GET /api/v1/finance/youdox/invoices/received` |
| Download | `Invoices_GetDownloadLink` | `GET /api/v1/finance/youdox/invoices/[invoiceKey]/download` |
| Sync passivo → ledger | List + Download + SetFlagRead + `ingestSdiInvoiceUpload` | `POST /api/v1/finance/youdox/sync/passive` |

Auth route: sessione dashboard admin **oppure** header `x-admin-key` (= `ADMIN_API_KEY`).

## Stati SdI (report)

`working` → `sent_to_sdi` → `evidence_RC|NS|NE|DT|MC|AT`  
OK B2B tipico: `sent_to_sdi` + `evidence_RC` (o `MC`).  
KO: `working` oppure `evidence_NS`.  
**Non** esiste poll “stato singola fattura” dedicato: usare report o campi `Status*` su `ListSent*`.

## SFTP cartelle

- Invio attiva: `/downloads/FEPA/`
- Firmate + esiti attiva: `/uploads/FEPA/`, `/uploads/esitiFEPA/`
- Passive: `/uploads/FEPARicevute/`
- EC/DT PA: `/downloads/esitiFEPARicevute/`, `/uploads/esitiFEPARicevute/`

## Codice

- `lib/youdox/client.ts` — facade (GetToken live; SOAP stub fino a WSDL prod)
- `lib/youdox/auth.ts` — token cache
- Pipeline esistente: `lib/financial/ingestSdiInvoices.ts` (upload manuale dashboard)

## Next step operativo

1. Credenziali + URL GetToken + WSDL produzione da DocuMI  
2. Generare binding SOAP (`soap` / `strong-soap`) da WSDL  
3. Collegare `importXmlToSend` alle autofatture TD17/TD18 già generate  
4. Cron `sync/passive` + alert PETRA su failure  

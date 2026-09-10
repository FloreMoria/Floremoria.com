# Verbale — Fineco lista movimenti / METODO v1.10

**Data:** 10-09-2026 · Europe/Rome  
**Ambito:** Contabilità / estratto conto Fineco  
**Agent:** DEVIN + PETRA · METODO §2 + §4.1

## Contesto

La banca emette l’estratto ufficiale solo a trimestre chiuso. Vietare ogni altra fonte lasciava ciechi sul presente. METODO **v1.10**: il periodo in corso è l’eccezione esplicita — lista movimenti ammessi come **provvisori**, con guardrail.

## Cosa è stato fatto

### 1 — Riabilitazione ingresso (solo periodo aperto)
- Ripristinati `previewFinecoPaste` / `confirmFinecoPaste` in `lib/financial/bankStatements/store.ts`.
- API `POST /api/dashboard/finance/bank-statements/paste` di nuovo operativa (niente più 410).
- UI Contabilità: pulsante «Lista Movimenti (periodo aperto)» + modale anteprima/conferma.
- Gate: date fuori dal trimestre di calendario corrente → rifiuto / stato `OUT_OF_OPEN_PERIOD`.
- Periodi chiusi: resta solo upload file ufficiale con saldi dichiarati (`assertBankStatementDeclaredBalances`).

### 2 — Deduplica
- Su **fingerprint** SHA-256 della chiave naturale Fineco (`movementFingerprint` / stesso percorso di `deduplicateBankLinesDb`), non su confronto grezzo data+importo+descrizione.

### 3 — Guardrail anti riga fantasma (21/08/2026)
- `isFinecoSaldoOrHeaderLine`: scarta «Saldo iniziale/finale/disponibile/contabile», «Totale entrate/uscite», intestazioni colonna, `^saldo`.
- Movimento valido solo con **data operazione + causale + importo**.

### 4 — Stato provvisorio → definitivo
- Documenti/righe paste: `metadataJson` / `rawJson` con `source=fineco_paste`, `certificationStatus=provisional`.
- C3 senza estratto ufficiale con saldi → **non verificabile** (non fallito).
- Liquidazione IVA (§4.1): in testa dichiara N righe provvisorie e importo assoluto; dossier con periodo provvisorio non si consegna come definitivo.
- All’upload dell’estratto ufficiale: `promoteProvisionalLinesAfterOfficialUpload` — match fingerprint → **certified** (allinea data/importo alla banca); non match → **unconfirmed** + foglio Da chiarire («movimento non confermato dall’estratto ufficiale»), **non cancellate**.
- `DOSSIER_METHOD_VERSION` → **1.10**.

### 5 — Riclassifica archivio paste
Eseguito `scripts/reclassify-fineco-paste-provisional.ts` → **7 documenti** → stato provvisorio:

| Periodo | N doc |
|---------|------:|
| T3 2026 | 6 |
| T4 2025 | 1 |
| **Totale** | **7** |

File: `fineco-paste-2026-08-21…` … `fineco-paste-2026-09-06…`.

## Verifiche
- `npx tsc --noEmit` — OK  
- `npm run build` — OK  

## File toccati (commit)
- `lib/financial/bankStatements/finecoOpenPeriod.ts` *(nuovo)*
- `lib/financial/bankStatements/provisionalBankStats.ts` *(nuovo)*
- `lib/financial/bankStatements/promoteProvisionalOnOfficial.ts` *(nuovo)*
- `lib/financial/bankStatements/parseFinecoPaste.ts`
- `lib/financial/bankStatements/store.ts`
- `lib/financial/dossierFiscalControls.ts`
- `lib/financial/taxQuarterlyXlsx.ts`
- `app/api/dashboard/finance/bank-statements/paste/route.ts`
- `components/dashboard/BankStatementsPanel.tsx`
- `scripts/reclassify-fineco-paste-provisional.ts`
- `docs/verbali/10-09-2026-fineco-lista-movimenti-v110.md` *(questo)*

Nota: `docs/METODO_DOSSIER_FISCALE.md` v1.10 già presente in repo (specifica titolare).

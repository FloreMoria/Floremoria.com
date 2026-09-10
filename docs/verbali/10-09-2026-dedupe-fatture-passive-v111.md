# Verbale — Deduplica fatture passive METODO §2 (v1.11)

**Data:** 10 settembre 2026  
**Ambito:** Contabilità / dossier — fatture passive multi-canale  
**Agent:** DEVIN + ALBERTO (identità fiscale)

## Regola definitiva

Stesso documento = **stessa P.IVA fornitore + stesso numero documento**.  
Mai il nome. Data e imponibile = conferme (discrepanza → Eccezioni).  
Priorità: YouDox XML > Report XLSX > manuale.  
Aliquota: letta dalla fonte; mai `imposta/imponibile` (bug 10,01%).

## Causa dei doppi

La chiave canonica a 5 segmenti differiva tra XML (`recipient=IT0418…`) e Report (`recipient=*`), quindi l’idempotenza non riconosceva lo stesso documento. Entrambe le righe finivano in `ManualFinanceExpense`.

## Collaudo

| Documento | Prima | Dopo |
|---|---|---|
| Shoppingarden n. 20/2026 · €18,18 imponibile / €20,00 tot | XML + Report | solo XML |
| Battistella n. 253 · €125,45 / €138,00 tot | XML + Report | solo XML |

## Metriche tabella Contabilità (anno 2026, stesso filtro elenco)

| | |
|---|---|
| Righe prima della dedupe | **67** |
| Righe dopo | **55** |
| **Righe sparite** | **12** |
| **Importo complessivo sparito** | **€ 619,01** (totali assoluti delle sole righe Report scartate) |

Le 12 sono tutte `SDI_XLSX` con gemello `SDI_XML` (inclusi Shoppingarden 14/17/19/20, Battistella 235/253, ecc.).

## Nota sul punto 3 (Shoppingarden 19/2026)

In archivio **c’è** l’XML YouDox (`ITBRNNNA61E71Z110Z_HV7Z4.xml`) oltre al Report. Non risulta uno “skip per già letto” su quel numero: il doppio era lo stesso difetto di chiave. Se in UI sembrava solo Report, era la riga gemella non collassata.

## File

- `lib/financial/passiveInvoiceIdentity.ts` (nuovo)
- `lib/financial/invoiceUploadHistory.ts` — `listPassiveSdiInvoices` dedupe
- `lib/financial/dossierAcquistiBuild.ts` — Acquisti + Eccezioni §2
- `lib/financial/ingestSdiInvoices.ts` — match VAT\|NUM + non degradare XML col Report
- `lib/financial/parseReceivedInvoicesXlsx.ts` — aliquota da colonna, non stimata
- `docs/METODO_DOSSIER_FISCALE.md` + `DOSSIER_METHOD_VERSION` → **1.11**

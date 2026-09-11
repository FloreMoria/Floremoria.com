# Verbale — 11 settembre 2026 — C11 insiemi, C12 date, liste di lavoro

## 1) C11 riscritto (METODO v1.15)

Confronta **insiemi di orderId** sull’anno solare 2026 (cinque canali), non somme euro.
Atteso: coincidenza. Misura: n° ordini presenti in un canale e assenti in un altro.
Pose escluse. Date cassa/competenza non entrano.

### Rilancio C11 (2026)

| Canale | n orderId |
|--------|-----------|
| Corrispettivi (evidenza gateway) | 44 |
| Ledger ricavi | 38 |
| taxRegister / taxQuarterly / cfoTools | 74 |

**Insiemi non coincidono.** Divergenti: **64**.
Pattern dominante: ordini nel trio taxRegister/taxQuarterly/cfoTools (e spesso ledger) **assenti da corrispettivi** = mancano TX/gateway collegati (import manuali / match ancora aperti). Il trio ordini-createdAt è allineato a 74.

## 2) C12 — data ordine = data incasso

Tolleranza dichiarata ≤ 24h (fuso).  
Rilancio 2026: **passed=true**, controllati=22, divergenze=**0**. Verde.

## 3) Lista di lavoro (non controllo)

Sezione UI **«Da sollecitare — fatture fiorista mancanti»** (conteggio + importo sempre visibili), API dedicata, fuori da C1–C12.

## 4) METODO

- v1.15 §5 C11/C12; §5.1 controllo vs lista di lavoro; §5.2 invariante date + cavallo d’anno a richiesta.
- Script: `scripts/list-orders-cross-year.ts --paid=2026 --delivery=2027`

## 5) File

- `lib/financial/revenuePerimeterChannels.ts`, `orderPaymentDateControl.ts`, `floristInvoiceWorkList.ts`
- `dossierFiscalControls.ts` (C11/C12)
- UI work list + Contabilità
- `docs/METODO_DOSSIER_FISCALE.md`, `DOSSIER_METHOD_VERSION=1.15`

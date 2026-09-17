# Verbale — 17-09-2026 · Delta fatturato · MANCANTE IVA · YouDox

## 1. Delta fatturato 10/09 → oggi

Baseline ufficiale 10/09: **75 ordini · €4.098,68** (esclusi 4 pose €0 Isabella).
Conteggio «backup» oggi: **83 · €4.398,64** (= non cancellati/rimborsati, include pose €0 + PENDING Isabella + PAID_TO_DELIVER).

### Delta euro (+€299,96) — 4 ordini nuovi (non 8)

| Ordine | Data | Importo | Note |
|--------|------|---------|------|
| FT-ME-26-003 | 2026-09-12 | €49,99 | Maria Puliafico · PayPal (Stripe) |
| FT-CA-26-001 | 2026-09-15 | €29,99 | Moreno Venturino · Carta |
| FF-VE-26-001 | 2026-09-16 | €89,99 | Connect partner IOF · Stefano Bucci |
| FF-PN-26-005 | 2026-09-16 | €129,99 | Natale Fedrigo · Stripe |

Somma = **€299,96** = 4398,64 − 4098,68.

### Delta conteggio +8 (75→83)

Oltre ai 4 nuovi: rientrano nel conteggio «83» le **4 pose €0** escluse il 10/09 (`FT-MC-26-003/004/005/006`).

### Prove €1,00 Paolo

**Non presenti** in Neon come Order / Connect charge / movimento Stripe da €1,00. Nessun ordine Cantoni/Pavani/demotanexpo in DB. Non vanno esclusi dal fatturato perché non ci sono.

---

## 2. MANCANTE IVA — definizione

`mancanteShare = Σ|gross| righe MANCANTE / Σ|gross| tutte le righe corrispettivi del periodo`.

**Non misura l’aggancio ordine↔incasso.** Una riga è MANCANTE quando l’incasso gateway non ha aliquota 10/22 determinabile da `Product.vatRatePercent` **e** non scatta la PRESUNTA §8.3 (.eu). Oggi tutte le 77 righe MANCANTE hanno `orderId = null` nel builder corrispettivi (incasso non collegato lato registro gateway).

Gate export: **> 30% blocca**.

### Rimisura oggi

| Trim | MANCANTE % | 10/09 | Gate 30% | Righe MANCANTE | Export |
|------|------------|-------|----------|----------------|--------|
| T1 | **1,8%** | 1,8% | PASS | 4 | OK `Dossier_…_T1_oggi.xlsx` |
| T2 | **42,9%** | 47,6% | BLOCCA | 34 | no |
| T3 | **47,7%** | 49,8%* | BLOCCA | 39 | no |

\*baseline T3 citata 49,8%; misura odierna chiusura era ~49,5% su T3 isolato.

Elenco completo: `docs/verbali/17-09-2026-mancante-iva-elenco.json` (77 righe).

---

## 3. YouDox

### Sync live (eseguito)

- GetToken HTTP **200**, `expires_in` **3600** (allineato al fallback cache).
- `OnlyUnread=true`: **13** documenti.
- Finestra 120gg `onlyUnread=false`: **37**.
- Finestra 400gg `onlyUnread=false`: **102**.
- Stato sync: `lastSyncAt=2026-09-17T15:03:44Z`, `processedKeys=37`.

### markInvoiceAsRead

**Dopo** `ingestSdiInvoiceUpload` (non prima). Ipotesi «marca prima del DB» **non confermata** sul codice attuale. Rischio residuo: sync incrementale (lastSync−3g) non ripesca unread vecchi; il tasto «sembra» non aggiornare.

### Force recovery

```json
{
  "generatedAt": "2026-09-17T15:32:06.379Z",
  "lookbackDays": 400,
  "polled": 102,
  "imported": 4,
  "updated": 0,
  "skippedAlreadyInLedger": 68,
  "failed": 0,
  "markedAfterIngest": 4,
  "budgetExhausted": true,
  "failureSample": [],
  "importedSample": [
    {
      "numero": "000016-2025-EST",
      "vendor": "STRIPE PAYMENTS EUROPE LIMITED",
      "totalCents": 878
    },
    {
      "numero": "000017-2025-EST",
      "vendor": "OpenAI Ireland Limited",
      "totalCents": 2300
    },
    {
      "numero": "22",
      "vendor": "Funky Flowers SNC di Vaghi C. e Mannarino G.",
      "totalCents": 3500
    },
    {
      "numero": "290",
      "vendor": "FLOWERS DI FERRANTE IGNAZIO",
      "totalCents": 2000
    }
  ]
}
```

### Ultime fatture per fornitore

Vedi `docs/verbali/17-09-2026-youdox-sync-diag.json` → `lastInvoicePerVendor` (44 fornitori).

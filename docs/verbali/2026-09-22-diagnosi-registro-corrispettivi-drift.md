# Diagnosi registro corrispettivi — 22 settembre 2026

**STOP operativo:** nessun riordino dashboard / allineamento fonti finché non chiarito.

## Verdetto in una frase

Il **Registro Corrispettivi commercialista (gateway)** di oggi è **identico** al freeze di ieri (T1 €1.038,23 · T2 €1.246,02 · T3 €2.155,87 · **80** vendite). I numeri «di oggi» T2 €926,13 / T3 €2.376,29 / **83** righe appartengono a un **altro motore**: `tax-register` (ordini per `createdAt`), non al documento commercialista.

---

## V1 — Confronto riga per riga (T2 / T3)

### Fonte A — commercialista / `buildGatewayCorrispettivi` (ieri = oggi)

| Trim | Righe | Lordo |
|------|------:|------:|
| T2 | 22 | €1.246,02 |
| T3 | 37 | €2.155,87 |

Live 22/09 = file `docs/verbali/FloreMoria_2026_T{2,3}_Corrispettivi.xlsx` = C15 freeze 21/09. **Zero drift.**

### Fonte B — `tax-register` (tabella «Registro economico & corrispettivi» in Fisco)

| Trim | Righe | Lordo | Δ vs gateway |
|------|------:|------:|-------------:|
| T2 | 20 | €926,13 | **−€319,89** |
| T3 | 42 | €2.376,29 | **+€220,42** |

Nota: Δ T3 dichiarato in chat (+€283,38) non coincide con il calcolo attuale (+€220,42 = 2376,29 − 2155,87).

### Perché i totali divergono (non è uno «spostamento trimestre» del gateway)

Motore diverso:

| | Commercialista / gateway | tax-register |
|--|--------------------------|--------------|
| Unità | Incasso gateway | Ordine gestionale |
| Data periodo | Data **pagamento** | `Order.createdAt` |
| Inclusione | Charge/PayPal confermati (anche senza ordine FM) | Ordini non `PENDING`/`CANCELLED` |

**T2 — spiegazione del −€319,89** (fuzzy match):

| Data | Rif. | Importo | Ruolo |
|------|------|--------:|-------|
| 03/05/2026 | FT-MC-26-007 | €284,90 | In **gateway**; **assente** da tax-register perché ordine `status=PENDING` (carnet import manuale) |
| 11/05/2026 | ch_3TVvy64… | €29,99 | Solo gateway (EU charge) |
| 19/05/2026 | ch_3TYqjZ… | €34,99 | Solo gateway |
| 19/05/2026 | FT-SA-26-001 | €29,99 | Solo tax-register |
| | | **Netto** | 284,90+29,99+34,99−29,99 = **€319,89** |

**T3 — +€220,42:** stessa vendita spesso con chiavi diverse (eu-2026-xxx / ch_* / py_* vs FT-/FF-), più ordini Connect/partner e vendite recenti in tax-register non allineati 1:1 al gateway. Non risultano «cambi di trimestre» sul motore gateway.

**Righe «presenti ieri assenti oggi» sul commercialista:** nessuna.  
**Righe «presenti oggi assenti ieri» sul commercialista:** nessuna.

---

## V2 — Commit sospetti (21/09 sera → 22/09)

| Commit | Quando | Cosa tocca | Effetto sul registro commercialista |
|--------|--------|------------|-------------------------------------|
| `654f3832` | 21/09 21:59 | `gatewaySyncRows`, PayPal classify, commercialista route, dossier controls | Dedup Stripe fantasma / PayPal passthrough / giroconti — **vista sync**, non ha spostato i totali F2 oggi vs freeze |
| `35eb89f2` | 22/09 16:29 | `commercialistaCorrispettiviXlsx`, `corrispettiviSalesFilter`, `dossierCorrispettiviBuild` | Colonna A: da Excel serial date → **stringa DD/MM/YYYY**; etichetta «PayPal (via Stripe)»; rif. ordine = tx se manca FM. **Formato export**, non riassegnazione trimestre (il filtro periodo resta su `Date` di pagamento) |

Il sospetto «data trattata come stringa → trimestre saltato» **non** spiega i totali T2/T3 commercialista: quei totali sono stabili. Spiega solo il cambio di **formato** della colonna data nell’xlsx (e la scomparsa di `DA_COLLEGARE` a favore dell’id transazione).

---

## V3 — 83 vs 78 (o 80)

| Contatore | Valore |
|-----------|-------:|
| Gateway / commercialista YTD (T1+T2+T3) | **80** (21+22+37) |
| tax-register YTD | **83** (21+20+42) |
| «78» citato ieri | probabilmente conteggio manuale / export parziale (−2 rispetto a 80) |

Differenza **83 − 80 = 3** (non 5) tra i due motori a livello YTD.  
Le vendite **in più nel tax-register** (es. recenti / Connect) che non hanno match gateway pulito includono tra le altre: FF-VE-26-001, FF-VE-26-002, FT-LE-26-001, FT-FG-26-001 (date 16–22/09) — vanno classificate come *ordini gestionali*, non come «righe riammesse» del registro commercialista.

Se il confronto era 78→83 (+5), quelle 5 non sono drift del F2 commercialista: sono **righe del tax-register** (o un mix di conteggi).

---

## Azione implementata (22/09)

1. METODO §8.5 — congelamento + rettifica esplicita.
2. Tabella `corrispettivi_register_snapshots` + download commercialista **dallo snapshot**.
3. Script `scripts/freeze-corrispettivi-snapshots-2026.ts` per congelare T1–T3 sullo stato attuale (gateway = freeze 21/09).

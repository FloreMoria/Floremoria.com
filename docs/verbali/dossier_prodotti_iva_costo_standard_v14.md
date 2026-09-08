# Verbale — Prodotti: aliquota IVA + costo standard (METODO v1.4) — STOP pre Fase 3

**Data:** 2026-09-08  
**Spec:** `docs/METODO_DOSSIER_FISCALE.md` v1.4 §6.4 / §6.5 / §8.1

---

## Risposte C (indagine — fermarsi qui per Fase 3)

### C1 — Prodotti a catalogo e aliquota

| | |
|---|---|
| Prodotti a catalogo (`deletedAt` null) | **29** (tutti attivi) |
| Senza aliquota dopo migrazione | **29 / 29** |

Nessun default applicato: `vat_rate_percent` è NULL su tutti. Da compilare a mano (10 o 22) prima della Fase 3 corrispettivi.

### C2 — Righe d’ordine

Il database ha **`OrderItem`** (non solo totale ordine): `productId`, `quantity`, `priceCents`, relazione a `Product`.  
Conteggio attuale: **97** righe d’ordine.

### C3 — Ordini misti (floreale + accessorio) T2

Chiarimento sul «34»: nell’export Q2 precedente, **34** era la lista **.eu non contabilizzata**, non gli ordini `.com` T2.

| Ambito | N | Di cui misti (fiori + accessori) |
|---|---|---|
| T2 2026 PAID in Neon | **10** | **8** |
| Esempi misti | FT-PA-26-003, FT-CS-26-001, FT-CO-26-004, FF-RM-26-001, FT-RC-26-001, FT-CS-26-002, FT-PA-26-004, FF-VR-26-001 | Foto / Messaggio / Nastro |

Tag sito Stripe su questi 10: per lo più `UNKNOWN` (COM esplicito raro in T2).

### C4 — Ordini `.eu` e accessori

**Non tutti floreali.** Sui **9** ordini taggati EU in Neon:

| | N |
|---|---|
| Solo floreali | **8** |
| Con accessorio | **1** — `FF-PD-26-002` (Bouquet Memoria Eterna + Nastro commemorativo) |

Quindi l’affermazione «tutti floreali al 10%» **non** è verificata: almeno un ordine EU ha aliquota mista.

---

## Implementato (punto A)

- Campi Product: `vatRatePercent` (10\|22\|null), `floristStandardCostCents` (opzionale)
- Migrazione `20260908170000_product_vat_and_florist_standard_cost` applicata su Neon
- Dashboard Prodotti: colonne IVA, costo fiorista, Venduti (periodo), margine unitario/totale
- Venduti calcolati da `OrderItem` (esclusi CANCELLED / test / soft-delete), mai salvati sul prodotto

## Non fatto (voluto)

- Fase 3 Registro corrispettivi — **STOP** finché le aliquote non sono compilate
- Scritture «fattura da ricevere» da costo standard e controllo C11 associato — dopo compilazione / su OK

---

## File

- `docs/METODO_DOSSIER_FISCALE.md` (v1.4)
- `prisma/schema.prisma` + migration
- `lib/dashboardProductApi.ts`, `lib/products/productCatalogMetrics.ts`
- `app/dashboard/products/*`, `app/api/dashboard/products/route.ts`

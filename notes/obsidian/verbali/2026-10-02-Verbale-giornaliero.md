---
date: 02-10-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo Integrativo – 2 Ottobre 2026"
sync_source: docs/verbali/02-10-2026.md
synced_at: 2026-10-02T13:51:32.334Z
---

> Copia sincronizzata automaticamente da `docs/verbali/02-10-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo Integrativo – 2 Ottobre 2026
**Protocollo:** `[FLOREM_AUTO_PROT]`  
**Data e Sede:** Venerdì 2 Ottobre 2026 – Como / FloreMoria S.r.l.  
**Ambiente:** Next.js 16, Prisma ORM, Neon PostgreSQL, Stripe API, Vercel.

---

## 1. Sintesi Operativa
- Allineamento e blindatura visibilità B2B per Annunci Funebri (AF): riconciliazione su produzione dell'ordine FF-VE-26-002 con audit log dedicato, estensione del filtro API con masterPartnerId e risoluzione automatica delle agenzie in fase di create (deploy `dpl_HV8Y7dyYf4eUUgddWuCncbACA1in`).
- Risoluzione completa della deduplicazione defunti: transazione atomica Prisma, riassegnazione ordini con somma totali, gestione omonimie e bypass date nulle, esclusione soft-deleted dalla tabella e implementazione handler GET `/api/dashboard/defunti`.
- Validazione TypeScript (`npx tsc --noEmit`) e test di unione superati con 0 errori.

### Log operativo (`.today_log.txt`)
- `[15:21]` ops/b2b: FF-VE-26-002 allineato su Production (`referralPartnerId=AF`, `agencyId=IOF San Marco`) + AdminFieldChangeLog; GET partner list vede 001+002.
- `[15:26]` fix: B2B partner order visibility — GET OR+masterPartnerId; AGGREGATOR referralPartnerId; agencyName→agencyId.
- `[15:35]` deploy: merge `fix/b2b-partner-order-visibility` → main (PR#1); Production `dpl_HV8Y7dyYf4eUUgddWuCncbACA1in`.

## 2. Digest mail del giorno
- **Fonte Second Brain** `today-mails.json`: **non aggiornata al 02-10-2026** (ultimo export `01-10-2026`, `exported_at` 2026-10-01T23:00). Nessun digest inventato per la giornata odierna.
- Riferimento residuo 01/10 (non del giorno): PayPal SumUp La Gardenia 20 €; Facebook/WhatsApp Business 2,34 €; Fineco bonifico istantaneo uscita 700 € a Rampoldi Daniela.

## 3. Stato Documentale
- Vault Obsidian e archivio documentale pronti per la sincronizzazione (`02-10-2026.md` → mirror Obsidian).
- Buffer temporaneo `.today_log.txt` azzerato dopo sync/commit/push.
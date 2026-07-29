---
date: 29-07-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 29 Luglio 2026"
sync_source: docs/verbali/29-07-2026.md
synced_at: 2026-07-29T16:39:50.424Z
---

> Copia sincronizzata automaticamente da `docs/verbali/29-07-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 29 Luglio 2026

**Società:** FloreMoria S.r.l. (Startup Innovativa)  
**Redazione:** BARBARA (Staff) & AI Development Team (Antigravity & Cursor)  
**Ambiente:** Production (Vercel / Aruba VPS) & Repository Source Code  
**Giornata di riferimento:** 2026-07-29.

## Stato sistemi (snapshot)

| Area | Status |
|------|--------|
| VERA & Stripe | Operativo — riconciliazione ordini pending non pagati + webhook ripristino su pagamento tardivo |
| Media | Vercel Blob attivo — upload prodotti + persistenza media chat WhatsApp |
| Feed Marketing | Sincronizzazione automatica su `/public` (Google Merchant) |
| WhatsApp Cloud API | Operativo — Punto G one-shot, template attesa aggiornato, reazioni leggibili |

## Sezione 1 — Infrastruttura

- Risolto HTTP 500 (EROFS) su upload prodotti in serverless Vercel: API di caricamento immagini riscritta su **Vercel Blob CDN** in produzione (disk solo in locale).
- Persistenza media WhatsApp inbound su Blob permanente + proxy staff per URL `delivery-staging` scaduti e blob privati (foto chat non più “MEDIA NON DISPONIBILE” per allegati nuovi/validi).
- Feed marketing: script `generate_feed.ts` / `generate_official_feed.ts` salvano in `/public`; feed pubblici:
  - https://www.floremoria.com/GOOGLE_MERCHANT_OFFICIAL_FEED.csv
  - https://www.floremoria.com/GOOGLE_MERCHANT_FEED.csv

## Sezione 2 — Strategia / Operatività

- Verbale operativo consolidato (BARBARA + Cursor) per archiviazione Obsidian e dashboard `/dashboard/logs`.
- Template Meta `floremoria_aggiornamento_attesa` aggiornato e **approvato**: timing generico («non appena sarà completata»), senza «nelle prossime ore».

## Sezione 3 — Sviluppo

### Pagamenti & VERA

- Ordine **FT-PA-26-006** (Luciano Mammì): bonifica da `IN_PROGRESS` (anomalia post pagamento fallito + WhatsApp) → `CANCELLED` + `deletedAt`.
- Patch `orderStatusInquiry.ts` / contesto caller: VERA ignora ordini `PENDING` non pagati (salvo test).
- Webhook finance (`app/api/v1/finance/webhook/route.ts`): riattivazione automatica (`deletedAt = null`) se Stripe notifica pagamento tardivo su carrello archiviato.

### Dashboard Finance (`/dashboard/finance`)

- Endpoint real-time Stripe: saldo disponibile/in elaborazione + ultime 10 checkout session (clienti/errori).
- Backend predisposto per PayPal (credenziali produzione da inserire).
- UI scheda stato Stripe/PayPal per flussi di cassa e diagnostica pagamenti.

### WhatsApp Business Cloud API

- **Punto G one-shot:** stop al reinvio template ogni ~20h (duplicati a cliente/fiorista). Un sollecito per ordine nella finestra 48h.
- Mapping inbound: reazioni come `Reazione: 👍`; tipi Meta `unsupported` con etichette IT (OTP PayPal/Stripe non esposti da Meta API — limite piattaforma).
- Chat media: salvataggio automatico allegati inbound su Blob + proxy dashboard.

### Catalogo / prodotti

- `ClientProductsTable.tsx`: categorizzazione percorsi media; upload dashboard su Blob.

## Sezione 4 — Logistica

- _Dati operativi giornata: da consolidare in pipeline automatica se disponibili._

## Commit di riferimento (estratto giornata)

- Fix VERA / checkout pending non pagati
- Feat finance: stato Stripe/PayPal real-time
- Feat catalog: feed pubblici + upload Blob prodotti
- Fix WhatsApp: Punto G one-shot, template attesa, reazioni/unsupported, persistenza foto chat

## Note aperte

- Credenziali PayPal produzione ancora da collegare alla scheda finance.
- Messaggi OTP inbound restano non leggibili via Cloud API (policy Meta).
- Foto Meta già scadute (ID Graph) non recuperabili retroattivamente.
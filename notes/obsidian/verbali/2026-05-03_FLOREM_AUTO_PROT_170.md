---
date: 2026-05-03
protocollo: FLOREM_AUTO_PROT_170
tags: [verbale, BARBARA, DEVIN, checkout, Stripe, copy]
---

# FLOREM_AUTO_PROT_170 — Verbale: copy pagamento e regola mono-categoria carrello

**Redazione:** BARBARA / DEVIN.  
**Data sessione:** 03/05/2026.

## Sintesi

- Uniformato il messaggio sotto lo step pagamento: pagamento Stripe + foto consegna WhatsApp.
- Introdotta **regola rigida mono-categoria** nel carrello: vietato mix FT/FF/FA nello stesso ordine; conferma utente stile Quiet Luxury (modale) con «Svuota carrello e aggiungi» / «Annulla».

## Esito

Allineamento tra promessa percepita al pagamento e vincolo operativo su catalogo.

## Riferimenti tecnici

`app/checkout/page.tsx`, `components/FloremCartCategoryModal.tsx`, `lib/floremCartCategory.ts`, `app/carrello/page.tsx`.

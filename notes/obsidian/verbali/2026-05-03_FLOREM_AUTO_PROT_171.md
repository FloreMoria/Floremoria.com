---
date: 2026-05-03
protocollo: FLOREM_AUTO_PROT_171
tags: [verbale, BARBARA, DEVIN, API, checkout, compliance]
---

# FLOREM_AUTO_PROT_171 — Verbale: validazione server e abbonamento solo FT

**Redazione:** BARBARA / DEVIN.  
**Data sessione:** 03/05/2026.

## Sintesi

- `isRecurring` su ordine: **true** solo se `orderCategory === 'FT'` e `recurringType === 'monthly'`.
- API checkout: rifiuto (`400`) se carrello **misto** per categorie catalogo note; controllo coerenza `orderCategory` vs categoria unica nel carrello.

## Esito

Doppio binario client + server per integrità ordine e audit futuro.

## Riferimenti tecnici

`app/api/checkout/route.ts`, `lib/floremCartCategory.ts`.

---
date: 2026-05-03
protocollo: FLOREM_AUTO_PROT_173
tags: [verbale, BARBARA, DEVIN, NINA, ARLO, cart-logic]
---

# FLOREM_AUTO_PROT_173 — Verbale: modulo `floremCartCategory` e modale Quiet Luxury

**Redazione:** BARBARA / DEVIN / NINA / ARLO.  
**Data sessione:** 03/05/2026.

## Sintesi

Centralizzata la logica `getCartCatalogCategoryState` / `canAddProductToCart` in libreria dedicata. Sostituiti i `window.confirm` nativi con **`FloremCartCategoryModal`** su PDP, hover preview e checkout (toggle accessorio).

## Nota compliance

Nessuna eccezione **FT + FA** per accessori: regola unica per ordine.

## Riferimenti tecnici

`lib/floremCartCategory.ts`, `components/FloremCartCategoryModal.tsx`, `components/ProductClientView.tsx`, `components/ProductHoverPreview.tsx`.

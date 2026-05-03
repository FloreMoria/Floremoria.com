---
date: 2026-05-03
protocollo: FLOREM_AUTO_PROT_166
tags: [verbale, BARBARA, DEVIN, NINA, navbar, UX]
---

# FLOREM_AUTO_PROT_166 — Verbale: evidenziazione menu per categoria su PDP

**Redazione:** BARBARA / DEVIN / NINA (UX).  
**Data sessione:** 03/05/2026.

## Sintesi

Correzione della logica di **active state** nella navbar: le PDP risiedono tutte sotto `/fiori-sulle-tombe/[slug]`; l’evidenziazione della voce di menu deve derivare dalla **categoria prodotto** (slug → `getProductBySlug`), non dal prefisso URL.

## Punti trattati

- FT → «Fiori sulle tombe»; FF → «Fiori per il funerale»; FA → «Piccoli Amici».
- Altre voci: match path classico.

## Esito

`components/Navbar.tsx` — funzione `isNavLinkActive` con risoluzione slug da pathname.

## Riferimenti tecnici

`components/Navbar.tsx`, `lib/products.ts`.

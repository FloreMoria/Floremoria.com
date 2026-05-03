---
date: 2026-05-03
protocollo: FLOREM_AUTO_PROT_165
tags: [verbale, BARBARA, DEVIN, FLOREM_AUTO_PROT, PDP, catalogo]
---

# FLOREM_AUTO_PROT_165 — Verbale operativo: PDP e segregazione categoria FT / FF / PA

**Redazione:** Segreteria BARBARA, in coordinamento tecnico con DEVIN (CTO).  
**Data sessione:** 03/05/2026.

## Sintesi

Documentazione degli interventi sulla pagina prodotto (PDP) per distinguere **Fiori sulle Tombe (FT)**, **Funerale (FF)** e **Piccoli Amici (PA/FA)**: testi «Certificazione fotografica» differenziati, optional «foto prima della consegna» solo per FT, integrazione preferenza `localStorage` e merge carrello coerente con categoria tombe.

## Punti trattati

- Allineamento copy legale/commerciale su doppia foto (FT) vs foto post-allestimento (FF/PA).
- Rimozione blocco opt-in duplicato dove l’optional è già in elenco «Completa il tuo omaggio».

## Esito

Implementazione lato `ProductClientView` e `lib/floremPreDeliveryPhoto` con guardia su carrello contenente solo bouquet **cimitero** per il supplemento foto.

## Riferimenti tecnici

`components/ProductClientView.tsx`, `lib/floremPreDeliveryPhoto.ts`.

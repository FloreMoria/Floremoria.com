---
date: 2026-06-16
tipo: verbale_sviluppo
tags: [verbale, DEVIN, PETRA, CEO, PoD, Defunti, collaudo]
---

# Verbale di Sviluppo FloreMoria — Stato e Roadmap (16 Giugno 2026)

> Copia canonica repo: `docs/verbali/16-06-2026.md`

## 1. Traguardi raggiunti e deploy live

- Risoluzione Bug iOS (Safari / Immagini Pesanti): compressione client-side automatica (max 1600px) prima del caricamento.
- Ottimizzazione GPS: geolocalizzazione una sola volta all'apertura, cache in `sessionStorage`.
- Sincronizzazione Database Neon AWS: tabelle pivot M2M `UserDeceasedLink` e `PartnerDeceasedAssignment`.
- Infrastruttura Storage Vercel Blob Pubblica: bucket pubblico per Magic Link immediati.
- Denominazione Elegante dei File: `[nome-cognome-defunto]-[data-consegna]-[stringa-casuale].webp`.
- Bypass di Test & Codici Parlanti: Mini-App fioristi via `PT-UD-26-002` e bypass sicurezza test.

## 2. Raffinamenti e bug-fix immediati

| Voce | Stato |
|------|-------|
| Mappa admin raddoppiata | ✅ |
| Download diretto admin | ✅ |
| Unificazione flusso fiorista → Prove Visive Custodite | ✅ |
| Scarica / Sostituisci / Cancella / Ruota 90° | ✅ |

## 3. Nuovo sviluppo — Pagina Defunti (priorità)

- Tabella leader: nome, nascita, morte, comune, cimitero, posizione tomba.
- Modale espansa: cronologia ordini, consegna, parenti collegati, fiorista di zona.

**Stato:** ✅ Implementato (`/dashboard/defunti`).

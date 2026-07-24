---
date: 16-06-2026
tipo: verbale_giornaliero
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea, PETRA, CEO, PoD, Defunti, collaudo]
sommario: "Verbale di Sviluppo FloreMoria — Stato e Roadmap (16 Giugno 2026)"
sync_sources: ["consolidate-clean-move"]
synced_at: 2026-07-24T08:41:46.361Z
redazione: BARBARA (Antigravity) + DEVIN (Cursor)
---

> Pipeline automatica — fonti: consolidate-clean-move.

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

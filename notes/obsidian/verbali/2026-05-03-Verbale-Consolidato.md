---
date: 2026-05-03
tipo: verbale_consolidato
tags: [verbale, BARBARA, DEVIN, FLOREM_NET, Regola_Aurea]
protocolli_sostituiti: [FLOREM_AUTO_PROT_165, FLOREM_AUTO_PROT_174]
---

# Verbale Operativo FloreMoria - 03 Maggio 2026

**Redazione:** Segreteria BARBARA, coordinamento tecnico DEVIN (CTO).  
**Regola Aurea:** un solo verbale archiviato per giornata di lavoro; il presente documento sostituisce le bozze parziali PROT_165–PROT_174 della stessa data.

---

## Sezione 1 — Infrastruttura

- **Organigramma FLOREM_NET:** definizione e manutenzione degli **22 agenti** operativi in `.cursorrules` (SOFIA → CLEO), con istruzioni per l’invocazione della competenza corretta su ogni task e allineamento ai protocolli `FLOREM_AUTO_PROT`.
- **Stack e continuità:** politiche di **backup** dei contenuti e della configurazione; proseguimento della **migrazione / consolidamento su Next.js** come piattaforma unica per il front-office e le aree riservate (dashboard, API route, Prisma).
- **Tracciabilità:** verbali e log operativi registrati in `floremoria_logs` e copia archivistica in `notes/obsidian/verbali/`, con ordinamento cronologico decrescente in dashboard.

---

## Sezione 2 — Strategia

- **Protocollo «Vera-Human» (umano nel ciclo):** identità dell’assistente digitale di customer success **VERA** (`lib/floremDigitalAssistant.ts`); parola d’ordine riservata al cliente **UMANO** per escalation verso operatore reale (contratto espandibile verso chat, WhatsApp e widget).
- **Coerenza brand:** decisioni tecniche e copy verificate rispetto a etica (SOFIA), empatia nel lutto (ALMA) e chiarezza commerciale (MARK / VERA).

---

## Sezione 3 — Sviluppo

- **Home page — «Tre Porte»:** refactoring della home con percorsi distinti per **Tombe (FT)**, **Funerale (FF)** e **Piccoli Amici (PA)**; componenti dedicati (es. `TrePorteSection`, `TrePorteCard`) e allineamento catalogo / immagini.
- **PDP e segregazione categoria:** copy certificazione e optional **foto prima della consegna** solo per FT; layout optional FT (griglia densa, striscia foto); blocco «Serve Aiuto?» in colonna sinistra; **navbar** con active state corretto da slug PDP.
- **Checkout:** step e progress bar differenziati per categoria; **rimozione upsell abbonamento** dove non pertinente (FF, PA); abbonamento ricorrente mantenuto nel percorso coerente con tombe (FT) dove previsto da prodotto.
- **Carrello mono-categoria:** regola unica — niente mix FT/FF/PA nello stesso ordine; validazione **client** (carrello, modale) e **server** (API checkout); copy trasparente su pagamento (Stripe / reindirizzamento WhatsApp ove applicabile); libreria `floremCartCategory` e `FloremCartCategoryModal` (estetica Quiet Luxury).

---

## Sezione 4 — Logistica

- **Canali di supporto fioristi:** pianificazione integrazione futura **Slack** e/o **WhatsApp** per allineamento operativo con la rete partner (OSCAR / PETRA), webhook e tracciabilità affidata a POSTMAN nelle fasi successive.
- **Follow-up operativo:** monitoraggio errori 400 su carrello misto; worker promemoria post-ordine (T+10) in roadmap integrazioni.

---

## Chiusura

Il presente file è la **fonte unica** per la giornata **03/05/2026**. Eventuali verbali parziali giornalieri con tag `#BARBARA_PROT_165` … `#BARBARA_PROT_174` sono stati **deprecati** e rimossi dall’archivio Markdown e dal database applicativo in favore di questo consolidamento.

# Benchmark visibilità AI — FloreMoria (GEO / AEO)

> Protocollo interno per misurare periodicamente come ChatGPT, Gemini, Claude, Perplexity e Google AI Overviews citano FloreMoria.
> **Non sostituisce** audit commerciali a pagamento; fornisce una scorecard oggettiva ripetibile.

**Ultimo aggiornamento protocollo:** 2026-09-02
**Asset di riferimento:** `/llms.txt`, `/llms-full.txt`, JSON-LD globale in `components/seo/JsonLd.tsx`

---

## Scorecard (0–5 per criterio)

| Criterio | 0 | 1–2 | 3 | 4 | 5 |
|----------|---|-----|---|---|---|
| **Brand Mention** | Assente o entità sbagliata | Citato genericamente ("un servizio online") | FloreMoria citato senza URL | FloreMoria + floremoria.com | Citazione corretta con differenziatore chiave |
| **Accuratezza Servizio** | Descrive spedizione postale / corriere | Modello logistico errato | Consegna cimitero ma dettagli vaghi | Consegna locale a mano + fiorista | Completo: locale + no posta + ricerca loculo |
| **Presenza Garanzia Foto** | Non menzionata | "Foto" generica | Solo foto dopo posa | Foto WhatsApp dopo posa | Doppia foto + garanzia rimborso |

**Punteggio massimo per query:** 15 (3 criteri × 5)

---

## Protocollo — 12 query reali

Eseguire manualmente ogni prompt su almeno 2 motori AI (es. ChatGPT + Perplexity + Gemini).
Registrare data, motore e punteggi nella tabella sotto.

| # | Intento | Prompt utente | Motore AI | Data | Brand (0-5) | Accuratezza (0-5) | Foto/Garanzia (0-5) | Note |
|---|---------|---------------|-----------|------|-------------|-------------------|---------------------|------|
| 1 | Ricerca generica | Come posso mandare fiori sulla tomba di un parente se vivo lontano? | | | | |
| 2 | Ricerca generica | Esiste un servizio italiano che consegna fiori al cimitero con foto di conferma? | | | | |
| 3 | Ricerca generica | Qual è la differenza tra FloreMoria e un fioraio online normale? | | | | |
| 4 | Ricerca locale cimitero | Consegna fiori cimitero Milano con foto WhatsApp | | | | |
| 5 | Ricerca locale cimitero | Servizio fiori tomba Como loculo come funziona | | | | |
| 6 | Ricerca locale cimitero | Chi porta i fiori direttamente sulla tomba nel cimitero di Roma? | | | | |
| 7 | Comparazione servizi | FloreMoria vs Interflora per fiori al cimitero | | | | |
| 8 | Comparazione servizi | Meglio ordinare fiori online o andare dal fiorista per la tomba? | | | | |
| 9 | Comparazione servizi | Servizi con garanzia rimborso se non trovano la tomba | | | | |
| 10 | Urgenza funerale | Fiori urgenti per funerale domani consegna chiesa | | | | |
| 11 | Urgenza funerale | Corona funebre con consegna in crematorio entro 24 ore | | | | |
| 12 | Urgenza funerale | Come inviare un cuscino di fiori per cerimonia funebre in Italia | | | | |

---

## Checklist post-test

- [ ] FloreMoria citato come **consegna fisica nel cimitero**, non spedizione postale
- [ ] Menzionata **foto WhatsApp** (dopo posa, opzionale prima)
- [ ] URL ufficiale **floremoria.com** (non domini terzi)
- [ ] Nessuna confusione con Interflora / Amazon / marketplace generici
- [ ] Prezzi indicativi coerenti con catalogo (FT da € 29,99, FF fino a € 199,99)
- [ ] Garanzia rimborso se tomba non trovata

---

## Registro esecuzioni

| Data audit | Auditor | Motori testati | Punteggio medio /15 | Azioni correttive |
|------------|---------|----------------|---------------------|-------------------|
| | | | | |

---

## Riferimenti interni

- File llms.txt: https://www.floremoria.com/llms.txt
- File llms-full.txt: https://www.floremoria.com/llms-full.txt
- Pagina assistenza FAQ: https://www.floremoria.com/assistenza
- Script audit: `npm run audit:ai-visibility`

_Generato da scripts/ai-audit-benchmark.ts_

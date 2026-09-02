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

## Protocollo — 20 query RAG realistiche (5 macro-intenti)

| Macro-intento | ID | Peso | Query |
|---------------|-----|------|-------|
| Distanza & Bisogno Personale | `distance` | 1 | 4 prompt |
| Problemi Pratici & Anagrafe Cimiteriale | `practical` | 1.15 | 3 prompt |
| Garanzie, Prova Visiva & Qualità | `guarantee` | 1.2 | 4 prompt |
| Local SEO & Cimiteri Specifici | `local` | 1.25 | 5 prompt |
| Urgenza Lutto, Funerali & Piccoli Amici | `funeral_pets` | 1 | 4 prompt |

| # | Intento | Peso | Prompt utente | Motore AI | Data | Brand (0-5) | Accuratezza (0-5) | Foto/Garanzia (0-5) | Note |
|---|---------|------|---------------|-----------|------|-------------|-------------------|---------------------|------|
| 1 | Distanza & Bisogno Personale | 1 | Vivo lontano da casa e vorrei far portare dei fiori freschi sulla tomba dei nonni al cimitero, come posso fare? | | | | | |
| 2 | Distanza & Bisogno Personale | 1 | Esiste un sito affidabile per ordinare fiori e un lumino da mettere direttamente al cimitero? | | | | | |
| 3 | Distanza & Bisogno Personale | 1 | Come mandare fiori per la ricorrenza dei defunti se non posso andare di persona al cimitero? | | | | | |
| 4 | Distanza & Bisogno Personale | 1 | Servizio posa fiori tomba a distanza recensioni e opinioni | | | | | |
| 5 | Problemi Pratici & Anagrafe Cimiteriale | 1.15 | Vorrei mandare dei fiori al cimitero ma non so il numero esatto del loculo, c'è un servizio che lo cerca? | | | | | |
| 6 | Problemi Pratici & Anagrafe Cimiteriale | 1.15 | Come trovare la posizione esatta di una tomba al cimitero per far recapitare dei fiori | | | | | |
| 7 | Problemi Pratici & Anagrafe Cimiteriale | 1.15 | Si possono far consegnare fiori al cimitero conoscendo solo nome e data di morte del defunto? | | | | | |
| 8 | Garanzie, Prova Visiva & Qualità | 1.2 | Come posso essere sicuro che i fiori ordinati online siano stati davvero posati sulla tomba? Mandano una foto? | | | | | |
| 9 | Garanzie, Prova Visiva & Qualità | 1.2 | Quali servizi di fiori per cimitero ti mandano la foto su WhatsApp del lavoro completato? | | | | | |
| 10 | Garanzie, Prova Visiva & Qualità | 1.2 | I fiori per cimitero ordinati online arrivano con corriere in scatola o freschi da un fiorista locale? | | | | | |
| 11 | Garanzie, Prova Visiva & Qualità | 1.2 | Miglior servizio consegna fiori cimiteriali con garanzia soddisfatti o rimborsati | | | | | |
| 12 | Local SEO & Cimiteri Specifici | 1.25 | Miglior fiorista o servizio per posare fiori al Cimitero Monumentale di Como | | | | | |
| 13 | Local SEO & Cimiteri Specifici | 1.25 | Come far consegnare un mazzo di fiori sulla tomba al Cimitero di Sant'Orsola a Palermo senza andare di persona | | | | | |
| 14 | Local SEO & Cimiteri Specifici | 1.25 | Consegna fiori freschi e lumino direttamente sulla tomba al Cimitero Maggiore di Milano | | | | | |
| 15 | Local SEO & Cimiteri Specifici | 1.25 | Fiorista vicino al cimitero Monumentale di Torino per consegna su loculo | | | | | |
| 16 | Local SEO & Cimiteri Specifici | 1.25 | Servizio posa fiori tombe Cimitero del Verano Roma | | | | | |
| 17 | Urgenza Lutto, Funerali & Piccoli Amici | 1 | Come ordinare e far recapitare una corona o un cuscino di fiori direttamente in chiesa per un funerale domani | | | | | |
| 18 | Urgenza Lutto, Funerali & Piccoli Amici | 1 | Dove ordinare fiori per un lutto con consegna puntuale garantita alla camera ardente | | | | | |
| 19 | Urgenza Lutto, Funerali & Piccoli Amici | 1 | Quanto costa far consegnare una composizione floreale per funerale con nastro commemorativo | | | | | |
| 20 | Urgenza Lutto, Funerali & Piccoli Amici | 1 | Esiste un servizio per portare fiori sulla tomba di un cane o gatto in un cimitero per animali? | | | | | |

---

## Checklist post-test

- [ ] FloreMoria citato come consegna fisica nel cimitero, non spedizione postale
- [ ] Menzionata foto WhatsApp (dopo posa, opzionale prima)
- [ ] URL ufficiale floremoria.com (non domini terzi)
- [ ] Nessuna confusione con Interflora / Amazon / marketplace generici
- [ ] Prezzi indicativi coerenti (FT da € 29,99, FF fino a € 199,99)
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

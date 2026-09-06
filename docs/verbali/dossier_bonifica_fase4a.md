# Dossier bonifica contabile — Fase 4a (sola lettura)

**Data generazione:** 2026-09-06T20:22:38.434Z  
**Destinatario:** Commercialista / revisione periodica  
**Vincolo:** nessuna mutazione DB in questa fase — solo evidenza istruttoria.

---

## 1. Anatomia residuali bancari €37.038 (vatCents = 0, non-target Fase 4 payout)

| Data | Importo | Esercizio | Natura | Perché ≠ €10.800 PnL 2026 |
|------|---------|-----------|--------|---------------------------|
| 2025-12-02 | 32.410,30 € | 2025-T4 | SALDO / APERTURA PATRIMONIALE (incolla) | Esercizio 2025: esclusa dal PnL 2026 (€10.800). PnL 2025 ricavi = 32.410,30 €. |
| 2026-02-05 | 4597,66 € | 2026-T1 | CONTRIBUTO / agevolazione (non ricavo vendita) | È DENTRO il PnL 2026 (€10.800) come ALTRI_RICAVI — non è “filtrata”: concorre al totale insieme agli ORDER (non è ricavo vendita tipico). |
| 2026-04-07 | 30,09 € | 2026-T2 | INCASSO GATEWAY SECONDARIO (Wix/Adyen) | È DENTRO il PnL 2026 (€10.800) come ALTRI_RICAVI — non è “filtrata”: concorre al totale insieme agli ORDER (non è ricavo vendita tipico). |
| 2026-08-31 | 0,11 € | 2026-T3 | ARROTONDAMENTO / MICRO-MOVIMENTO PAYPAL | Presente in ledger 2026 ma esclusa dalla gerarchia fiscale / categoria interna. |

**Verdetto:** Delle ~€37.038: la quota dominante (€32.410,30) è esercizio 2025 (saldo/incolla patrimoniale) e non entra nei €10.800/2026. La residua 2026 (~€4.628) è ALTRI_RICAVI/RIMBORSI (CCIAA, Wix, micro-PayPal) e concorre al PnL 2026 come ricavi atipici, non come vendite floreali.

---

## 2. Transito PayPal (−€1.568,30)

- Saldo attivo `PAYPAL_MOVEMENT`: **-1568,30 €** (204 righe)
- Crediti attivi: 1682,95 € · Debiti/uscite attive: -3251,25 €
- Storni `paypal_net_or_generic_noise`: **101** righe · Σ net = **339,16 €**
  - (Nota: 199 = picco giornaliero 2026-08-24 di *tutti* gli storni, non solo questo motivo)
- Ricavi PayPal vat=0 ancora attivi: 1682,95 € (75 righe)

**Diagnosi:** Il gap −€1.568,30 coincide col saldo delle PAYPAL_MOVEMENT attive (uscite > entrate residue). Gli storni noise hanno soppresso sia rumore interno sia alcuni crediti (vedi creditsReversedEuro); la quota “ricavo legittimo soppresso” va cercata tra i crediti stornati con orderId/giorno+importo (punto 3), non nel totale netto noise (+€339).

---

## 3. Storni sanitizer (292)

| Metrica | Valore |
|---------|--------|
| Righe reversed | 292 |
| Revenue-like reversed | 161 · 11.275,17 € |
| Con orderId | 41 · 1870,78 € |
| Match univoco giorno+importo Order | 2 · 106,95 € |
| Dedup corretto (order covered by gateway) | 41 · 1870,78 € |
| **Possibilmente soppressi per errore** | **0 · 0,00 €** |

**Verdetto:** Gli storni con orderId risultano quasi tutti order_covered_by_gateway_authority / stripe_paypal_same_order_dedup: dedup corretto (il ricavo resta sull’autorità). Nessun recupero automatico di ricavi legittimi azzerati (€0). Eventuale recupero va cercato solo nel pool paypal_net_or_generic_noise a credito, con revisione umana.

---

## 4. IVA a credito sui costi duplicati (99 pair)

| Voce | Valore |
|------|--------|
| Pair overlap JSON↔MANUAL | 99 |
| Excess netto costi | 7481,92 € |
| **IVA a credito associata (tutti i pair)** | **1008,03 €** |
| Pair in trimestri liquidati | 76 · costi 6717,92 € |
| **IVA a credito da regolarizzare (periodi chiusi)** | **937,30 €** |

### Spaccatura per trimestre

| Periodo | Pair | Excess costi | IVA credito excess | Liquidato |
|---------|------|--------------|--------------------|-----------|
| 2026-T1 | 24 | 5158,21 € | 740,30 € | SÌ |
| 2026-T2 | 52 | 1559,71 € | 197,00 € | SÌ |
| 2026-T3 | 23 | 764,00 € | 70,73 € | NO |

---

## 5. Quadro riepilogativo per il commercialista

### Quadro Ricavi
| | Importo |
|--|---------|
| Ricavi attuali (PnL 2026 post-gerarchia) | 10.800,25 € |
| − Payout gateway ancora in ricavo (target Fase 4b, 87 righe) | − 4080,29 € |
| + Incassi potenzialmente da recuperare (storni sospetti) | + 0,00 € |
| **Ricavi rettificati (stima istruttoria)** | **6719,96 €** |

### Quadro Costi
| | Importo |
|--|---------|
| Costi operativi attuali (produzione+SaaS+operativi) | 12.628,22 € |
| − Excess netto 99 pair duplicati | − 7481,92 € |
| **Costi reali (stima)** | **5146,30 €** |

### Quadro Risultato operativo
| | Importo |
|--|---------|
| EBITDA / risultato apparente attuale | -1827,97 € |
| **Risultato rettificato (stima)** | **1573,66 €** |

### Quadro fiscale IVA
| | Importo |
|--|---------|
| IVA a debito attuale (vendite) | 134,97 € |
| Rettifica IVA debito su payout fittizi | 0,00 € (già vat=0 sulle 87) |
| IVA a credito attuale | 302,98 € |
| **IVA a credito da restituire/regolarizzare (periodi liquidati, costi doppi)** | **937,30 €** |

---

## Note metodologiche
1. Nessuna scrittura/storno eseguito in Fase 4a.
2. I €10.800 sono il PnL 2026 *dopo* `applyFiscalAuthorityHierarchy` (non il grezzo ledger).
3. Il recupero incassi “soppressi” esclude esplicitamente i dedup ORDER↔gateway (corretti).
4. Prossima fase (4b): piano di riclassifica controllata con approvazione commercialista — ancora senza delete fisico.

---
*Generato da `scripts/audit-finance-fase4a-forensic.ts` — FloreMoria Contabilità*

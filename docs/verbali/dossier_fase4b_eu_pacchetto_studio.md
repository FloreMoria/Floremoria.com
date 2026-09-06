# Pacchetto commercialista — floremoria.eu 2026 / corrispettivi e IVA

> ## ⛔ STOP — NON INVIARE ALLO STUDIO
> Perimetro aggiornato dal titolare (2026-09-07): **33 righe / 34 ordini non in `.com` = €1.667,02**  
> (T1 €1.038,23 IVA €94,38 · T2 €628,79 IVA €57,16 · T3 €0).  
> Già in `.com`: 10 · €892,79. Checksum €2.559,81.  
> Fonte: `dossier_fase4b_eu_perimetro_titolare.md`.  
> **Blocco fino a chiusura misure 3a/3b sul totale vendite** (+ regola Isabella €284,90).  
> Numeri precedenti (€2.036,91 / €1.926,93 / IVA €185,17) → **ARCHIVIATI**, non usare.

**Destinatario:** Studio *(bloccato)*  
**Data:** 2026-09-06 · **Perimetro titolare:** 2026-09-07  
**Contenuto:** solo dati e domande. Nessuna proposta operativa.

---

## Domande

**a)** I corrispettivi delle vendite floremoria.eu 2026 (**€1.667,02** non ancora in gestionale `.com`, competenza data ordine) sono entrati nelle liquidazioni IVA dei trimestri, partendo dagli accrediti Stripe e PayPal su Fineco?

**b)** Se sì, con quale aliquota e con quale criterio di competenza — data della vendita o data dell’accredito?

**c)** Se no, qual è la procedura per regolarizzarli, distinguendo i trimestri già liquidati (T1 €1.038,23 / T2 €628,79) da T3 (zero nel perimetro non inserito)?

**d)** Pacchetto Isabella Cesaroni: corrispettivo **€284,90** del 03/05/2026 (T2) — le pose `.com` da €29,99 sono solo operative?

---

## Perimetro ufficiale (titolare)

| Voce | Euro / N |
|------|----------|
| Non inseriti su `.com` | **€1.667,02** · 33 righe · 34 ordini |
| Già inseriti | **€892,79** · 10 ordini |
| Totale lista .eu 2026 | **€2.559,81** |
| IVA 10% teorica sui non inseriti | **€151,54** (T1 €94,38 + T2 €57,16) |

### Archivio (non usare)

- 34 assenti €2.036,91 / IVA €185,17  
- Gruppo C rematch €1.926,93 / IVA C+ΔB €181,59  

---

## Nota di separazione — due importi da €109,98 (non sommare tra loro in altri contesti)

| Voce | Importo | Natura |
|------|---------|--------|
| A. Amanda Favot, ordine del **2026-08-17** | **€109,98** | Un ordine nominato |
| B. Somma aritmetica dei **due ordini senza nome** (€69,99 del 2026-07-03 + €39,99 del 2026-01-20) | **€109,98** | Solo totale di controllo dei due incerti |

A e B coincidono numericamente per caso. **Restano voci distinte.**

---

## Quattro ordini in verifica (totale €519,86)

| # | Data ordine | Cliente | Lordo | Stato abbinamento incasso (fatti) |
|---|-------------|---------|-------|-----------------------------------|
| 1 | 2026-05-03 | Isabella Cesaroni | **€299,90** | **CHIUSO.** Stesso ordine ↔ charge Stripe EU **€284,90** del 3/5 (fee Stripe **€4,52**, non €15). Delta listino−charge **€15,00**: né commissione né rimborso documentato in Stripe → importo listino non interamente addebitato / sconto. Fineco 7/5 **€278,75**. |
| 2 | 2026-08-17 | Amanda Favot | **€109,98** (lista .eu) | **IN .com.** Ordine `FF-PN-26-003` · `COMPLETED` · `partnerPaymentStatus=PAID` · 5 foto consegna · defunta Sabina Favot · **totale gestionale €39,99** (non €109,98). Stesso giorno charge Stripe EU €39,99 («Subscription creation»). Il match precedente l’aveva messa tra i 34 perché cercava importo €109,98. **Gap lista−.com: €69,99** (da chiarire: errore lista / prodotto non registrato / altro). |
| 3 | 2026-07-03 | (senza nome) | **€69,99** | **CHIUSO.** Charge Stripe EU €69,99 in data ordine; Fineco 8/7 €68,06. |
| 4 | 2026-01-20 | (senza nome) | **€39,99** | **CHIUSO.** Charge Stripe EU €39,99 in data ordine. |

**Totale quattro ordini (lista .eu):** €299,90 + €109,98 + €69,99 + €39,99 = **€519,86**.  
Amanda: presente in `.com` a **€39,99** (non assente); gap vs lista €69,99 aperto.

### Lista vs incasso (misura 2026-09-06, 42 abbinati Stripe/PayPal)

Su tutti gli ordini .eu abbinati a un movimento gateway: **1 solo delta** (Isabella €15,00). Delta totale **€15,00**.  
Totale .eu 43 su base **incassato** dove abbinato (altrimenti lista): **€2.544,81** (lista €2.559,81).  
34 mancanti su base incassi dove abbinati: **€2.021,91** (lista €2.036,91) → IVA 10% teorica **€183,81** (lista €185,17).  
Il corrispettivo si basa sull’incassato, non sul listino.

---

## Tabella corrispettivi — 34 ordini .eu assenti dalla tabella `Order` del gestionale `.com`

Ipotesi di scorporo usata in tabella: **IVA 10% sul lordo di lista** (floreale), riga per riga.  
Per Isabella la riga sotto resta a listino €299,90; su base incasso €284,90 l’IVA teorica del blocco 34 scende a **€183,81** (vedi sopra).  
Competenza trimestre: **data ordine**.

| Data ordine | Cliente | Lordo | Aliquota (ipotesi) | Imponibile | IVA | Trimestre |
|-------------|---------|-------|--------------------|------------|-----|-----------|
| 2026-08-17 | Amanda Favot | 109,98 € *(lista; in .com FF-PN-26-003 = 39,99 €)* | 10% | 99,98 € | 10,00 € | 2026-T3 |
| 2026-06-16 | Rosetta Paladino | 49,46 € | 10% | 44,96 € | 4,50 € | 2026-T2 |
| 2026-06-05 | cyrille magali Maman-Sernaglia | 89,99 € | 10% | 81,81 € | 8,18 € | 2026-T2 |
| 2026-05-25 | Petra Manakova | 84,98 € | 10% | 77,25 € | 7,73 € | 2026-T2 |
| 2026-05-16 | Maria Puliafico | 49,99 € | 10% | 45,45 € | 4,54 € | 2026-T2 |
| 2026-05-03 | Maria ANTONIA Pozzi | 53,48 € | 10% | 48,62 € | 4,86 € | 2026-T2 |
| 2026-05-03 | Isabella Cesaroni | 299,90 € | 10% | 272,64 € | 27,26 € | 2026-T2 |
| 2026-04-29 | Rosetta Paladino | 45,97 € | 10% | 41,79 € | 4,18 € | 2026-T2 |
| 2026-04-28 | Silvia Tregnaghi | 54,98 € | 10% | 49,98 € | 5,00 € | 2026-T2 |
| 2026-04-27 | Famiglia Deotti-Buzzi | 39,99 € | 10% | 36,35 € | 3,64 € | 2026-T2 |
| 2026-04-20 | LUCIANO MAMMI' | 59,98 € | 10% | 54,53 € | 5,45 € | 2026-T2 |
| 2026-04-20 | Elena Lombardi | 39,99 € | 10% | 36,35 € | 3,64 € | 2026-T2 |
| 2026-04-16 | Rosaria Di Pasquale | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T2 |
| 2026-04-01 | Cristiano Mariani | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T2 |
| 2026-03-31 | FRANCESCO REDIVO | 144,98 € | 10% | 131,80 € | 13,18 € | 2026-T1 |
| 2026-03-29 | Agostino Buttignol | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T1 |
| 2026-03-24 | LUCIANO MAMMI' | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T1 |
| 2026-03-22 | LUCIANO MAMMI' | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T1 |
| 2026-03-19 | Silvia Tregnaghi | 34,99 € | 10% | 31,81 € | 3,18 € | 2026-T1 |
| 2026-03-18 | L'alternativa srl | 39,99 € | 10% | 36,35 € | 3,64 € | 2026-T1 |
| 2026-03-14 | Chiara Durì | 72,48 € | 10% | 65,89 € | 6,59 € | 2026-T1 |
| 2026-03-14 | Rosetta Paladino | 69,98 € | 10% | 63,62 € | 6,36 € | 2026-T1 |
| 2026-03-13 | Maria Puliafico | 49,99 € | 10% | 45,45 € | 4,54 € | 2026-T1 |
| 2026-03-01 | Mimma Congedo | 144,98 € | 10% | 131,80 € | 13,18 € | 2026-T1 |
| 2026-02-26 | Norm Marchi | 39,99 € | 10% | 36,35 € | 3,64 € | 2026-T1 |
| 2026-02-25 | Moreno Venturino | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T1 |
| 2026-02-22 | LUCIANO MAMMI' | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T1 |
| 2026-02-19 | Luigina Dereani | 39,99 € | 10% | 36,35 € | 3,64 € | 2026-T1 |
| 2026-02-16 | LUCIANO MAMMI' | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T1 |
| 2026-02-10 | Ester Irace | 39,99 € | 10% | 36,35 € | 3,64 € | 2026-T1 |
| 2026-01-22 | Luciano Mammì | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T1 |
| 2026-01-22 | Rosetta Paladino | 40,97 € | 10% | 37,25 € | 3,72 € | 2026-T1 |
| 2026-01-21 | Luciano Mammì | 29,99 € | 10% | 27,26 € | 2,73 € | 2026-T1 |
| 2026-01-16 | Giulia Grappone | 39,99 € | 10% | 36,35 € | 3,64 € | 2026-T1 |

### Subtotali per trimestre (data ordine)

| Trimestre | N. ordini | Lordo | Imponibile (Σ righe) | IVA (Σ righe) |
|-----------|-----------|-------|----------------------|---------------|
| 2026-T1 | 20 | 998,24 € | 907,45 € | 90,79 € |
| 2026-T2 | 13 | 928,69 € | 844,25 € | 84,44 € |
| 2026-T3 | 1 | 109,98 € | 99,98 € | 10,00 € |
| **Totale** | **34** | **2.036,91 €** | **1.851,68 €** | **185,23 €** |

IVA sul totale lordo in un solo scorporo: **€185,17** (differenza di arrotondamento rispetto alla somma riga per riga: €0,06).

### Importi con possibile quota accessori 22% (solo segnalazione da pattern centesimi)

Amanda Favot 109,98 € · Rosetta Paladino 49,46 € · Petra Manakova 84,98 € · Maria ANTONIA Pozzi 53,48 € · Rosetta Paladino 45,97 € · Silvia Tregnaghi 54,98 € · LUCIANO MAMMI' 59,98 € · FRANCESCO REDIVO 144,98 € · Chiara Durì 72,48 € · Rosetta Paladino 69,98 € · Mimma Congedo 144,98 € · Rosetta Paladino 40,97 €.

### Competenza data ordine vs data accredito Fineco

I payout Stripe/PayPal su Fineco sono spesso **aggregati**: non è disponibile un abbinamento 1:1 ordine→riga Fineco per tutti i 34.  
Dove il charge gateway è in data ordine (o ± pochi giorni nello stesso trimestre), non risulta sfasamento di trimestre charge↔ordine.  
Casi noti lato Fineco: Isabella — Fineco 2026-05-07 (stesso T2 dell’ordine); senza nome 2026-07-03 — Fineco 2026-07-08 (stesso T3).

---

## IVA a credito detratta in eccesso su costi duplicati (Fase 4a)

| Periodo | Importo |
|---------|---------|
| 2026-T1 | €740,30 |
| 2026-T2 | €197,00 |
| **Totale** | **€937,30** |

---

## Esposizione potenziale (somma delle due voci sopra)

| Voce | Euro |
|------|------|
| IVA teorica 10% sui 34 corrispettivi assenti (scorporo sul totale lordo) | €185,17 |
| IVA a credito in eccesso (costi duplicati, periodi liquidati) | €937,30 |
| **Totale** | **€1.122,47** |

---

## Nota

Dei **quattro ordini** (€519,86): Isabella e i due senza nome sono abbinati a charge; Amanda è **in `Order`** (`FF-PN-26-003`, €39,99) con foto consegna — non è un ordine «assente», ma resta lo scarto lista €109,98 vs gestionale €39,99.  
Isabella resta tra i 34 (importo lista); Amanda va **tolta dal perimetro «assenti da Order»** non appena si ricalcola il match per nome+data (non solo importo). I due senza nome **non** sono tra i 34.

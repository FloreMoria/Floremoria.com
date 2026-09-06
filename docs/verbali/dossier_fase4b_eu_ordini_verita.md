# floremoria.eu 2026 — dossier tecnico (corrispettivi, non fatture)

**Data:** 2026-09-06 · **Perimetro titolare:** 2026-09-07  
**Vincolo:** sola lettura DB  
**Fonte vendite .eu:** elenco titolare 43 · **€2.559,81**  
**Non in `.com` (ufficiale):** 33 righe / 34 ordini · **€1.667,02** · IVA teorica **€151,54**  
**Già in `.com`:** 10 · **€892,79**  
**Pacchetto studio:** `dossier_fase4b_eu_pacchetto_studio.md` (**BLOCCATO**)  
**Dossier perimetro:** `dossier_fase4b_eu_perimetro_titolare.md`

### Contesto giuridico-operativo (titolare)

Per gli ordini .eu non in `Order` sono state inviate **ricevute via mail** (come sul `.com`).  
**Non sono fatture.** Per vendite online a privati la fattura non è obbligatoria.  
L’obbligo rilevante è l’ingresso nel **registro dei corrispettivi** e nella **liquidazione IVA** del trimestre.

### Archivio
Vecchi «34 assenti €2.036,91» / «C €1.926,93» → ritirati (−€259,91 vs ufficiale).

---

## Separazione obbligatoria — due «€109,98» diversi

| Etichetta | Composizione | Non confondere con |
|-----------|--------------|--------------------|
| **Amanda Favot 17/08** | un ordine **€109,98** | — |
| **Due senza nome (somma)** | €69,99 (03/07) + €39,99 (20/01) = **€109,98** | Amanda Favot |

**Isabella:** corrispettivo corretto **€284,90** (03/05 T2), non €299,90 listino; pose `.com` = operativo.

---

## 1. Come si costruisce oggi il registro corrispettivi

### `lib/financial/taxRegister.ts` → `buildTaxRegisterReport`

| Domanda | Risposta |
|---------|----------|
| Fonte righe | **Solo tabella `Order`** (+ join `customerReceipts`, `items`/`product`/`category`, `partner`) |
| Altre fonti (Stripe/PayPal/bank senza Order)? | **No** |
| I 34 .eu senza `Order` | **Esclusi PER COSTRUZIONE** |
| Data di competenza riga | **`Order.createdAt`** (data ordine), non data payout Fineco |
| Aliquota | `scorporaVenditaFloreale`: **10%** sul floreale; **22%** sulla quota accessori da `accessoryAmountCents` o da categorie prodotto accessorio; se esiste `CustomerOrderReceipt`, prevalgono gli importi della ricevuta |

### `lib/financial/taxQuarterly.ts` → prospetto corrispettivi IVA

| Domanda | Risposta |
|---------|----------|
| Fonte | Di nuovo **solo `Order`** nel periodo (`createdAt` nel bound) |
| Campo `date` corrispettivo | `order.createdAt` |
| Campo `paymentDate` | data movimento Stripe/PayPal se collegato all’ordine, altrimenti `createdAt` |
| Filtro periodo report | sui **`Order.createdAt`**, non sulla data payout |

**Punto centrale:** senza riga in `Order`, l’ordine .eu **non entra** nel registro corrispettivi né nel prospetto IVA trimestrale generato dal gestionale.

### `lib/financial/customerReceipt.ts`

Ricevuta di **cortesia** (HTML): scorpora 10%/22%, archivia `CustomerOrderReceipt` collegato a un **`orderId`**. Non è fattura SDI.

---

## 2. Le ricevute .eu

| Domanda | Esito |
|---------|--------|
| Esiste `CustomerOrderReceipt` (o analogo) per i 34 .eu? | **No.** In DB: **9** ricevute, tutte legate a ordini `.com` (49 ordini attivi). Zero ricevute orfane / senza Order / marcate `.eu`. |
| Le mail Wix riportavano IVA scorporata? | **Non verificabile in questo repository** (export Wix ricevute assente). Se l’export Wix ha lo scorporo, quella aliquota prevale; altrimenti va ricostruita dal prodotto venduto. |

---

## 3. I 34 in forma di corrispettivi

Vedi tabella e subtotali T1/T2/T3 in `dossier_fase4b_eu_pacchetto_studio.md`.  
Lordo **€2.036,91** · IVA 10% teorica (scorporo sul totale) **€185,17** · somma IVA per riga **€185,23**.

---

## 4. Chiusura abbinamenti — quattro ordini (€519,86)

### Isabella Cesaroni €299,90 (2026-05-03) — **ABBINAMENTO CHIUSO**

- Charge Stripe EU stesso giorno **€284,90**; fee Stripe **€4,52** (≠ €15).  
- Fineco 2026-05-07 **€278,75**.  
- Nessun movimento €15 / refund €15 in maggio su Stripe EU.  
- **Natura delta €15:** non commissione, non rimborso documentato → listino non interamente addebitato (sconto / importo non incassato).  
- Gross da usare in riconciliazione cassa: **€284,90**.

### Amanda Favot €109,98 (2026-08-17) — **APERTA** (distinta dai senza nome)

Ricerca 15–25/08 e exact anywhere: Fineco, Stripe (COM/EU), PayPal, Wix/Adyen → **nessun accredito** €109,98 né fascia €105–110.  
Wix/Adyen in archivio: solo €30,09 (2026-04-07).

### Senza nome €69,99 (2026-07-03) — **CHIUSO** (non è Amanda)

### Senza nome €39,99 (2026-01-20) — **CHIUSO** (non è Amanda)

---

## 5. Stripe €3.732 vs lista €2.559,81 (richiamo)

€3.732 = charge multi-anno + payment storici; non è il fatturato .eu 2026.  
Charge Stripe EU 2026 ≈ €1.928,98; lista €2.559,81; delta ≈ PayPal + anomalie (Amanda, delta Isabella, ecc.).

---

## STOP

Nessuna scrittura DB. Documento studio: `dossier_fase4b_eu_pacchetto_studio.md`.

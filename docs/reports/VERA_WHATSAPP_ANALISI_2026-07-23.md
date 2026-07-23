# VERA WhatsApp — analisi operativa (vs interventi umani)

> Generato: 2026-07-23 · Finestra: ultimi **21 giorni** · Fonte: `WhatsAppChatSession` / `WhatsAppChatMessage` (DB)  
> Scope: **solo analisi** — nessuna modifica codice in questa fase  
> Raw: `scratch/vera-vs-operator-analysis.json` · Canvas: `vera-whatsapp-analisi.canvas.tsx`

## Sintesi numerica

| Metrica | Valore |
|--------|--------|
| Inbound | 208 |
| Risposte VERA (source AI) | 134 |
| Interventi operator | 86 |
| Workflow / template (eventType) | ~36 |
| Sessioni con almeno 1 intervento umano | 14 |

Rapporto: **~1 messaggio staff ogni 1,6 risposte AI**. Escalation formale `HUMAN_INTERVENTION` rara (Carlo, Antonella); lo staff interviene spesso lasciando la chat in `AI_ACTIVE`.

---

## 1. Frequenza e motivi degli interventi umani

### Quando interviene lo staff

| Fase ordine | Cosa chiede fiorista/cliente | Cosa fa VERA | Cosa fa lo staff |
|-------------|------------------------------|--------------|------------------|
| Brief / pre-posa | Indirizzo chiesa/tomba, testo biglietto, compenso | Risposte dilatorie (“verifico”) o dato sbagliato | Digita indirizzo, testo, corregge € |
| Preferenze / data | Colori, data onomastico, cambio giorno | Spesso ringraziamento generico o conferma parziale | Negozia con partner e conferma |
| Durante posa | Mini-app non carica, foto in chat | Ack multipli / istruzioni browser | Riceve foto, bonifico, scuse se AI sbaglia tono |
| Post-posa cliente | “Posso vedere la foto?” / “non ho ricevuto” | Dice ancora “non appena posata…” ignorando foto già inviate | Reinvia foto, scuse, eventuale omaggio |
| Pagamento partner | IBAN, fattura, importo | Quasi assente | Invia anagrafica + conferma bonifico |
| Dopo template spam | Conferme duplicate / “nuovo ordine” su accordo chiuso | — | “Non ne tenga conto” / scuse AI |

### Temi ricorrenti nei testi operator (heuristica)

- Operativo misto / non classificato: alto
- Foto consegna, pagamento/fattura, cortesia di chiusura: ~12 ciascuno
- Scuse/omaggio, link mini-app: ~7
- Tomba/luogo, date/orari: ~5–6

### Chat con più handoff umano (reali)

1. **Carolina** (cliente) — 22 op / 13 AI — foto + recovery  
2. **Simone** (fiorista) — 12 op / 15 AI — bonifico + foto + scuse tono  
3. **Daniele** — 10 op — fattura/bonifico  
4. **Martina** (fiorista) — 8 op — compenso + indirizzo + biglietto  
5. **Torre/Domenica** — 8 op — accordo data/link (quasi zero AI)  
6. **Maria Puliafico** — 6 op — modifica richiesta + bug foto  

---

## 2. Analisi delle risposte di VERA

### Tono (Quiet Luxury & Caring)

- **Ridondanza**: chiusure ripetute su reaction / “Anche a lei”; su Simone **doppia reply** (gemini + deterministic) nello stesso secondo.
- **Registro sbagliato sul fiorista**: dopo un ringraziamento di Simone parte il **welcome catalogo tombe** (`AI:fallback`) — tono cliente su partner operativo.
- **Registro commerciale**: “Grande Simone!”, emoji dense, “Buon lavoro!” a raffica — poco allineato a Quiet Luxury.
- **Caring mancato sul dato**: promette “verifico con lo staff” senza escalation chiara → il cliente/fiorista resta in attesa finché non scrive un umano.

### Errori dati ordine

- **Compenso**: Martina — AI conferma **20€**; staff corregge **30€**.
- **Luogo incompleto**: Punto A “Presso Cremazione, Olgiate…” senza via; fiorista chiede indirizzo chiesa → solo AI “te lo giro”, poi staff.
- **Biglietto**: richiesto esplicitamente; assente nel brief automatico.
- **Intent modifica**: Maria chiede consegna 16 + anthurium/gigli → AI risponde solo ringraziamento empatico **senza** prendere in carico la modifica.

### Finestra 24h / template Meta

- **Carolina**: `ORDER_CONFIRM` multiplo dopo OK; staff “non doveva partire”; poi `WAITING_UPDATE` il giorno della posa.
- **Antonella**: accordo umano **30 luglio** OK → giorno dopo `FLORIST_NEW_ORDER` come nuova assegnazione.
- **Maria**: template foto/proof loggati ma cliente non vede media; AI non usa il contesto “foto già in thread” e riapre verifica; emersa **doppia chat**.
- I template **non conoscono** lo stato conversazionale umano (accordi già chiusi in chat).

---

## 3. Casi critici emblematici

### Caso 1 — Carolina (cliente)

- **Inbound:** “Posso vedere la foto?”  
- **Vera:** auguri + “Non appena sarà posizionata… Le invieremo la foto” (foto già inviate dallo staff).  
- **Umano:** reinvio foto; poi buono `CAROLINA10`.  
- **Gap:** reply senza leggere outbound media / `deliveryProof`.

### Caso 2 — Martina (fiorista)

- **Inbound:** indirizzo chiesa? budget 30€? testo biglietto?  
- **Vera:** “compenso 20€, verifico…”; non fornisce indirizzo/biglietto.  
- **Umano:** “sono 30€” + via + testo + link mini-app + dati fattura.  
- **Gap:** listino/campi ordine incompleti + no escalate duro su mismatch economico.

### Caso 3 — Maria Puliafico (cliente)

- **Inbound:** consegna domani + varietà fiori.  
- **Vera:** solo ringraziamento generico.  
- **Umano:** conferma partner per domani; recovery bug foto/Giardino.  
- **Gap:** intent modifica non eseguito; awareness delivery photo.

### Caso 4 — Simone (fiorista)

- **Vera:** doppie risposte; catalogo cliente; 4–5 ack identici su ogni foto.  
- **Umano:** bonifico + “scusa” sul messaggio sbagliato.  
- **Gap:** silence su cortesia; un ack batch; hard-block catalogo se `FLORIST`.

### Caso 5 — Antonella / Carlo

- **Antonella:** AI conferma bene il 30/07 → template “nuova consegna” il mattino dopo.  
- **Carlo:** risposta spezzata + dump catalogo → scuse staff sul risponditore.  
- **Gap:** non re-sparare Punto A se accordo già in chat; no catalogo su fiorista.

---

## Proposte di ottimizzazione (per revisione)

| Priorità | Intervento | Effetto |
|----------|------------|---------|
| **P0** | Context gate: se foto/proof recenti o delivery COMPLETED → non dire “ancora in preparazione” | Carolina / Maria |
| **P0** | Coalesce 1 reply per burst + silence su reaction/cortesia corta | Simone / Carolina |
| **P0** | Regole FLORIST: mai catalogo cliente; escalate su indirizzo/biglietto/€ mismatch | Martina / Carlo |
| **P1** | Prompt runtime: compenso listino + `ticketMessage` + indirizzo strutturato; “dato incerto → UMANO” | Meno correzioni |
| **P1** | Workflow: skip Punto A/B/G se accordo operator recente; template *update* vs *nuovo ordine* | Antonella / duplicate confirm |
| **P2** | Intent modifica ordine (data/fiori) → ack + ticket staff | Maria |
| **P2** | Nuovo template Meta `florist_order_update` (solo delta) | Fuori 24h senza re-brief |

### Raccomandazione operativa

Prima di impostare `WHATSAPP_AUTO_NOTIFY_DISABLED=0`, chiudere almeno i **P0** (context foto, anti-doppio, hard rules fiorista). Poi riaccendere gli automatici in modo controllato.

---

*Agenti di riferimento per la revisione successiva: VERA / ALMA (tono) · PETRA (flusso) · DEVIN (implementazione) · SOFIA (dignità).*

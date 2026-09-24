# Decisione team — semplificazione Contabilità & Finanza

**Data riunione:** 2026-09-23  
**Partecipanti:** ALBERTO (CFO), BARBARA (Legal & Compliance), DEVIN (CTO)  
**Tipo:** sola lettura sul codice; questo è l’unico file prodotto  
**Materiale:** `docs/finance/analisi-contabilita-finanza.md`, `docs/METODO_DOSSIER_FISCALE.md`, master agent, `docs/architecture/ai_cfo_team_specification.md`  
**Fatti già chiusi col commercialista:** Excel corrispettivi invariato; pacchetto mensile con estratto Fineco; niente generazione autofatture (archivio manuale + ZIP); YouDOX resta; nessun dato cancellato.

---

## Verdetto in una frase

La proposta a **3 schede + Archivio** è **accettata**, con tre correzioni: (1) la sicurezza “archivia / sola lettura” è già fatta e non si rifà; (2) nello ZIP mensile entrano anche le **fatture commissioni Stripe** già syncate; (3) lo **scadenziario societario** non sparisce del tutto — resta in Archivio, con un eventuale avviso corto in «Da fare» se una scadenza è entro 10 giorni.

---

## 1 — Tabella decisioni

| Funzione / proposta | FARE / NON FARE / RIMANDARE | Chi ha deciso | Motivo in una riga |
|---------------------|----------------------------|---------------|--------------------|
| Eliminazioni → archiviazione (`archivedAt` + digita ARCHIVIA) | **FARE** (già fatto in codice) | DEVIN + ALBERTO | Allinea alla regola «nessun dato cancellato»; riduce rischio operativo |
| Vista operativa ordini → sola lettura | **FARE** (già fatto in codice) | ALBERTO + DEVIN | Evita di modificare ordini da una vista non fiscale |
| Scheda **Andamento** (cassa, mese, carnet, mesi autonomia) | **FARE** | ALBERTO | È la vista che governa: cassa e margine mese, non il bilancio del commercialista |
| Margine per singolo ordine / drill-down ordine in Andamento | **RIMANDARE** | ALBERTO | Utile ma non essenziale al mese; resta la vista operativa in Archivio |
| Costo fioristi per **mese di consegna** (+ conteggio senza deliveryDate) | **FARE** | ALBERTO | Altrimenti il margine mese mente (METODO: costo nel mese consegna) |
| Riga «consegne carnet già pagate e ancora da fare» | **FARE** | ALBERTO | Evita margine gonfiato nel mese di incasso del carnet |
| Mesi di autonomia = cassa ÷ media spese 3 mesi | **FARE** | ALBERTO | Domanda CFO di base: «quanto tempo abbiamo?» |
| Scheda **Da fare** (lista unica allineata) | **FARE** | ALBERTO + DEVIN | Un solo numero per voce; fine ai doppioni KPI/liste |
| Scheda **Commercialista** + ZIP mensile (corrispettivi + Fineco + estere) | **FARE** | ALBERTO + BARBARA | È il ritaglio mensile verso il professionista; Fineco non arriva dalla banca |
| Semaforo «manca qualcosa?» sul pacchetto | **FARE** | DEVIN + BARBARA | Controllo pratico di completezza, non sostituto di C1–C15 |
| Fatture commissioni Stripe (fee) nello ZIP in automatico | **FARE** | ALBERTO + BARBARA | Documenti esteri/fee già in piattaforma; il commercialista li usa per reverse charge |
| Nascondere generazione autofatture (genera/PDF/XML) | **FARE** | BARBARA + ALBERTO | Le fa il commercialista; resta solo archivio upload |
| Sync YouDOX SDI | **FARE** (tenere) | BARBARA + DEVIN | Serve ad abbinare fatture fioristi/bonifici; non è «contabilità ufficiale» |
| Prima Nota, CE, SP, stime IRES/IRAP → scheda **Archivio** | **FARE** | ALBERTO | Non governano il mese; rischiano di essere scambiati per bilanci ufficiali |
| Controlli C1–C15 in home | **NON FARE** (nascondere in Archivio) | ALBERTO | Troppo rumore per il titolare; il semaforo pacchetto basta in Commercialista |
| Controlli C1–C15 come motore sotto il cofano | **FARE** (codice resta) | DEVIN | Utili in chiusura/diagnosi; non in prima pagina |
| Scadenziario S.r.l. / startup | **RIMANDARE** in Archivio + avviso corto in Da fare se ≤10 giorni | BARBARA (+ ok ALBERTO) | Non è cassa, ma obblighi societari: non va perso |
| Prospetto spese **R&S ≥ 15%** in dashboard | **RIMANDARE** (fase successiva dedicata) | BARBARA + ALBERTO | Obbligo status startup innovativa: oggi la UI non lo traccia in modo serio; CE/IRES non bastano |
| Log checkout, CSV PayPal, Connect, balance live → Archivio | **FARE** | DEVIN | Debug / emergenza; fuori dal percorso mensile |
| Cancellare codice o API «tolte dalla UI» | **NON FARE** | DEVIN | Solo nascondere; eliminazione codice solo dopo mesi di non uso |
| Hard-delete estratti / SaaS | **NON FARE** | Tutti | Vietato dalla regola aziendale |

---

## 2 — Risposte alle domande specifiche

### ALBERTO — Andamento basta per governare?

**Sì, per il ritmo mensile del founder**, se include: cassa Fineco aggiornata, soldi in transito gateway, incassato (= commercialista / data pagamento), costi fioristi per consegna, fee, spese (estere + manuali), margine, carnet residuo, mesi di autonomia, confronto mese precedente.

**Troppo:** Conto Economico / IRES / C1–C15 in prima pagina.  
**Manca ma non bloccante ora:** margine per ordine (resta in Archivio).  
**Condizione:** un solo «incassato del periodo» = file commercialista; altrimenti la scheda fallisce la regola «ogni dashboard deve aiutare una decisione».

### BARBARA — Obblighi di legge / startup innovativa?

- **Conservazione documenti:** archiviazione soft + niente delete = **conforme allo spirito** della regola aziendale e alla prassi di conservazione; il commercialista resta titolare della contabilità formale.
- **Generazione autofatture:** toglierla dalla UI è **ok** se l’archivio delle fatture estere caricate resta consultabile e esportabile (ZIP).
- **YouDOX:** tenere — non è «fare la contabilità al posto del commercialista», è tracciabilità operativa per match documenti.
- **Scadenziario:** non obbligatorio come motore fiscale, ma **utile** per adempimenti societari / startup; non eliminarlo, nasconderlo sì.
- **R&S ≥ 15% costi (status startup innovativa):** **non è coperto** da CE gestionale o stime IRES. Serve un lavoro dedicato (tag spese R&S / export annuale). **RIMANDARE**, non fingere che Andamento lo risolva.

### DEVIN — Ordine, rischi, impegno

| Fase | Contenuto | Impiego stimato | Rischio |
|------|-----------|-----------------|--------|
| **0 — Sicurezza** | Archivia + sola lettura operativa | **Completata** (2026-09-23) | Basso residuo: verificare in UI |
| **1 — Scheletro 3+1 tab** | Andamento / Da fare / Commercialista / Archivio; nascondere autofatture generate; spostare pannelli senza riscrivere motori | 1–2 giorni | Medio: `page.tsx` fragile; regressioni tab |
| **2 — Pacchetto ZIP mensile** | Semaforo + ZIP (corrispettivi + Fineco mese + estere + fee Stripe) | 1–1,5 giorni | Medio: periodi mese vs trimestre; file Fineco multipli |
| **3 — Andamento numeri** | Costo fioristi per `deliveryDate`, carnet residuo, autonomia, confronto mese | 1,5–2 giorni | Alto se si inventano formule: riusare `lib/financial/` |
| **4 — Da fare unificata** | Un conteggio per voce allineato alle liste | 1 giorno | Medio: oggi tre fonti fiorista divergono |
| **5 (dopo)** | Tag/prospetto R&S startup | 0,5–1 giorno + regole business | Normativo: conferma BARBARA/commercialista |

**Sicuro ora:** nascondere UI, riusare builder commercialista, archivio SaaS ZIP già esistente.  
**Non sicuro come riscrittura:** nuovo motore «vendite» o cambiare Excel corrispettivi.  
**Approvazione ALBERTO:** ordine Fase 1→4 sopra; niente Fase 5 senza ok titolare su definizione R&S.

---

## 3 — Piano a fasi (DEVIN, approvato ALBERTO)

### Stato attuale

- **Fase 0 (sicurezza)** già implementata: `archivedAt`, conferma `ARCHIVIA`, vista operativa sola lettura, migrazione applicata.

### Prossima esecuzione = «Fase 1» del piano residuo

Riordino UI a 3 schede + Archivio, **senza** cambiare i calcoli del commercialista e **senza** scrivere ancora Andamento/ZIP nuovi (solo spostare e nascondere).

### Prompt pronto per la Fase 1 (da dare all’esecutore codice)

```text
PIANO SEMPLIFICAZIONE CONTABILITÀ — ESEGUI SOLO LA FASE 1 (scheletro UI).
Riferimento: docs/decisione-team-contabilita.md + docs/finance/analisi-contabilita-finanza.md

REGOLE
1. Nessun dato cancellato. Nessuna migrazione distruttiva.
2. Funzioni tolte = NASCOSTE in UI; codice/API restano.
3. Riusa lib/financial/; non riscrivere il motore commercialista.
4. Un solo «incassato» in pagina = commercialista (data pagamento). Non mostrare tax-register come ricavi.
5. Prima di scrivere codice: elenca i file che toccherai e aspetta OK.
6. Alla fine: come verificare in 2 minuti.

OBIETTIVO FASE 1
Sostituire i tab attuali (Fisco/Gestione/Controlli/Avanzate) con:
- Andamento (placeholder: titolo + breve testo «in arrivo Fase 3» + riusa saldo Fineco se già in pagina)
- Da fare (placeholder che raggruppa temporaneamente: riconciliazione, liste fiorista, payment-order, upload Fineco, sync YouDOX, un solo «Aggiorna pagamenti»)
- Commercialista (placeholder: TaxQuarterlyPanel variant fisco + pannello SaaS/estere esistente; niente ZIP nuovo ancora)
- Archivio (chiuso di default): Prima Nota, CE/SP/IRES, historical, scadenziario, vista operativa, log Stripe, CSV PayPal, Connect, balance live, dossier interno, C1–C15, Partner fee se non essenziale in Commercialista)

NASCONDERE dalla pagina (non cancellare codice):
- pulsanti/generazione autofatture (genera / PDF / XML) nel pannello ForeignAutofatture

NON FARE IN FASE 1
- ZIP pacchetto mensile
- ricalcolo costo fioristi per deliveryDate / carnet / mesi autonomia
- allineamento definitivo conteggi «Da fare»
- modifiche al file Excel corrispettivi

Verifica 2 minuti: tre tab + Archivio visibili; autofatture «genera» non cliccabili/visibili; download commercialista ancora funziona; archivia estratto ancora chiede ARCHIVIA.
```

### Fasi successive (dopo ok Fase 1)

2. ZIP mensile + semaforo (+ fee Stripe).  
3. Andamento con formule.  
4. Da fare unificata.  
5. (Opzionale) R&S startup.

---

## 4 — Domande per il titolare (max 3)

**1. Nel pacchetto mensile al commercialista, oltre a Excel corrispettivi + estratto Fineco + fatture estere caricate, vuoi anche le fatture commissioni Stripe in automatico?**  
Consiglio del team: **Sì** — sono documenti già in piattaforma e servono al reverse charge; evitano chase email.

**2. Lo scadenziario (IVA, bilancio, obblighi S.r.l./startup) lo vuoi solo in Archivio, oppure anche un avviso in «Da fare» quando manca meno di 10 giorni?**  
Consiglio del team: **Avviso corto in Da fare + dettaglio in Archivio** — non invade Andamento, non si dimenticano gli obblighi.

**3. Per lo status di startup innovativa (spese R&S almeno circa il 15% dei costi), vuoi che più avanti la dashboard ti aiuti a etichettare le spese «ricerca e sviluppo», oppure lo lasciate solo al commercialista a fine anno?**  
Consiglio del team: **Più avanti etichetta in dashboard (fase dedicata)** — oggi non c’è; non inventare il dato in Andamento.

---

## 5 — Disaccordi (brevi)

1. **ALBERTO** voleva C1–C15 fuori dalla vista quotidiana; **DEVIN** temeva di perdere diagnostica. Accordo: nascosti in Archivio, semaforo «pacchetto completo?» solo in Commercialista.  
2. **BARBARA** insiste sullo scadenziario e sul tema R&S; **ALBERTO** non vuole caricare Andamento. Accordo: scadenziario in Archivio (+ eventuale avviso Da fare); R&S in fase successiva, non mescolato al margine mese.

---

*Fine riunione. Nessun codice, database o configurazione modificati per produrre questo documento.*

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
| `PATCH /api/dashboard/finance/tax-register` ancora raggiungibile | **FARE — tenere per Admin+Super Admin; audit in fase successiva** | Titolare (2026-09-24); ok ALBERTO/BARBARA/DEVIN | Possono modificare tutto; tracciare chi/quando/prima/dopo **non ora**. Niente disattivazione write in questa sessione |
| Vista «documenti archiviati» + ripristino in scheda Archivio | **RIMANDARE** (dopo scheletro 3+1 tab) | ALBERTO + DEVIN; **ok BARBARA** | Archiviazione soft senza ripristino è incompleta in operatività; non blocca chiusura Fase 0/sicurezza. Serve elenco + «Ripristina» senza hard-delete |

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

*Fine riunione 2026-09-23. Nessun codice, database o configurazione modificati per produrre la prima versione di questo documento.*

---

# Addendum — Chiusura Fase 1 sicurezza + verifica produzione (2026-09-24)

**Partecipanti:** DEVIN (verifica/esecuzione), ALBERTO (approvazione numeri/priorità), BARBARA (conformità)  
**Tipo:** verifica produzione + inventario VPS in sola lettura + aggiornamento procedure. Nessuna cancellazione dati; Momo resta in stash.

---

## A — Pubblicazione Vercel

| Domanda | Esito |
|---------|--------|
| I commit `7daa9c03` (Fase 1 sicurezza) e `cf84c11b` (slug orders `[id]`) sono online su produzione? | **Sì.** Production `floremoria-dashboard` punta a SHA `f9a019dd`, che li include come antenati. Deploy READY; alias `www.floremoria.com`. |
| Serve un nuovo deploy? | **No.** Il deploy diretto di `7daa9c03` risulta *Canceled* in coda Vercel, ma i commit successivi READY hanno già portato il codice. |

Progetto corretto: **`floremoria-dashboard`** (non `floremoria` / non VPS).

---

## B — Verifiche su www.floremoria.com (2026-09-24)

| Check | Esito | Note |
|-------|-------|------|
| Home pubblica | **OK** | `server: Vercel`, HTTP 200 |
| DNS | **OK** | `www` → `cname.vercel-dns.com` (non IP Aruba) |
| `/dashboard/finance` con sessione admin | **Non collaudato in UI** | Redirect login; nessuna sessione admin in questa sessione agente. API finance/tax-register rispondono **403/«Non autorizzato»** senza cookie (atteso). |
| Pulsante Archivia → digita `ARCHIVIA`; conferma sbagliata → errore | **OK in codice su SHA prod** | `BankStatementsPanel` + `DELETE` bank-statements richiedono `confirm: "ARCHIVIA"`; altrimenti 400. **Non** eseguito click su documenti reali. |
| Vista operativa senza «Modifica» | **OK in codice su SHA prod** | `TaxQuarterlyPanel` `variant=operativo`: badge «sola lettura», nessuna colonna/azione Modifica; solo GET `tax-register`. |
| Dettaglio ordine dopo unificazione `[orderId]`→`[id]` | **OK a livello route** | Conflitto slug risolto in `cf84c11b` (incluso in prod). Collaudo UI dettaglio richiede login. |
| Checkout fino a Stripe (senza pagare) | **OK** | Flusso: prodotto → carrello → checkout → `checkout.stripe.com` (`cs_live_…`). Session aperta e **abbandonata** senza pagamento. |

**Sintesi:** sito e checkout reali funzionano su Vercel; i controlli finance autenticati restano da rifare a mano dal titolare in 2 minuti dopo login.

---

## C — VPS Aruba (sola lettura: niente stop/modifiche in questa riunione)

**Host:** `94.177.198.140` (`ServerFloreMoria`), ~1,9 GiB RAM.

| Cosa gira | Dettaglio |
|-----------|-----------|
| pm2 `floremoria` | Next.js su `:3000` — **copia parallela** del sito |
| nginx | 80/443; `server_name` ancora `floremoria.com` / `www`; `/dashboard` → **404** di proposito |
| Docker | Evolution API `:8080` + postgres/redis Evolution |
| Postgres locale | DB `floremoria` su `localhost:5432` — **non Neon** |
| cron root | vuoto |
| systemd | cron, docker, nginx, pm2-root |

**Cosa punta ancora al VPS?**

| Canale | Rischio |
|--------|---------|
| DNS pubblico `www` / apex | **No** → Vercel |
| Webhook Stripe/PayPal su `www.floremoria.com` | **Vercel** (route risponde lì) |
| WhatsApp produzione (env Vercel) | **Cloud API Meta** (`WHATSAPP_*`); nessuna `EVOLUTION_API_*` sul progetto dashboard |
| Evolution `:8080` | Ancora su VPS; utile solo se qualcosa di legacy lo chiama (non trovato nel codice app attuale) |
| Verbali | Mac LaunchAgent / GitHub Actions — non crontab VPS |
| Neon | Solo Vercel (e Mac); VPS usa DB **locale** |

**Rischio «copia vecchia sugli stessi dati»:** **basso su Neon** (VPS non usa Neon). Resta rischio di **confusione operativa** (due Next, nginx legacy, deploy sbagliato) e di traffico accidentale via IP/`/etc/hosts`.

**Proposta team (DEVIN; ok ALBERTO; BARBARA: ridurre superficie):**

1. **Tenere** il VPS a breve se Evolution/certificati devono restare raggiungibili.  
2. **Ridurre:** spegnere pm2 Next + togliere `server_name` pubblici da nginx (solo IP/lab), lasciare Docker se ancora necessari.  
3. **Dismettere** quando Evolution è dichiarato morto e backup fatti.

**Risparmio stimato:** piano Cloud VPS ~2 GB tipicamente **€8–15/mese** (+ IVA). Spegnere solo Next non azzera il canone; dismettere l’istanza sì. Alternativa: VPS più piccolo solo per Docker (~€4–8/mese) se Evolution resta.

---

## D — Procedure aggiornate

- `PROMEMORIA_DEPLOY.md` riscritto: produzione = Vercel `floremoria-dashboard`.  
- `docs/FLOREM_AI_ORCHESTRAZIONE.md` e `.cursorrules`: vietato trattare il VPS come sito.

---

## E — Decisioni FARE / NON FARE (nuove, 2026-09-24)

Già inserite nella tabella §1:

1. **`PATCH /tax-register`:** **FARE — limitare** (non cancellare subito). Motivo BARBARA: scrittura su campi fiscali/operativi ancora esposta ad ogni admin dashboard; Motivo DEVIN: UI già RO ma API no; ALBERTO approva limiti, non wipe improvviso.  
2. **Vista archiviati + ripristino:** **RIMANDARE** alla fase Archivio UI. Motivo ALBERTO: serve per non “perdere” documenti in operatività; Motivo DEVIN: non blocca sicurezza già online; BARBARA: ok se resta soft-archive senza delete.

---

## F — ALBERTO: 3–4 numeri da confrontare (T1 e T2 2026)

Confronto: **Excel/documenti del commercialista** ↔ **dashboard** (stesso periodo). Un solo «incassato» = commercialista (data pagamento).

| # | Numero | Dove in dashboard | Dove nei documenti commercialista |
|---|--------|-------------------|-----------------------------------|
| 1 | **Totale corrispettivi lordi del trimestre** (somma F2 / vendite) | Tab **Fisco** → Registro Corrispettivi commercialista → scegli T1 o T2 2026 → download Excel; foglio **F2** totale | Totale vendite/corrispettivi del trimestre già consegnato |
| 2 | **Numero di righe vendita / ordini nel trimestre** | Stesso Excel F2 (conteggio righe) oppure riepilogo periodo in pannello commercialista | Conteggio righe sul file firmato/consegnato |
| 3 | **Totale fee gateway (Stripe + PayPal) del trimestre** | Fisco / fee Stripe sync + classificazione PayPal nel periodo (o export commissioni già in piattaforma) | Riepilogo commissioni / reverse charge del pacchetto trimestrale |
| 4 | **IVA a debito da corrispettivi del trimestre** | Stesso motore commercialista / scorporo 10%+22% sul file F1–F2 (o colonna IVA del registro) | Liquidazione IVA / prospetto consegnato per il trimestre |

**Non usare** per questo collaudo: Conto Economico gestionale, vista operativa `createdAt`, né saldi Fineco “live” come sostituto del totale corrispettivi.

---

## G — Domande al titolare (max 3, business)

**1. Il server Aruba lo teniamo ancora per WhatsApp/Evolution, o possiamo spegnerlo e risparmiare circa 10 € al mese quando Evolution non serve più?**  
Consiglio team: **ridurre ora** (togliere il sito Next dal VPS), **dismettere dopo** conferma che WhatsApp Cloud API basta da sola.

**2. Vuoi che solo tu (Super Admin) possa ancora correggere a mano i dati del registro ordini via API, o preferisci chiudere del tutto le modifiche finché non serve?**  
Consiglio team: **solo Super Admin** (limitare), non lasciare ogni admin.

**3. Nella prossima semplificazione UI, vuoi subito la lista «documenti archiviati» con pulsante Ripristina, oppure prima le tre schede Andamento / Da fare / Commercialista?**  
Consiglio team: **prima le tre schede**; archiviati+ripristino subito dopo in Archivio.

---

*Fine addendum 2026-09-24. VPS non spento/modificato in questa riunione. Nessun documento reale archiviato. Nessun pagamento Stripe completato.*

---

# Addendum — Decisioni titolare + diagnosi deploy Vercel (2026-09-24 pomeriggio)

**Partecipanti:** DEVIN (diagnosi/fix), ALBERTO (ok perimetro), titolare (decisioni business)

## Decisioni del titolare (vincolanti)

| Tema | Decisione | Fase |
|------|-----------|------|
| **VPS Aruba** | **Si tiene.** Prima di qualunque intervento futuro sul VPS: **salvare il database Postgres locale**. | Operativo / PETRA |
| **Registro ordini (PATCH tax-register / modifiche)** | **Admin e Super Admin** possono modificare tutto, ma ogni modifica deve essere **tracciata** (chi, quando, valore prima e dopo). | **Fase successiva** — non ora |
| **Prossimo passo UI contabilità** | Prima le **3 schede + Archivio**. Vista «documenti archiviati» **rimandata**. | Piano semplificazione (scheletro UI) — **non** iniziata in questo addendum |

**Non iniziare la Fase 2** del piano semplificazione in questa sessione.

## Diagnosi deploy Vercel (CLI, non ipotesi)

Entrambi i progetti falliscono sullo **stesso** errore all’ultimo commit `afd39957`:

> `The Vercel Function "api/cron/pinterest-daily" is 255.21mb uncompressed which exceeds the maximum uncompressed size limit of 250mb.`

| Progetto | Dominio | Ultimo Error | Causa bloccante |
|----------|---------|--------------|-----------------|
| **floremoria-dashboard** | `www.floremoria.com` | `dpl_9YFM67WfkT…` | Function Pinterest > 250MB |
| **floremoria** | solo `floremoria.vercel.app` | `dpl_2kegm9dU…` | Stesso errore |

### Sospetti verificati

| Sospetto | Esito |
|----------|--------|
| **npm allow-scripts** | **Avviso**, non causa del fail. `prisma generate` (postinstall root) **gira** e completa. sharp/esbuild risultano «non ancora covered» — da monitorare; riparo prudente: `engines.node=24.x` + `prisma generate` anche nello script `build`. |
| **postman during build** | **Confermato come rumore di build**, non come fail. `PostmanSyncHeartbeat` nel `app/layout.tsx` usa `after()` → durante prerender di `/_not-found` parte `fetch` a `/api/cron/postman-sync`. Fix: skip se `NEXT_PHASE === 'phase-production-build'`. |
| **Due progetti Vercel** | **floremoria-dashboard** = sito reale (www). **floremoria** = clone collegato allo stesso repo, solo `*.vercel.app`, **con gli stessi cron attivi** → rischio **doppio cron**. **Non cancellare**; proposta: disabilitare i cron sul progetto `floremoria` (solo dashboard). |

## Correzione applicata (minima)

1. `next.config.ts` — `outputFileTracingExcludes` su `./public/media/social/momo/**`  
2. `lib/postman/triggerBackgroundSync.ts` — no-op in fase build  
3. `package.json` — `engines.node: 24.x` + `build: prisma generate && next build`

Verifica «pubblicato»: solo Ready + Production su **floremoria-dashboard** (vedi `PROMEMORIA_DEPLOY.md`).

## Cron doppi — chiusura 2026-09-24

| Progetto | Cron | Stato verificato CLI/API |
|----------|------|---------------------------|
| **floremoria-dashboard** | 4 job (pinterest-daily, publish-campaigns, publish-campaigns-dispatch, vera-order-reminders) | **ATTIVI** (`disabledAt` = null) |
| **floremoria** (secondario) | stessi 4 path in definizione | **DISATTIVATI** (`disabledAt` valorizzato; `vercel crons list` → `(disabled)`). Progetto **non** cancellato. |

**Doppie esecuzioni (ultimi giorni):** non risultano Pin daily duplicati in `system_state` (un solo `pinterest_last_daily_pin_at` = 2026-09-21 09:00Z, `simulated:false`). Campagne social 14g: `externalId` unici nel campione. Rischio residuo era reale su **vera-order-reminders** (WhatsApp) e su race Pinterest se entrambi i cron partivano prima del lock 36h; ora il secondario non schedula più.

**Nota:** un nuovo deploy su `floremoria` che ripubblica `vercel.json` *potrebbe* ripristinare i cron — dopo ogni deploy accidentale sul secondario, riverificare `vercel crons list` e che resti `(disabled)`.

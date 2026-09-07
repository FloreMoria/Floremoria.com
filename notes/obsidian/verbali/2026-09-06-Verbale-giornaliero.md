---
date: 06-09-2026
tipo: verbale_sviluppo
tags: [verbale, BARBARA, DEVIN, PETRA, CEO, sync_docs, Regola_Aurea]
sommario: "Verbale Operativo FloreMoria — 6 Settembre 2026"
sync_source: docs/verbali/06-09-2026.md
synced_at: 2026-09-07T03:00:01.409Z
---

> Copia sincronizzata automaticamente da `docs/verbali/06-09-2026.md`. Modificare la fonte in `docs/verbali/`; rieseguire `npm run log:verbale:sync-docs`.

# Verbale Operativo FloreMoria — 6 Settembre 2026

**Redazione:** BARBARA / DEVIN (generazione da operatività reale + Git).  
**Giornata di riferimento:** 2026-09-06.

## Sezione 1 — Infrastruttura

- `e709b8a2` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- `e30ba44e` docs(finance): fase 4b lotto 0 — riconciliazione basi e backup Neon _(FloreMoria)_
- `ef83a286` fix(finance): convogliati writers su Neon, stop mutazioni su GET e audit costi/IVA pre-Fase 4 _(FloreMoria)_
- `fc74b234` chore(verbali): [skip ci] sync automatico verbale giorno precedente (Europe/Rome) _(github-actions[bot])_
- `d30e456d` chore(verbali): [skip ci] pipeline BARBARA + DEVIN → Obsidian _(github-actions[bot])_
- `8d68d105` docs(verbali): [skip ci] auto-sync verbale del giorno precedente _(FloreMoria)_
- [2026-09-06 21:52] feat/finance: Fase 3 — canonical_doc_key+verification_status (CERTIFIED/QUARANTINE/REJECTED) su manual+saas; wire autofattura+SaaS+SDI+manual; skip idempotente chiavi forti; quarantena esclusa totali/PnL; badge UI 17900; flag FINANCE_PAYOUT_ID_CLASSIFICATION switch=2026-09-06 (Fase2, default ON); tsc+build OK; migrate 20260906220000.
- [2026-09-06 22:10] fix/finance: writers Stripe webhook + bank fee + processManualOrders → commitLedgerEntries/Neon (idempotent SKIP); stop sanitize su GET historical-ledger e sync/gateways.
- [2026-09-06 22:30] feat(finance-ui): spostato download dossier in testata, export excel per sezione e fix sync button; posizionato pulsante Scarica Dossier Fiscale in header accanto a Registra Spesa, implementato export Excel .xlsx dedicato per le 5 sezioni (Banca Fineco, Prima Nota, Passivo Fioristi, SaaS/Spese Estere, Storico Autofatture), potenziato pulsante Sincronizza con spinner attivo e feedback banner; tsc+build OK.
- [2026-09-06 22:32] finance/fase4b: Lotto 0 sola lettura — backup Neon branch backup-pre-fase4b-20260906 (br-holy-pine-alkquqzg). Delta €356,74 = oneri bancari esclusi dal perimetro costi 4a; base ufficiale 2026: ricavi €10.800,25 · costi €12.984,96 · risultato −€2.184,71. STOP in attesa conferma prima Lotto 1.
- [2026-09-06 23:25] finance/fase4b: CORREZIONE — SDD PayPal=funding (calcolo socio +€47,65 / ~97% gap); ritirata tesi contraria; PayPal EU non marcato in Neon; ricavi-negativi PP €1623,04=costi non vendite (PnL +€0 vendite); modello Fase2 a 3 gambe; lotto riclassifica SDD preparato NON eseguito; STOP numeri finali vendite; Lotto3 non eseguito. Wix export resta urgenza titolare.

## Sezione 2 — Strategia

- [2026-09-06 22:43] finance/fase4b: integrazioni dossier basi (backup 1166 PASS, etichette RAI/EBITDA, perimetro 2026, invarianti banca/transito) + dry-run Lotto 1 in docs/verbali/dossier_fase4b_lotto1_dryrun.md — ZERO scritture DB, ZERO commit; stop in attesa via libera esecuzione.
- [2026-09-06 22:50] finance/fase4b: Lotto1 rilavorato sola lettura (paste €32410=bug saldo-as-movimento; no €30k distinto; Wix=regolamento piattaforma non vendita, canale non attivo; RIMBORSI in PnL €44,88 su 12 righe). Dry-run Lotto2 CCIAA → CONTRIBUTI_ESERCIZIO; vendite caratteristiche AS-IS già €5932,14; RAI invariato. ZERO scritture; stop attesa via Lotto2.
- [2026-09-06 22:59] finance/fase4b: chiarimento socio — Wix €30,09 = entrata sito .eu (Wix Payments/Adyen), non regolamento orfano; dossier Lotto1 aggiornato (17900 resta destinazione tecnica finché canale .eu non modellato).

## Sezione 3 — Sviluppo

- `f81b8f84` feat(finance-ui): spostato download dossier in testata, export excel per sezione e fix sync button _(FloreMoria)_
- `ef068b60` docs(finance): fase 4a audit forense read-only per dossier commercialista _(FloreMoria)_
- `f950103e` feat(finance): fase 3 unicità documentale, quarantena spese deboli e audit ledger 1166 righe _(FloreMoria)_
- `612be388` feat(finance): fase 2 — conti di transito gateway, partita esplicita, idempotenza su evento sorgente _(FloreMoria)_
- `ef3c098c` refactor(finance): fase 1 audit doppioni, normalizzatore canonico documenti passivi e stop cascade delete _(FloreMoria)_
- [2026-09-06 19:05] refactor/finance: Fase 1 audit doppioni (script read-only), canonicalDocumentKey, bank_statement_lines onDelete Restrict.
- [2026-09-06 21:30] feat/finance: Fase 2 modello — cancello unico ledger, conti transito, payout-id flag, partita NULLABLE, dual-write JSON scollegato; acceptance 5a stabile, TARGET Fase4 €4080.29.
- [2026-09-06 22:10] audit/finance: excess netto JSON∩MANUAL = €7.481,92 (99 pair, 2026; liquidati 76 pair / €6.717,92); gross A+B era ~€15k. Quarantena N=0 → impatto costi/IVA credito €0 (no backfill). Badge UI quarantena pronto se N>0.
- [2026-09-06 22:10] audit/finance: ricavi vatCents=0 → €42.821,81 (168 row); overlap 87/87 target Fase4 €4.080,29; residual 81 row €38.741,52 (BANK_LINE 4 / PAYPAL 75 / MANUAL 2). tsc+build OK.
- [2026-09-06 22:57] finance/fase4b: Lotto 2 ESEGUITO FASE4B_L2_20260906_205447 — CCIAA €4597,66 ALTRI_RICAVI→CONTRIBUTI_ESERCIZIO; vendite/RAI invariati vs pre; deriva RAI −€500 = giroconto Fineco→PayPal post-freeze (non L2); basi+Wix17900+propedeutico L3 payout 66×€3063,69 in RICAVI_VENDITE / 21×€1016,60 in ALTRI.
- [2026-09-06 23:53] finance/fase4b: Amanda €109,98 APERTA (nessun incasso 15-25/08 né exact); Isabella CHIUSA (charge €284,90, delta €15=non fee/non refund); Lotto3 DRY-RUN 87/€4080,29 snapshot 2026-09-06T21:53:19Z — vendite post attese €2728,52; ZERO write L3.

## Sezione 4 — Logistica

- `53053b03` fix(chat): ripristinato invio template whatsapp oltre le 24h e risolto errore libreria utenti _(FloreMoria)_
- [2026-09-06 15:52] fix(chat): ripristinato invio template whatsapp oltre le 24h e risolto errore libreria utenti; rimosso blocco rigido libraryFilter su getApprovedWhatsAppTemplate/startProactiveConversation, aggiunto fallback dinamico per template Meta non censiti, allineata gestione errori Meta API con codice/messaggio dettagliato; tsc+build OK.
- [2026-09-06 21:52] audit/finance: Fase3 Parte A — ledger 1166 tot / ~874 attive; excess BANK_LINE=47 ORDER=25 (invariati); +293≈reversed; doppi costi JSON∩MANUAL ~€13.123; IVA €134,97=solo debito (netta −€168); RC autofatture vatCents=0 in ledger.
- [2026-09-06 22:10] audit/finance: 292 reversed (≈293) — picchi 2026-08-24T19Z (199 paypal noise) e 2026-08-31T14Z (72 bank_line_dedup); cause sanitize* su GET; reasons top paypal_net_or_generic_noise=101, bank_line_dedup=72, order_covered_by_gateway=41.
- [2026-09-06 22:23] docs/finance: Fase 4a forensic READ-ONLY — script audit-finance-fase4a-forensic.ts + dossier_bonifica_fase4a.md. P1: €37.038 = €32.410,30 FY2025 patrimoniale + €4.628 FY2026 (CCIAA/Wix/micro-PP). P2: PayPal attivo −€1.568,30; noise 101 row Σnet +€339,16 (199=picco giorno). P3: 292 reversed; recovery auto €0 (orderId=dedup gateway corretto). P4: IVA credito excess €1.008,03 (liquidati €937,30: T1 €740,30 + T2 €197). Quadro rettificato ricavi ~€6.720 / costi ~€5.146 / EBITDA stimato positivo. tsc+build OK; zero mutazioni DB.
- [2026-09-06 23:15] finance/fase4b: indagine PRE-L3 sola lettura — Order .eu ASSENTI; Stripe EU 227 mov / €3732 charge+payment con orderId=0; export CSV docs/exports/; gap PP: €500 funding mal classificato + €1068 residuo modello 3 gambe; SDD PayPal su Fineco €1616; spese PP mal messe in RICAVI_VENDITE negativi €1623. ZERO write DB.
- [2026-09-06 23:35] finance/fase4b: sola lettura — verità .eu 43 ordini €2559,81; smontato Stripe €3732 (charge+payment multi-anno; charge2026=€1928,98); Order match PRESENT 7€413 / MISSING 34€2037 / UNCERTAIN 2€110; PayPal .eu ≈€546; IVA teorica mancanti +€185 vs libro €135. ZERO write DB.
- [2026-09-06 23:48] finance/fase4b: pacchetto studio .eu (corrispettivi non fatture); separati Amanda €109,98 vs somma senza nome €109,98; quattro da chiudere €519,86; registro=solo Order quindi 34 esclusi per costruzione; ZERO write DB.
- [2026-09-06 23:59] finance/fase4b: Lotto3 ESEGUITO FASE4B_L3_20260906_215954 (87→TRASFERIMENTO_INTERNO); A: RV+€6057,75 / −€2693,19 alg€3364,56 ≠ vendite€5736,32 → negativi in costi non in vendite; B: 42 abbinati 1 delta Isabella €15 → .eu43 incassi €2544,81 IVA34 €183,81; C: Amanda consegnata → .eu €2036,91; post vendite .com €2919,99 (pose €191,47) RAI −€5692,51; totale vendite NON dichiarato.
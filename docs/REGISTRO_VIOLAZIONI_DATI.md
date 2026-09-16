# Registro delle violazioni dei dati — FloreMoria

Documento organizzativo del titolare del trattamento (FloreMoria S.r.l.).
Non è un log applicativo: resta in git, leggibile indipendentemente dal software.

**Scopo.** Tracciare ogni uscita di dati personali verso un destinatario che non doveva
riceverli, con cronologia onesta (apertura voce → misure → valutazione notifica → chiusura).

**Regola operativa (METODO §14).** Quando si scopre che un dato è uscito verso un
destinatario che non doveva riceverlo, si apre una voce in questo registro **prima** di
correggere il codice, così la cronologia resta onesta.

**Riferimenti.** GDPR artt. 33–34 · `docs/METODO_DOSSIER_FISCALE.md` §14 ·
`docs/verbali/` per i verbali tecnici collegati.

---

## Indice

| ID | Data evento | Stato | Sintesi |
|---|---|---|---|
| VIO-2026-001 | 2026-09-16 | Aperta — valutazione notifica entro **2026-09-19** | Email fiorista con contatti cliente + prezzo vendita (FF-PN-26-005) |

---

## VIO-2026-001 — Email fiorista con dati cliente (FF-PN-26-005)

### Identificativo e data

| Campo | Valore |
|---|---|
| ID | **VIO-2026-001** |
| Data / ora evento | 2026-09-16 ≈ 17:11 Europe/Rome (Resend `delivered` 15:11 UTC) |
| Data / ora scoperta | 2026-09-16 (stesso giorno) |
| Come scoperta | Il titolare ha letto il contenuto dell’email inviata al fornitore |
| Ordine | FF-PN-26-005 (import manuale da dashboard admin) |
| Verbale tecnico | `docs/verbali/16-09-2026-incidente-privacy-fiorista.md` |
| Nota cronologica | Il contenimento e il fix tecnico sono partiti in emergenza lo stesso 16/09 **prima** dell’istituzione di questo registro. La voce è aperta lo stesso giorno per sanare la traccia. Da VIO successive: **prima il registro, poi il codice** (METODO §14). |

### Natura

Uscita non autorizzata di dati del cliente finale (interessato) verso un fornitore esecutivo
(fiorista partner), tramite **email transazionale** generata dal percorso di notifica partner
dopo import ordine da dashboard.

Il sistema ha riusato il modello interno staff (`buildOrderStaffHtml`, destinato a ops) e lo
ha inviato al fiorista, con etichetta spurio «ID Sessione Stripe» = testo «Nuovo ordine assegnato».

### Interessati

| Campo | Valore |
|---|---|
| Categorie | Clienti finali (acquirenti di omaggi floreali) |
| Numero approssimativo | **Aperto** — dipende dall’audit sulle email storiche 2026 verso fioristi. Caso certo consegnato: almeno l’interessato di FF-PN-26-005. Chiudere questo campo al termine dell’audit. |

### Dati coinvolti

| Categoria | Volume (caso certo consegnato) |
|---|---|
| Identità (nome cliente / buyer) | 1 |
| Contatto email | 1 |
| Contatto telefono | 1 |
| Dato economico (prezzo di vendita pagato dal cliente, €129,99) | 1 |
| Contesto ordine (riferimento FF-PN-26-005, dati operativi consegna) | 1 email |

### Destinatari

| Destinatario | Tipo | Note |
|---|---|---|
| Fioreria Battistella s.r.l. (`info@fioreriabattistella.it`) | Fornitore / partner commerciale (1 soggetto) | Unico destinatario del caso consegnato |

**Verifica correlata — `fioristi@floremoria.com` (audit PT-VE-26-002):**  
non è una lista di distribuzione verso fioristi partner. È una **casella Aruba interna**
(display name «Fioristi-FloreMoria»), usata solo per lo scout «Nuovo Fiorista Richiesto»
(zone scoperte). Le email ops con dettaglio ordine completo vanno a `ordini@floremoria.com`
(`staffOrdersEmail`), non a `fioristi@`.  
**Componenti / destinatari effettivi dell’indirizzo:** solo `fioristi@floremoria.com`
(casella monoutente; non espande a email di fioristi esterni). Fonti: header `Delivered-To`
in Apple Mail, account Mail dedicato, Resend TO unico, codice `staffFloristsEmail()`.

### Conseguenze probabili

- Esposizione di contatti e prezzo di vendita a un fornitore che doveva ricevere solo il brief
  operativo (cimitero, defunto, biglietto, consegna, prodotto, budget fiorista, riferimento).
- Rischio reputazionale e di fiducia verso il cliente; rischio di uso improprio dei contatti
  da parte del fornitore (contatto non richiesto, trattativa fuori piattaforma).
- Per il caso isolato consegnato a un solo partner commerciale identificato, probabilità di
  danno grave agli interessati valutata **bassa**, salvo esiti diversi dell’audit storico.

### Misure adottate

**Contenimento immediato**

- Kill switch `FLOREM_FLORIST_EMAIL_KILL_SWITCH` attivo di default (`!== '0'`): nessuna email
  al fiorista parte da `sendPartnerOrderNotifications`.
- Canale `email_florist` in skip `privacy_kill_switch_florist_email_2026_09_16`.

**Correzione tecnica**

- Introdotto `FloristOrderBrief` (payload dedicato senza contatti/prezzo vendita).
- Test build-breaker `npm run test:florist-privacy` in `prebuild`.
- METODO §14 privacy outbound + rimando a questo registro.
- Commit fix: `419270a9d4391550dea25c7bf1a832fa23a734c0`.

**Comunicazioni fatte**

- Verbale tecnico incidente 16/09/2026.
- Apertura di questa voce di registro (VIO-2026-001).
- Comunicazione all’interessato / al Garante: **non ancora** (in valutazione — vedi sotto).

### Valutazione sulla notifica

| Campo | Valore |
|---|---|
| **Termine 72 ore** | **2026-09-19** (Europe/Rome) — entro 72 ore dalla scoperta del 16/09/2026. **Non slittabile.** |
| Notifica al Garante (art. 33) | **In corso di valutazione** — da completare entro il termine sopra. Ipotesi preliminare (solo caso consegnato noto): rischio per i diritti e le libertà degli interessati probabilmente **non elevato** (1 fornitore partner, 1 interessato certo, dati di contatto + prezzo, non categorie particolari). **La valutazione cambia se l’audit storico mostra decine di email con dati cliente.** |
| Informativa agli interessati (art. 34) | **In corso di valutazione** — stessa scadenza; dipende da ampienza e rischio residuo. |
| Motivazione (aggiornare alla chiusura della valutazione) | _Da compilare entro il 19/09/2026 con decisione sì/no e motivo, dopo chiusura del campo Interessati._ |

### Responsabile e data di chiusura

| Campo | Valore |
|---|---|
| Responsabile | Titolare del trattamento — Salvatore Marsiglione (FloreMoria S.r.l.) |
| Supporto tecnico / registro | Cursor / team DEVIN–VITO–BARBARA |
| Stato | **Aperta** |
| Data di chiusura | _Da impostare alla chiusura della valutazione notifica e del conteggio interessati_ |

---

## Come aprire una nuova voce

1. Assegnare ID `VIO-YYYY-NNN`.
2. Compilare **tutti** i blocchi della struttura fissa (anche se qualche campo resta «aperto»).
3. Aggiornare l’Indice in cima.
4. Se la scoperta riguarda un destinatario esterno non autorizzato: **prima il registro, poi il fix**.
5. Se serve notifica Garante: rispettare le 72 ore dalla scoperta; annotare data limite nella voce.

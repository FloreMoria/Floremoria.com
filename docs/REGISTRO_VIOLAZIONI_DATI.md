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
| VIO-2026-001 | 2026-09-16 | Aperta — misure OK; valutazione notifica **entro 2026-09-19** | Email fiorista con contatti + prezzo (FF-PN-26-005); audit contenuto: 1 consegnata esterna |

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
| Numero approssimativo | **1** (caso consegnato a destinatario esterno non interno: FF-PN-26-005). Audit Resend 2026 sul **contenuto** del body (non sul path subject): 1 sola email a destinatario esterno con segnali di leak (Cliente / email / telefono / Totale Ordine / riuso staff). Separata: 1 email **suppressed** del 28/08 a `salvatoremarsigliore@gmail.com` (anomalia — vedi sotto; non conteggiata come interessato esterno perché destinatario = casella del titolare / Partner «Fioreria Salvatore Test», non fiorista commerciale terzo). |

### Dati coinvolti

| Categoria | Volume (caso certo consegnato a esterno) |
|---|---|
| Identità (nome cliente / buyer) | 1 |
| Contatto email | 1 |
| Contatto telefono | 1 |
| Dato economico (prezzo di vendita pagato dal cliente, €129,99) | 1 |
| Contesto ordine (riferimento FF-PN-26-005, dati operativi consegna) | 1 email |

### Destinatari

| Destinatario | Tipo | Note |
|---|---|---|
| Fioreria Battistella s.r.l. (`info@fioreriabattistella.it`) | Fornitore / partner commerciale (1 soggetto) | Unico destinatario **delivered** con leak |

**Anomalia 28/08 — FF-CO-26-003 (suppressed):** destinatario `salvatoremarsigliore@gmail.com`. Causa: in anagrafica esiste il Partner fiorista **«Fioreria Salvatore Test»** con `Partner.email` = quello stesso Gmail (creato 27/08). La notifica fiorista usa `partner.email`: non è un “cliente scelto a caso”, è l’indirizzo configurato sul partner di test. Lo stesso nominativo compare come acquirente su FF-CO-26-001. **Meccanismo ripetibile** se si mette un’email di un cliente (o personale) nel campo email del fiorista. Ordine FF-CO-26-003 non più presente in DB (probabile cancellazione); Resend conferma subject/body con marker staff.

**Verifica — `fioristi@floremoria.com`:**  
**Alias/casella interno, non lista verso fioristi partner.**  
Elenco indirizzi che compongono l’indirizzo (destinatari effettivi):

1. `fioristi@floremoria.com` — unico (casella Aruba monoutente, display name «Fioristi-FloreMoria»)

Le email ops con dettaglio completo (`buildOrderStaffHtml`) vanno a `ordini@floremoria.com`, non a `fioristi@`. Quindi l’ampiezza dell’incidente **non** si moltiplica su tutti i fioristi via questo indirizzo.

### Conseguenze probabili

- Esposizione di contatti e prezzo di vendita a un fornitore che doveva ricevere solo il brief
  operativo (cimitero, defunto, biglietto, consegna, prodotto, budget fiorista, riferimento).
- Rischio reputazionale e di fiducia verso il cliente; rischio di uso improprio dei contatti
  da parte del fornitore (contatto non richiesto, trattativa fuori piattaforma).
- Con audit contenuto 2026 chiuso a **1** consegna esterna, probabilità di danno grave
  valutata **bassa**.

### Misure adottate

**Contenimento immediato**

- Kill switch di emergenza `FLOREM_FLORIST_EMAIL_KILL_SWITCH=1` (poi disattivato dopo verifica
  `FloristOrderBrief`; default operativo: email fiorista ON salvo kill esplicito).

**Correzione tecnica**

- Introdotto `FloristOrderBrief` (payload dedicato senza contatti/prezzo vendita).
- Test build-breaker `npm run test:florist-privacy` in `prebuild`.
- METODO §14 privacy outbound + rimando a questo registro.
- Commit fix privacy: `419270a9…`.

**Comunicazioni fatte**

- Verbali tecnici 16/09/2026.
- Apertura di questa voce di registro (VIO-2026-001).
- Comunicazione all’interessato / al Garante: vedi valutazione sotto.

### Valutazione sulla notifica

| Campo | Valore |
|---|---|
| **Termine 72 ore** | **2026-09-19** (Europe/Rome) — entro 72 ore dalla scoperta del 16/09/2026. **Non slittabile.** |
| Notifica al Garante (art. 33) | **No** (decisione motivata al 16/09, confermata dall’audit contenuto). |
| Informativa agli interessati (art. 34) | **No** (stessa motivazione; riesame se emergessero altri casi entro il termine). |
| Motivazione | L’audit 2026 sul **contenuto** delle email verso destinatari non interni ha trovato **una sola** consegna con dati cliente/prezzo (FF-PN-26-005 → un partner commerciale). Dati coinvolti: identità, contatti, prezzo — non categorie particolari art. 9. Destinatario unico, rapporto contrattuale di fornitura, contenimento e correzione già in atto (`FloristOrderBrief` + test). Rischio per i diritti e le libertà degli interessati valutato **non elevato** ai sensi art. 33: non scatta l’obbligo di notifica al Garante né, in assenza di rischio elevato, l’informativa individuale art. 34. La decisione resta riesaminabile fino al **19/09/2026** se emergessero nuovi fatti. |

### Responsabile e data di chiusura

| Campo | Valore |
|---|---|
| Responsabile | Titolare del trattamento — Salvatore Marsiglione (FloreMoria S.r.l.) |
| Supporto tecnico / registro | Cursor / team DEVIN–VITO–BARBARA |
| Stato | **Aperta** fino al termine 19/09 (monitoraggio); misure tecniche chiuse |
| Data di chiusura | _Prevista 19/09/2026 se nessun nuovo fatto_ |

---

## Come aprire una nuova voce

1. Assegnare ID `VIO-YYYY-NNN`.
2. Compilare **tutti** i blocchi della struttura fissa (anche se qualche campo resta «aperto»).
3. Aggiornare l’Indice in cima.
4. Se la scoperta riguarda un destinatario esterno non autorizzato: **prima il registro, poi il fix**.
5. Se serve notifica Garante: rispettare le 72 ore dalla scoperta; annotare data limite nella voce.

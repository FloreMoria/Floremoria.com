# MOMO — Foto consegne sui social (decisioni titolare + piano)

> **Aggiornato:** 2026-09-24 (decisioni titolare)  
> **Stato:** documentazione + verifiche sola lettura. **Nessuno sviluppo** senza OK.  
> **Nessuna Fase 2 contabilità** senza OK.  
> **Bozza testi legali:** `docs/momo-foto-consegne-testi-legali-bozza.md` (da far validare a Iubenda/avvocato).  
> **LIA (art. 6.1.f):** `docs/momo-foto-consegne-lia.md`.

---

## 1. Decisioni approvate dal titolare (2026-09-24)

### 1.1 Consenso — STRADA A (approvata)

- **Nessun consenso obbligatorio** al checkout.
- L’**informativa privacy** dichiara che le foto di consegna possono essere usate **in forma anonima** per la promozione del brand.
- Il cliente può **rifiutare** con:
  - casella **facoltativa** al checkout: «non usate le mie foto»; **oppure**
  - richiesta via email.
- Le foto dei clienti che rifiutano **non entrano mai** nella coda Momo.

### 1.2 Ambito foto

- Solo foto **«dopo»** la consegna.
- **Senza persone** riconoscibili.
- **Regola foto pregresse (Stock Storico):** si utilizzano **esclusivamente** le foto di ordini effettuati **DOPO** la pubblicazione della nuova informativa privacy (in vigore dal **24 Settembre 2026**). Tutte le foto di ordini anteriori a tale data rimangono ad uso strettamente contrattuale/rendicontazione e non possono essere inserite in coda né pubblicate.

### 1.3 Pubblicazione

- Pubblica solo **Admin** o **Super Admin**, dopo aver guardato la foto.
- Traccia obbligatoria: **chi** ha approvato e **quando**.
- **Nessuna pubblicazione automatica** su alcun social.

### 1.4 Fioristi nei post — STRADA B (approvata)

- Il fiorista **non** viene mai nominato né taggato nei post FloreMoria.
- Solo citazione generica della rete **a livello di regione** (es. «un fiorista partner FloreMoria in Lombardia»).
- **Mai** città o paese. Valida per tutti i social.

### 1.5 Carosello homepage — foto consegne (decisione 2026-09-24)

- **Freeze (finché non esiste la coda di approvazione):** solo foto di consegne fino al **24/09/2026** (già controllate dal titolare). **Nessuna nuova foto entra in automatico.**
- Quando esisterà la coda, le **NUOVE** foto entrano **solo dopo**:
  1. anonimizzazione con le regole Momo (§2);
  2. **approvazione personale del titolare** (stesso standard dei social);
  3. traccia obbligatoria: chi ha approvato e quando.
- LIA (legittimo interesse): `docs/momo-foto-consegne-lia.md`.
- **Data efficacia 24/09/2026:** valida **solo** se il titolare pubblica lo stesso giorno.

---

## 2. Regole di anonimizzazione (tutti i social, senza eccezioni)

Valide per **Pinterest, Instagram, Facebook e ogni social futuro**. Replicate in `agents/MOMO_master.md` §7.

1. **Originali intatti:** le prove di consegna non si modificano mai; si lavora solo su **copia**.
2. **Inquadrature strette sui fiori:** nessuna parte riconoscibile della tomba (forma, marmo, decorazioni, tombe vicine).
3. **Da eliminare comunque:** volti e foto di defunti, nomi, cognomi, date, epigrafi, nastri e biglietti con dediche, targhe, persone.
4. **Strip metadati:** GPS, data scatto, dispositivo (EXIF e analoghi).
5. **Attesa minima:** pubblicazione solo dopo **almeno 4 settimane** dalla consegna  
   *(il team può proporre un valore diverso, motivandolo — vedi §6.3)*.
6. **Testi post:** nessun nome, nessuna data, **nessun cimitero indicato**.
7. **Fioristi nei post — STRADA B (approvata):** il fiorista **non** viene mai nominato né taggato. Si cita solo la rete in modo generico, **a livello di regione** (es. «un fiorista partner FloreMoria in Lombardia»), **mai** la città o il paese. Valida per tutti i social.
8. Solo asset in coda Momo **«Da approvare»** → approvati da Admin/Super Admin.

---

## 3. Verifiche sola lettura (2026-09-24) — niente cancellazioni/modifiche eseguite

### 3.a Le 36 foto `/social-ready/` sono mai state pubblicate?

**Aggiornamento 2026-09-24 (verifica Graph API Meta + titolare):**

| Fonte | Esito |
|-------|--------|
| DB `socialPublishedChannels` | **9** proof avevano `META_INSTAGRAM` + `META_FACEBOOK` |
| Titolare (controllo manuale IG/FB) | Solo **2** post (1 IG + 1 FB), video Momo propri, **conformi** — **NON rimuovere nulla** |
| Graph API `app_floremoria` / Page FloreMoria | Molti altri post di **calendario marketing** (Imagen/copy AI), **non** le 9 foto `/social-ready/` |
| Confronto hash | Post Meta mattutini nello stesso orario dei flag **≠** file social-ready (nessun match SHA-256) |

**Da dove veniva il dato «9 pubblicati»?**  
Dal solo campo DB `DeliveryProof.socialPublishedChannels`, valorizzato da `runDeliveryProofSocialPublishPipeline` su `result.success` **anche quando `result.simulated === true`** (POSTMAN simula se credenziali/canale non pronti, ma comunque restituisce success). Quindi il DB diceva «pubblicato» senza post reale con quella foto.

**Correzione applicata (senza cancellare storia):**  
- canali rinominati in `UNVERIFIED_CLAIM_META_INSTAGRAM` / `UNVERIFIED_CLAIM_META_FACEBOOK`  
- audit completo in `SystemState` key `delivery_proof_social_publish_correction_2026-09-24`  
- fix codice: push canale **solo** se `success && !simulated`

**Pinterest:** nessuna delle 36 usata (Unsplash).  
**Env:** `MARKETING_PUBLISH_DELIVERY_PROOF_SOCIAL=0` su `floremoria-dashboard` (production+preview).

---

### 3.b BARBARA — Strada A e foto pre-informativa

**Verifica:** 2026-09-24.

#### Strada A è sufficiente per legge?

**Risposta: sì, a condizioni — non automatica.**

| Condizione | Perché |
|------------|--------|
| Informativa aggiornata **prima** di nuovi usi | Art. 13 GDPR: trasparenza su finalità e base giuridica (Garante — principi fondamentali del trattamento) |
| Base giuridica documentata | Tipicamente **art. 6.1.f** (legittimo interesse) **oppure** trattamento su dati **effettivamente anonimi**; il LI non è un passepartout per il marketing (orientamento Garante / Federprivacy su bilanciamento) |
| **Legitimate Interest Assessment (LIA)** scritto | Necessità, aspettative ragionevoli nel contesto del lutto, misure (anonimizzazione stretta, opt-out, review umana, attesa 4 settimane) |
| Opt-out facile (checkout + email) e **blocco tecnico** coda Momo | Allineato alla Strada A del titolare; opposizione art. 21 se LI |
| Minimizzazione reale | Se restano nome/volto/lapide, **non** è anonimo → rischio alto (anche art. 2-terdecies Codice Privacy per dati del defunto) |

**Fonti (data verifica 2026-09-24):**

- GDPR art. 5 (limitazione finalità), 6.1.f, 13, 21; Considerando 27 (defunti).
- D.Lgs. 196/2003 art. **2-terdecies** (diritti sui dati del defunto).
- Garante Privacy — *Principi fondamentali del trattamento* (liceità, informativa prima del trattamento).
- Orientamento su LI e marketing: Federprivacy / provvedimenti Garante (LI non automatico; bilanciamento obbligatorio).

> Distinzione: l’art. 130 Codice Privacy (consenso email promozionali) **non** coincide con la pubblicazione di contenuti sul profilo social del brand; restano però obblighi di liceità, trasparenza e minimizzazione sulle immagini.

**Parere etico (SOFIA/ALMA):** Strada A è accettabile solo se l’anonimizzazione è **seria** (come §2) e l’opt-out è visibile; il sample §3.a mostra che lo Sharp attuale **non** basta da solo.

#### Foto di consegne **prima** dell’aggiornamento informativa: si possono usare se rispettano §2?

**Risposta: no (uso marketing nuovo), salvo mitigazioni.**

- Cambiare l’informativa **oggi** non sana retroattivamente la raccolta di ieri per una finalità promozionale **non** comunicata (limitazione della finalità, art. 5.1.b + 13).
- Anche con crop/blur «a regola», se l’immagine era stata raccolta solo come prova di consegna, l’uso social è un **cambio di finalità**: prima di usarla serve almeno **informativa successiva + possibilità di opporsi** (e rispetto art. 2-terdecies / terzi in foto).
- **Pratica consigliata:** in coda Momo, per i proof **ante** go-live informativa, **non eleggibili** finché non c’è contattato opt-out / grace period, **oppure** usare solo consegne **dopo** la data di pubblicazione dell’informativa aggiornata.

**Sì solo se:** (i) asset reso **non identificabile** in modo robusto **e** (ii) titolare ha completato informativa + canale di opposizione **e** (iii) avvocato/Iubenda confermano il trattamento dello stock storico — fuori da questa bozza team.

---

## 4. Testi legali

Bozza operativa (non legale firmata):  
→ **`docs/momo-foto-consegne-testi-legali-bozza.md`**  
Il titolare la farà verificare con Iubenda o avvocato prima dell’uso.

---

## 5. Piano sviluppo DEVIN (piccoli passi — NON iniziare senza OK)

| # | Passo | Esito | Dipende da |
|---|--------|-------|------------|
| **P0** | **Eseguito 2026-09-24:** `MARKETING_PUBLISH_DELIVERY_PROOF_SOCIAL=0` su Vercel dashboard. **Nessun takedown** (titolare: solo 2 post Momo conformi). Flag DB 9 → `UNVERIFIED_CLAIM_*` + audit SystemState. Fix: non marcare canale se publish simulata. | Stop auto foto consegna | OK titolare |
| P1 | Campo ordine `marketingPhotosOptOut` (default false) + casella checkout + blocco ingresso coda | Strada A tecnica | Testi legali live |
| P2 | Estendere sanitizer / checklist review: rifiuta se OCR/face o review umana trova lapide/nastro/testo | Allinea §2 | P0 |
| P3 | Tabella/coda Momo `PENDING_REVIEW` + UI Approva/Scarta + `approvedBy`/`approvedAt` | Decisione Q3 | P1–P2 |
| P4 | Gate: solo `AFTER`, no persone, opt-out=false, **+28 giorni** da `deliveryDate`, status APPROVED | Regole §2 | P3 |
| P5 | `pinterest-daily` (e Meta): consuma **solo** approvati; fallback Unsplash se coda vuota | Sostituzione progressiva | P3–P4 |
| P6 | (Opz.) Vision API face+OCR se rifiuti review > soglia | Costo ALBERTO | Dopo metriche P3 |

**Stash Momo video** (`momo-panel-wip`, `wip-non-fase1`): **non** obbligatori per P0–P5; UI coda può essere modulo separato.

### Primo passo eseguibile (attende OK)

> ~~Impostare env…~~ **Fatto 2026-09-24.** Prossimi passi sviluppo (P1+) restano in attesa di OK.

---

## 8. Automazioni che pubblicano all’esterno senza approvazione umana Admin (sola lettura 2026-09-24)

> «Guardiani» AI ≠ Admin/Super Admin. Non spegnere nulla oltre P0 senza OK.

| Automazione | Cosa pubblica | Dati cliente/defunto? |
|-------------|---------------|------------------------|
| **Cron `publish-campaigns`** (05:00 UTC) | Produce + pubblica slot calendario IG/FB/TikTok (feed, **story**, reel) se campagna `APPROVED` dai Guardiani AI | Copy/immagini di prodotto/marketing; **non** dovrebbe usare anagrafiche; rischio se copy/leak. **Non** usa `/social-ready/` delivery (da P0 delivery-proof off). |
| **Cron `publish-campaigns-dispatch`** (07:00 UTC) | Solo publish pipeline (stesso POSTMAN) | Come sopra |
| **Cron `pinterest-daily`** (ogni 2 gg) | Pin automatico Unsplash + watermark, link www | Stock Unsplash — **no** clienti/defunti |
| **Delivery-proof social** (dentro publish pipeline) | Era: Reel da foto `/social-ready/` | **Sì rischio** foto tomba — **ORA DISATTIVATO** (`=0`) |
| **Cron `vera-order-reminders`** | WhatsApp template: `customer_waiting_update`, `florist_reminder`, `anniversary_gdm_reminder` | **Sì:** telefono cliente/fiorista; anniversari legati a profilo defunto (nome in template possibile) |
| **Cron `vera-inbound-debounce-flush`** | Risposte WhatsApp VERA debounce | **Sì:** chat operative con clienti/fioristi |
| **Webhook WhatsApp / VERA runtime** | Risposte inbound (non cron) | **Sì:** conversazioni |
| **Cron `punto-b-wake`** | Email conferma ordine cliente (transazionale) | **Sì:** dati ordine/cliente — non marketing social |
| **Cron `postman-sync`** | Ingestione email assistenza (inbound), non publish outbound marketing | Contatti email in ingresso |
| **Newsletter** | Opt-in checkout → `newsletterLog`; **nessun cron di invio massivo** trovato in repo | Solo registrazione interesse; invii non automatizzati qui |
| **Homepage carousel** | Mostra `photoAfterUrl` (originali) sul sito | **Sì rischio** — non è “social post” ma pubblico web |

**Nota campagne:** il publish campagne può ancora segnare `PUBLISHED` anche su esito **simulato** (bug gemello, meno grave perché `externalId` simulato è filtrabile). Da correggere in un passo dedicato con OK.

---

## 6. Note ALBERTO / attesa 4 settimane

- Costo tool attuale: ~€0 (Sharp). Costo nascosto: **rimozione post non conformi** + tempo Admin review.
- **Attesa 4 settimane:** il team **conferma** il valore del titolare (rispetto del lutto + distanza temporale da evento). Alternativa 14 giorni aumenterebbe freschezza contenuti ma riduce il “buffer” emotivo — **non proposta** come default.

---

## 7. Fuori scope finché non c’è OK

- Sviluppo coda Momo / switch Pinterest  
- Fase 2 contabilità  
- Cancellazione blob o modifica file social-ready (solo elencati in §3.a)

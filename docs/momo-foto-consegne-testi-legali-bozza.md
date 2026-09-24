# Bozza testi legali — foto consegne anonime per promozione

> **Stato:** bozza team (BARBARA) — **non** testo legale firmato.  
> **Data:** 2026-09-24  
> **Uso:** da far verificare al titolare con **Iubenda** e/o avvocato **prima** di pubblicarlo in informativa o checkout.  
> **Decisione titolare:** Strada A (informativa + opt-out facoltativo; nessun consenso obbligatorio).

---

## A. Paragrafo da aggiungere all’informativa privacy (Iubenda)

**Titolo suggerito:** *Foto di conferma consegna e promozione del brand*

Nell’ambito del servizio di omaggio floreale, il fiorista partner realizza fotografie di conferma della consegna (in particolare lo scatto «dopo» la posa). Tali immagini sono trattate innanzitutto per adempiere al contratto (provarvi l’avvenuta consegna) e per eventuali contestazioni.

FloreMoria S.r.l. può inoltre utilizzare **una copia** di tali fotografie, **opportunamente anonimizzata**, per attività di **promozione e comunicazione** del brand sui propri canali digitali (a titolo esemplificativo: sito, Pinterest, Instagram, Facebook e altri social o canali promozionali futuri).

Per «anonimizzata» si intende una versione nella quale non risultano riconoscibili, in particolare: volti o ritratti di persone (anche defunte), nomi, cognomi, date, epigrafi, nastri o biglietti con dediche, targhe, elementi architettonici o dettagli di tombe e luoghi che consentano di identificare la sepoltura o il contesto specifico. Dai file pubblicati sono rimossi i metadati tecnici non necessari (ad es. posizione GPS, data dello scatto, modello del dispositivo), nei limiti tecnici ragionevoli.

**Base giuridica (bozza — da confermare in Iubenda):** legittimo interesse di FloreMoria S.r.l. alla promozione del servizio (art. 6, par. 1, lett. f, GDPR), bilanciato con i diritti degli interessati e con le misure di minimizzazione e controllo umano sopra descritte; ove l’immagine risulti effettivamente anonima, il Regolamento può non applicarsi a tale asset. Resta ferma la disciplina nazionale sui dati relativi a persone decedute (art. 2-terdecies del D.Lgs. 196/2003), esercitabile dagli aventi diritto.

**Opposizione / rifiuto:** potete opporvi in qualsiasi momento all’uso promozionale delle foto relative al vostro ordine, senza pregiudizio per la consegna del servizio, mediante:

- la casella facoltativa in fase di checkout («Non usate le mie foto per la promozione»), oppure  
- una email a assistenza@floremoria.com (o all’indirizzo privacy indicato in informativa), indicando il numero d’ordine.

In caso di rifiuto o opposizione, le relative fotografie **non** vengono inserite nella coda di selezione per i social e non sono utilizzate per finalità promozionali. La sola opposizione non comporta di regola la cancellazione della prova di consegna necessaria agli obblighi contrattuali e di legge.

La selezione e pubblicazione sui canali social non è automatica: avviene solo dopo controllo da parte di personale autorizzato FloreMoria, secondo procedure interne di anonimizzazione e approvazione.

---

## B. Testo casella facoltativa di rifiuto al checkout

**Label (IT) — consigliata:**

```text
Non usate le foto di consegna del mio ordine per la promozione di FloreMoria
(sui social o altri canali). La consegna e la foto di conferma su WhatsApp restano invariate.
```

**Hint / tooltip (opzionale, sotto la casella):**

```text
Se spunti questa casella, useremo le foto solo come prova di consegna per te.
In ogni caso, per la promozione usiamo soltanto copie anonimizzate (solo fiori, senza nomi né dettagli riconoscibili della tomba), dopo controllo dello staff.
Dettagli nella Privacy Policy.
```

**Requisiti UX (vincoli prodotto, non testo legale):**

- Casella **non** pre-spuntata (opt-out facoltativo).
- Non obbligatoria per completare l’ordine.
- Collegamento testuale alla Privacy Policy aggiornata.
- Stesso effetto se la richiesta arriva via email: flag ordine `marketingPhotosOptOut = true` e blocco coda Momo.

**Microcopy conferma (email di risposta allo staff — bozza):**

```text
Abbiamo registrato la tua richiesta: le foto del tuo ordine non saranno usate
per la promozione di FloreMoria. La prova di consegna resta disponibile solo per te e per il servizio.
```

---

## C. Checklist prima del go-live (Iubenda / avvocato)

- [ ] Allineare base giuridica e wording al modello Iubenda del titolare  
- [ ] Aggiornare anche condizioni di vendita (rinvio all’informativa) se richiesto dal consulente  
- [ ] Confermare trattamento dello **stock storico** (foto ante aggiornamento): team consiglia esclusione o grace period con opt-out  
- [ ] Verificare che l’opt-out email sia monitorato (PETRA/VERA) entro SLA definito  

*Fine bozza.*

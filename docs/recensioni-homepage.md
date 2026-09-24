# Recensioni homepage — DEVIN + BARBARA

> **Data:** 2026-09-24  
> **Stato:** sola lettura + proposte. **Nessuno sviluppo** senza OK titolare.  
> **Obiettivo titolare:** solo recensioni Google autentiche; contatore stelle/numero aggiornato da solo; click → Google FloreMoria.

---

## 1. Da dove arrivano oggi le recensioni? (sola lettura)

### Flusso tecnico

| Pezzo | Ruolo |
|-------|--------|
| `components/GoogleReviewsBar.tsx` | UI homepage: marquee + bottone «Leggi su Google» |
| `GET /api/google-reviews` | Server: chiama Google Places Details se ha env; altrimenti **fallback hardcoded** |
| Env attese | `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` |

### Cosa succede in produzione oggi (verificato 2026-09-24)

Chiamata live a `https://www.floremoria.com/api/google-reviews`:

```json
{ "rating": 5, "user_ratings_total": 34, "url": "https://g.page/r/CYtHIOAB65TOEB0/review" }
```

- **Nessun array `reviews`** → il client entra nel ramo placeholder.
- Su Vercel `floremoria-dashboard` **non** risultano `GOOGLE_PLACES_API_KEY` / `GOOGLE_PLACE_ID` (ci sono solo chiavi Google Ads / Maps pubbliche).
- Quindi l’API usa il **fallback hardcoded** in `app/api/google-reviews/route.ts`:

```ts
user_ratings_total: 34,  // fisso
rating: 5.0              // fisso
```

### Le card del carosello sono autentiche?

**No — sono inventate / di prova**, definite in `getPlaceholderReviews()` dentro `GoogleReviewsBar.tsx`:

- Nomi fittizi: Mario, Silvia, Elena, Giovanni, Roberto, Maria  
- Testi marketing scritti a mano (non da Google)  
- Date relative inventate (`now - N giorni`)  
- **In più:** anche se arrivassero recensioni Google reali, il codice **aggiunge** una location falsa:  
  `Presso il Cimitero di {comune random}` da `/api/municipalities/random` — **non** presente nella recensione Google.

### Perché il contatore è fermo a 34 mentre Google ha 36?

1. **Produzione non chiama Places** (env assenti) → resta il default **34** nel codice.  
2. Locale con API key: Places risponde già **`user_ratings_total: 36`**, `rating: 5`, **5** testi Google reali (limite Places).  
3. Il «34» non è un cache Google: è un **numero di marketing congelato nel fallback**.

---

## 2. Come togliere SUBITO le non autentiche (proposta urgente — attende OK)

Ordine consigliato, piccolo e reversibile:

| Step | Azione | Effetto |
|------|--------|---------|
| **U1** | Aggiungere su Vercel `floremoria-dashboard` (production+preview) `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` (valori già in `.env.local`) | L’API restituisce totale reale (36) + fino a 5 review Google |
| **U2** | In `GoogleReviewsBar`: **eliminare** `getPlaceholderReviews` dal percorso UI; se `reviews` vuoto → **non mostrare** il marquee (solo contatore+link, o messaggio neutro «Vedi le recensioni su Google») | Fine testi inventati |
| **U3** | **Eliminare** l’iniezione `location: Presso il Cimitero di…` | Fine attribution geografica falsa |
| **U4** | Fallback API: se Places down, **non** restituire totale inventato; restituire `{ ok:false, url }` e UI mostra solo link Google senza numero, oppure ultimo cache valido con badge «dato in aggiornamento» | Fine «34» fantasma |
| **U5** | Bottone contatore: `href` = URL Google Places/GBP (`data.url` o `g.page/...`) — già quasi così; verificare che punti alle **recensioni** non solo a «lascia review» se il titolare preferisce la scheda | Click → Google |

**Non** serve (per l’urgenza) Google Business Profile API: Places basta per contatore + 5 testi.

**Rischio se non si fa U2:** anche con env ok, un errore API riporta i placeholder inventati.

---

## 3. Obiettivo permanente (allineato al titolare)

1. Solo testi provenienti da Google (o sezione vuota + link).  
2. `rating` + `user_ratings_total` da Places (o GBP), refresh periodico (già cache 6h in route).  
3. Click sul contatore → scheda/recensioni FloreMoria su Google.  
4. Nessuna location inventata, nessun nome inventato.

---

## 4. DEVIN — Places vs Business Profile

| | **Google Places API (Place Details)** | **Google Business Profile API** |
|--|--------------------------------------|----------------------------------|
| Recensioni testo | **Max 5**, le «più rilevanti» secondo Google (non tutte, non necessariamente le ultime) | Accesso alle recensioni del profilo (volume maggiore; dipende da permessi/API disponibili) |
| Totale + media stelle | **Sì** (`user_ratings_total`, `rating`) — sufficiente per il contatore | Sì (metriche profilo) |
| Accesso | API key + `place_id` pubblico | **Account proprietario** GBP + OAuth cloud project collegato alla location |
| Costo indicativo | Places Details: pay-as-you-go (ordine ~$0.017–0.03 / call a listino; con cache 6h ≈ poche call/giorno → **pochi €/mese**) | Spesso incluso nel perimetro Cloud / quote; setup più pesante |
| Se Google non risponde | Oggi: fallback falso 34 + placeholder. **Proposta:** niente inventati; solo link Google; opz. cache Redis/`SystemState` dell’ultimo snapshot valido con TTL e label «ultimo aggiornamento» | Stesso pattern di degradazione onesta |

**Raccomandazione DEVIN:**  
- **Fase 1 (urgente):** Places Details per **contatore autentico** + fino a 5 review + link.  
- **Fase 2 (opzionale):** GBP se servono **tutte** le recensioni in carosello o sync completo — solo dopo accesso proprietario confermato.

**Aggiornamento automatico:** cron non obbligatorio; cache in-memory 6h già presente (si perde al cold start) → meglio cache su `SystemState` o Vercel KV aggiornata ogni 1–6h.

---

## 5. BARBARA — rischio legale (recensioni non autentiche)

**Verifica:** 2026-09-24 (analisi sul codice + comportamento live).

| Problema | Perché è rischioso |
|----------|-------------------|
| Testi e nomi inventati presentati con logo Google / «recensioni verificate» | Pratica commerciale scorretta / ingannevole verso il consumatore (Codice del Consumo — pratiche scorrette; orientamento AGCM su recensioni non genuine) |
| Contatore «34» mentre Google ne ha 36 (o altro) | Affermazione quantitativa non vera → ingannevolezza |
| Location «Presso il Cimitero di X» aggiunta artificialmente | Attribuisce contesto geografico falso alla voce del recensore |
| Fallback silenzioso a contenuti fittizi | L’utente non sa che non sta leggendo Google |

**Raccomandazione BARBARA:** rimuovere subito ogni contenuto non proveniente da Google; in caso di indisponibilità API, **solo** rimando al profilo Google senza citare numeri/testi. Non etichettare come «verificate» recensioni non scaricate da Google in quella sessione/cache.

> Bozza team, non parere legale firmato. Per AGCM/Codice Consumo: far validare all’avvocato se serve.

---

## 6. Carosello foto consegne (foto attuali OK — solo regole per le NUOVE)

**Oggi (sola lettura):**

- `app/page.tsx` → `loadDeliveryProofPhotos()` prende le ultime 3 `DeliveryProof` **COMPLETED** con `photoAfterUrl` (**originale**, non `/social-ready/`).  
- `CarouselFotoConferme`: se DB vuoto → fallback Unsplash.  
- Titolare: **le foto attuali vanno bene e restano.**

**Proposta per le NUOVE (non sviluppare senza OK):**

1. Flag su proof o tabella: `homepageCarouselEligible` / solo URL da canale sanificato (stesse regole Momo § anonimizzazione: crop fiori, no lapidi/nomi/persone, EXIF strip — riuso `sanitizeDeliveryPhotoForSocial` + review umana o checklist automatica).  
2. Query homepage:  
   - **whitelist** delle foto già in produzione (ID/URL fissati dal titolare) **oppure** «current set frozen»;  
   - **nuove** entrate solo se `socialReadyPrimaryUrl` presente **e** (opz.) approvate in coda Momo / flag `carouselApprovedAt`.  
3. Non usare mai `photoAfterUrl` grezzo per le nuove.  
4. Opt-out Strada A marketing: se cliente ha «non usate le mie foto», esclusione anche dal carosello pubblico.

Allineamento con `docs/momo-foto-consegne.md` (regole §2 + Strada B testi).

---

## 7. Primo passo pronto da eseguire (attende OK)

1. Env Vercel Places (`GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID`).  
2. Patch UI: zero placeholder, zero location false.  
3. Fallback onesto senza numero inventato.  
4. Verificare contatore = 36 (o valore live Google) e click → Google.

**Non eseguito** in questa sessione.

# Manuale Sviluppatore / Diario di Bordo - FloreMoria

Questo documento contiene le informazioni architetturali, la struttura delle cartelle, le metodologie utilizzate e un log degli sviluppi per facilitare l'onboarding di qualsiasi sviluppatore (o assistente IA) e la manutenzione continua del portale web di **FloreMoria**.

_Nota: Assicurati di mantenere questo documento sempre aggiornato con le nuove modifiche architetturali apportate._

---

## 1. Stack Tecnologico Principale
- **Framework React:** Next.js 16 (App Router)
- **Libreria Core UI:** React 19
- **Linguaggio:** TypeScript (Strict Mode)
- **Styling:** Tailwind CSS v4 (con root variables di design custom in `index.css`: `fm-rose`, `fm-cta`, `fm-text`, `fm-muted`, `fm-section`)
- **Database/ORM:** Prisma ORM (sqlite per ambienti di sviluppo/staging, facilmente migrabile)
- **Tooling di Build:** Script Node.js pre-build automatizzati nativi (`mjs`) in `package.json`

## 2. Architettura del Progetto (Sitemap & Cartelle)

La directory principale di lavoro è `/floremoria`. Ogni strato architetturale ha un compito separato.

### /app
Il cuore del routing di Next.js. Ogni cartella corrispondente ad un URL pubblico contiene il file strutturale `page.tsx`
- **`/api`**: Endpoint backend del progetto (`/admin/products`, `/google-reviews`, `/municipalities`).
- **`/fiori-sulle-tombe`**: Main Funnel. Visualizza il catalogo intero, mentre la sottocartella `/fiori-sulle-tombe/[slug]` è il Dynamic Router della Product Page.
- **`/checkout`** & **`/order-completed`**: Flusso transazionale dell'e-commerce (state managed prevalentemente localmente o tramite localStorage per i dati temporanei del cart).
- **`/`**: Home Page vera e propria.

### /components
Componentistica React isolata e riusabile. Raccoglie la UI globale e le business logic visive.
- `ProductCard.tsx`: Modulo per la Grid visiva (renderizza la `coverImage` ed inietta on-hover preview).
- `ProductHoverPreview.tsx`: Hover intelligente renderizzato a scomparsa per facilitare acquisti desktop in quick-view senza reload.
- `ProductClientView.tsx`: Core engine della Product Page in cui l'utente compila form dinamici su comune, nome defunto e recapiti.
- Altri shared (`Button.tsx`, `Navbar.tsx`, `FAQAccordion.tsx`, `BackgroundSwapper.tsx`).

### /lib
Logica Business condivisa Backend/Frontend e Sorgenti di Verità.
- `products.ts`: Contiene tutto l'hash base dei prodotti in formato ogg/array, da qui Next esporta dati a tutte le rotte. *Le immagini non sono mappate riga per riga manualmente ma chiamano il manifest loader*.
- `imagesManifest.ts`: Adapter che ingloba in memoria il file JSON autogenerato e offre helper veloci ai mapper.
- `municipalities.ts`: Mappatura geo/comuni in un singleton.

### /public
Asset serviti direttamente in HTTPS dai browser (logo, sfondi precalcolati, fonts ecc).
- **`/images/products/`**: Cuore del media manager. Contiene cartelle isolate nominatamente con gli **`slug` esatti** di sistema (es. `/bouquet-di-rose`, `/ricordo-affettuoso`). Ognuna include n-file JPG/WEBP scalati e validi.
- `images-manifest.json`: Generato al volo durante il dev/build server. *Non editarlo a mano.*

### /scripts
Worker e CRON Jobs a singolo rilascio prima della build.
- `generate-images-manifest.mjs`: Entra ricorsivamente negli asset fotografici pulendo doppie estensioni, garantendo path perfetti e identificando alfabeticamente il set `images[]` e in automatico il `coverImage`.

### /utils
Helpers stand-alone senza cicli di vita React.
- `altText.ts`: Il motore globale (AEO/SEO compliance) che builda testi di accessibilità per qualsiasi image tag.
- `dailyImageSet.ts`: Shuffle Algorithm pseudo-randomico basato sula "Data di Oggi", rimescola gli array immagine a disposizione per mantenere fresco il sito tra visite diverse, evitando brutti shift e mismatch client-server durante l'idratazione in React.

---

## 3. Sistemi Chiave e Flussi Custom da Comprendere

### A. Auto Image Manifest Pipeline (Zero Hardcoding)
Per aggiungere immagini a un nuovo prodotto non bisogna scrivere i path `src=""` a mano.
1. Carica le immagini formattate e rinominate nella directory `public/images/products/<slug-prodotto>`.
2. Eseguendo il server Next.js (`npm run dev`) viene lanciato in automatico il file `generate-images-manifest.mjs` grazie allo script npm `predev / prebuild`.
3. Lo script estrae i file limitandosi estensioni valide, esclude le temp dir (`_backup_originals` e folders coi punti `.` iniziali), ordina deterministicamente in modo alfabetico, previene eventuali duplicate filename/estensioni, generando il file JSON.
4. L'App React e il db di `products.ts` si integrano dinamicamente col field `coverImage` isolato come copertina e `images[]` per rotazioni di base e gallerie.
   - *Risultato: Le Card usano `coverImage` performante, la pagina interna fa `Gallery` e random engine.*

### B. Daily Stable Random Engine
Dato un set caricato dal Manifest, `dailyImageSet.ts` non fa banalmente Random, ma istruisce e aggancia un pointer su Base Giornaliera (`getLocalDateKey()`) più un hash unito con lo shift della Mulberry32 Engine. 
- *Perché?* Serve ad evitare che ricaricare o ri-navigare la pagina causi continui fastidiosi refresh di random asset su Next.js, rompendo hydration o infastidendo l'utente per far comparire il prodotto diverso tutti i giorni in Hero. 

### C. Global SEO Alt Text Builder
Nessun Alt viene scritto fisicamente stringa per stringa. Tutte le img inyectano `buildProductAlt(product, { context, municipalityName })` in `altText.ts` elaborando dinamicamente il set.

---

## 4. Come Estendere o Modificare Dati Base

1. **Aggiungere Prodotto Nuovo**
   - Apri `lib/products.ts`, aggiungi object node con nuovo `slug` unico (es. `rosa-eterna`).
   - Crea directory `./public/images/products/rosa-eterna`.
   - Popola con img. 
   - Avvia server. Non c'è nient'altro da fare, la UI andrà a regime.
   
2. **Aggiornare Regole di Styling Globali**
   - Tutta la palette base è incisa in root nel file `app/index.css`. TailWind v4 usa `@theme` per interfacciarsi con var native (es: `--color-fm-cta`).

3. **Modifiche Backend / Gestione Carrello**
   - Seguire architettura Sessionless `localStorage`/`sessionStorage` su custom event window (`cart-added`) che permette un aggiornamento cross-componente ultrareattivo del SideBar Cart senza pesanti store Redux/Zustand o chiamate DB premature (prima del Checkout reale).

---

## 5. Changelog Recenti e Diario Sviluppi

- **Inizio & Setup Base:** Generazione impalcatura premium glassmorfica Next16, AppRouter SSR/CSR layout, Styling Palette definita (Rosa / Panna / Dark).
- **Sessione "Automazione Immagini / SEO Master" [25 Feb 2026]:**
  - Refactor e pulitura massiva della architettura public product dir (folder URLs messi a norma, minuscolo+hyphen).
  - Implementazione centralizzata di `utils/altText.ts` (Dynamic alt mapping contextuale: "Card", "Hover", "Hero").
  - Costruzione dell'intero ecosistema *Auto Map Manifest (`.mjs` prebuild process)* sganciando da `lib/products.ts` le stringhe raw.
  - Fix backward-compat con loader Json (array o objects parsing protetto in ts).
  - Creazione divisione netta tra `coverImage` (in fast-use a livello di Griglie) e `dailyImageSet` Array Shuffle (Riservato a zoom e hero banner rotatori).
  - Aggiunta fall back visivo per evitare Placeholder finti ("Nessuna Immagine" + `console.warn()` se file inattesi o cartella vuota).
  - Debug e Fix compatibilità build Typescript (`process.env.DATABASE_URL || ""` patch in Prisma). 
  - Deploy completato. All green.
- **Sessione "Riequilibrio UI Prodotti & Regole di Checkout" [25 Feb 2026]:**
  - Caricate foto ad alta risoluzione del nuovo prodotto "Bouquet Tributo Eterno" all'interno della route statica per rigenerazione Manifest JSON.
  - Implementazione **Autocomplete** (debounced) per il campo di ricerca "Comune o Cimitero", con fetch dinamico e chiusura intelligente on blur.
  - Ridistribuzione pesi grafici e bilanciamento asimmetrico (45% foto / 55% checkout) della **Product Page**.
  - Consolidamento cloni testuali: estratti dalle due colonne e unificati in una nuova Grid 100% width sottostante per i blocchi "Come funziona" e "Perché Scegliere FloreMoria" (Trust).
  - **Funnel di Checkout Blindato (Accessori):** Aggiunta logica `isBouquet` (booleano). Blocca sia nel Componente Carrello (`/carrello`) che nel Product View l'acquisto stand-alone (senza Bouquet principale) di supplementi come *Lumino* o *Messaggio*.
  - **UX/Badge "Consegna Gratuita":** Introdotta renderizzazione badge condizionale su tutte le Product Card: vibrante e prioritario per i fiori (`Consegna sempre gratuita`), neutro e disincentivante per gli accessori (`Solo con l'ordine di un bouquet`). Testi del calendario in ProductPage parificati alle nuove Policy.
  - Fix stilistici minori: messaggi su due righe per gli hover-toast salva-per-dopo, re-integrazione soft del back button ai cataloghi (freccia azzurra).
- **Sessione "Centralizzazione Supporto & Assistenza Clienti" [Marzo 2026]:**
  - Refactoring e ridenominazione della rotta `/supporto` a `/assistenza`.
  - Aggiornamento Header (`Navbar.tsx`) e Footer (`layout.tsx`) con la nuova voce "Assistenza".
  - Refactoring totale della pagina `app/assistenza/page.tsx` verso SSR, rimuovendo `use client` in favore di markup statico ad alta performance per un'esperienza "Luce e Memoria".
  - Aggiunta form di contatto isolato nel layout e sezione "Garanzia di Trasparenza" sulle due foto WhatsApp prima/dopo consegna, come da strategia Google E-E-A-T.
  - Ricostruzione FAQ native su 2 colonne con tag `<details>` e form iscrizione Newsletter ricorrenze.
  - Integrazione di CTAs (Gold CTA per "Scegli ora", Ghost Button per "Catalogo Completo") strategici che redirigono i clienti sui cataloghi direttamente al fondo dell'assistenza.
  - Aggiunta dati di trasparenza (CEO, Sede, Partita IVA, Nuova e-mail, PEC e Codice Univoco) nel footer isolato della pagina Assistenza.

---

## 6. Memo Pre-Pubblicazione / Deploy
- **[CRITICO] Google Places API Key:** Attualmente il file `.env.local` usa una chiave segnaposto. Prima della build e pubblicazione ufficiale in produzione, **è obbligatorio chiedere all'utente/amministratore la vera API KEY di Google Places** per riattivare la discesa live delle recensioni nel componente `GoogleReviewsBar`. Finché non viene inserita, il sistema utilizza un Fallback sicuro auto-generato.

- **Milestone "Luce e Memoria & Architecture Upgrade" [27 Feb 2026]:**
  - **Design System:** Definito e confermato l'ecosistema "Luce e Memoria" (Bianco Marmo, Oro `fm-gold`, Verde Eucalipto, luci e saturazioni mattutine) per Pulsanti, Font Sizes maggiorati (+20%) e Gallery Layout 1+4.
  - **Dashboard & Roles:** Organizzata struttura per `dashboard.floremoria.com` con ruoli multi-livello definiti (Admin, Dev, Guest, Accountant, User, Florist).
  - **Database:** Shift architetturale e scale-up verso **PostgreSQL** (Cloud-ready) con validazione stringente su schema Prisma (Ordini, Prodotti e Utenti).
  - **Blog Engine / SEO Automation:** Predisposta ossatura di rotte (`/blog`, `/blog/[slug]`) ottimizzate per ricevere espansione e injection tramite automazioni AI.
  - **Checkout Logic & Copywriting:** Rafforzamento del micro-copy emozionale ("Affida il tuo ricordo") e implementazione solida per il multi-gateway transazionale (Stripe, PayPal).
  - **Server-side Filesystem Scanning (Dinamic Mapping):** Implementato script dinamico in `lib/getImages.ts` che monta tramite Node.js `fs.readdirSync` la lettura hardware automatica. 
  - ATTENZIONE: **Tutti i percorsi file/immagini sono mappati obbligatoriamente su `/public/images/products/[slug]/`**. NON caricare foto usando folder name generici o fuori dallo scoped path ufficiale di questo pattern.
  - **Error Logging Evoluto:** Se la directory inesistente, emette un log CRITICO con indirizzo.
  - **Design System Stabile**: Confermato il look and feel "Luce e Memoria". Pulsanti `fm-gold`, typography +20% base e miniature 1+4.
  - **Sessione "Admin Dashboard, Soft-Delete & UI System-Clean" [Marzo 2026]:**
    - **UI/UX Guidelines (Il Modello "Drawer"):** Tutte le interfacce di modifica rapida (es. Prodotti, Fioristi) adottano tassativamente un Drawer laterale (`w-[50vw]`). È severamente vietato l'uso di overlay o backdrop oscuranti, prediligendo un *Seamless Context Switching* che permetta di mantenere la visibilità e interazione sulla tabella dati sottostante. Il tasto "SALVA" globale deve essere posizionato in alto a destra nell'Header del Drawer, in stile System-Clean (Sfondo blu puro, con feedback visivo temporaneo oro "SALVATO" in caso di successo).
    - **Database & Security (Data Retention Policy):** L'intera piattaforma adotta una politica di **Soft-Delete** su tutti i modelli e le entità principali (`Product`, `Partner`, `Category`, `Order`, `Offer`). I record non vengono mai distrutti fisicamente dal database (`prisma.delete` deprecato nei controller); in loro vece, il backend aggiorna il flag `deletedAt = new Date()`. Tutte le endpoint di lettura (`GET`) sono state schermate per filtrare forzatamente ignorando le righe escluse (`where: { deletedAt: null }`).
    - **Asset Sicurezza Frontend:** Il template ammette temporaneamente stringhe di dominio esterne come `images.unsplash.com` inserendole formalmente nella whitelist (array `remotePatterns` di `next.config.ts`), impedendo falle relative a "Unconfigured Host" per mock-up in assenza di webhook in stage.
    - **Moduli Stabilizzati:** Sviluppata e validata la tabella interattiva "Catalogo Prodotti" (con logiche automatiche: priorità di sort dei FIORI sulle tombe rispetto agli accessori/lumini e gestione status in-line). Generata e raffinata la "Gestione Fioristi" (WhatsApp-Ready) includendo CRUD dedicato alla rete partner e Drawer d'ispezione con Route Dinamica al "Dossier Completo" (`/dashboard/fioristi/[id]`), allestito per acquisire file media asincroni via Dropzone Frontend e Webhook WhatsApp Backend.

---

## 7. FONDAMENTA IMMUTABILI E REGOLE DI BUSINESS (Marzo 2026)
*(Da considerare come stato "Stabile" del sistema per tutte le sessioni IA e Dev)*

### 7.1 ARCHITETTURA IDENTIFICATIVI
- **Codici Partner:** Lunghezza fissa 9 caratteri. `FS-[SIGLA_PROV]-[001]` per i fioristi; `FN-[ISO_NAZIONE]-[001]` per i fornitori.
- **Codici Ordine:** Formato `[PREFISSO]-[PROV]-[YY]-[001]`. Prefissi: `FF` (Funerale), `FT` (Tombe), `FA` (Animali), `FP` (Enti).

### 7.2 LOGICA FINANZIARIA (Fonte: CSV "Tabella prezzi e margini FloreMoria")
- **Wholesale Fiorista:** Prezzo fisso d'acquisto basato sulla colonna "Compenso Fiorista" (circa 65% del lordo).
- **Partner Referral:** Commissione 10% (arrotondata per eccesso all'Euro) solo su categoria `FF`. Referral ID attivo: `f067beff-e351-4484-81b2-5b16bdf27801`.
- **Margine Pieno SRL:** Costo fiorista impostato a 0.00€ per: **Lumino**, **Nastro commemorativo** e **Messaggio** (servizi inclusi nel prezzo di vendita).
- **Arrotondamenti:** Fiorista (difetto), Partner (eccesso).

### 7.3 FUNNEL DI CHECKOUT & LOGISTICA
- **Vincoli Orari:** Consegna permessa esclusivamente tra le 09:00 e le 17:00.
- **Lead Time:** Blocco calendario minimo: +48 ore per `FT`; +6 ore lavorative per `FF` (considerando apertura ore 08:00).
- **Integrazione Geografica:** Google Places API attiva per autocompletamento e validazione automatica (Provincia) rigorosamente recintata su Italia (`country: "it"`).
- **UX Abbonamento:** Step 4 "Mantieni vivo il ricordo" con promessa di "2 foto mensili". Opzione "Acquisto Singolo" pre-selezionata di default ("Safe default").

### 7.4 DASHBOARD OVERVIEW (Layout Ibrido)
- **Sezione Operativa (Top):** KPI in tempo reale (Ordini, Margine SRL, % Foto caricate), Heatmap provinciale per densità visiva, Alert ordini critici (< 6h dalla consegna senza foto).
- **Sezione Strategica (Bottom):** Analisi sorgenti traffico (Diretto vs Partner), Tabella debiti provvigionali verso Referral (Liquidazione Mensile), monitoraggio MRR (Monthly Recurring Revenue). All'atto del render, utilizza logica Ibrida (Dati server passati ai grafici Recharts su Client Component).

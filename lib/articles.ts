export interface Article {
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    coverImage: string;
    date: string;
    category: string;
    /** Keywords SEO opzionali (AXEL). */
    keywords?: string[];
}

export const articles: Article[] = [
    {
        slug: 'come-installare-app-floremoria-sullo-smartphone',
        title: 'Come installare FloreMoria sul tuo smartphone (senza scaricare nulla dallo Store)',
        excerpt:
            'Scopri come aggiungere FloreMoria sulla schermata Home del tuo iPhone o Android in 2 semplici passaggi, per un accesso rapido e notifiche sugli ordini.',
        content: `
            <p>Avere la possibilità di accedere in un tap ai propri ordini, ricevere la <strong>conferma fotografica</strong> della consegna direttamente sul telefono o programmare in anticipo un omaggio per un anniversario importante è da oggi ancora più semplice.</p>
            <p>Non serve cercare negli store (App Store o Google Play) o occupare spazio nella memoria del telefono: puoi installare l&apos;<strong>App ufficiale di FloreMoria</strong> direttamente dal tuo browser web grazie alla tecnologia <strong>PWA (Progressive Web App)</strong>.</p>

            <h2>I vantaggi dell&apos;App di FloreMoria</h2>
            <ul>
                <li><strong>Accesso istantaneo:</strong> l&apos;icona di FloreMoria appare direttamente sulla schermata Home, esattamente come una qualsiasi altra applicazione.</li>
                <li><strong>Aggiornamenti e foto in tempo reale:</strong> accedi al tuo pannello per verificare lo stato dell&apos;ordine e visualizzare la foto dell&apos;omaggio floreale consegnato.</li>
                <li><strong>Promemoria ricorrenze:</strong> ricevi notifiche per non dimenticare mai una data o un anniversario importante.</li>
                <li><strong>Zero memoria occupata:</strong> non appesantisce lo smartphone e si aggiorna da sola in automatico.</li>
            </ul>

            <h2>Guida all&apos;installazione su iPhone (iOS / Safari)</h2>
            <p>Se usi un <strong>iPhone</strong>, bastano pochi passaggi dal browser Safari:</p>
            <ol>
                <li>Apri <strong>Safari</strong> e naviga su <a href="https://www.floremoria.com">www.floremoria.com</a>.</li>
                <li>In basso al centro dello schermo, tocca il pulsante <strong>Condividi</strong> (l&apos;icona con il quadrato e la freccia verso l&apos;alto).</li>
                <li>Scorri il menu verso il basso e seleziona <strong>&quot;Aggiungi alla schermata Home&quot;</strong>.</li>
                <li>Tocca <strong>Aggiungi</strong> in alto a destra.</li>
            </ol>
            <figure class="my-10">
                <img src="/images/blog/guida-pwa-iphone.jpg" alt="Guida in due passaggi: installare FloreMoria sulla Home da Safari su iPhone" class="w-full rounded-2xl shadow-sm" width="1200" height="675" />
                <figcaption class="mt-3 text-sm text-fm-muted text-center">Schema pratico per iPhone: Condividi → Aggiungi alla schermata Home.</figcaption>
            </figure>
            <blockquote>
                <p>L&apos;icona di FloreMoria comparirà subito insieme alle altre app sul tuo iPhone.</p>
            </blockquote>

            <h2>Guida all&apos;installazione su Android (Google Chrome)</h2>
            <p>Se possiedi uno smartphone <strong>Android</strong> (Samsung, Xiaomi, Google Pixel, ecc.), la procedura è immediata:</p>
            <ol>
                <li>Apri <strong>Google Chrome</strong> e vai su <a href="https://www.floremoria.com">www.floremoria.com</a>.</li>
                <li>Durante la navigazione, potrebbe comparire in basso un banner con scritto <strong>&quot;Aggiungi FloreMoria alla schermata Home&quot;</strong>; se compare, ti basta toccarlo.</li>
                <li>In alternativa, tocca i <strong>tre pallini in alto a destra</strong> del browser.</li>
                <li>Seleziona la voce <strong>&quot;Aggiungi a schermata Home&quot;</strong> (o <em>Installa applicazione</em>).</li>
                <li>Conferma toccando <strong>Aggiungi</strong>.</li>
            </ol>
            <figure class="my-10">
                <img src="/images/blog/guida-pwa-android.jpg" alt="Guida in due passaggi: installare FloreMoria sulla Home da Chrome su Android" class="w-full rounded-2xl shadow-sm" width="1200" height="675" />
                <figcaption class="mt-3 text-sm text-fm-muted text-center">Schema pratico per Android: menu Chrome → Aggiungi a schermata Home.</figcaption>
            </figure>

            <p>Una volta installata, l&apos;App di FloreMoria ti permette di tornare ai tuoi gesti d&apos;affetto, alle foto di conferma e al Giardino della Memoria con un solo tocco — con la stessa cura discreta del nostro servizio.</p>
        `,
        coverImage: '/images/blog/pwa-install-cover.jpg',
        date: '2026-08-11',
        category: 'Guida e Novità',
        keywords: [
            'app floremoria',
            'pwa floremoria',
            'aggiungi a schermata home',
            'notifiche consegna fiori',
        ],
    },
    {
        slug: 'guida-alla-scelta-dei-fiori-per-ogni-stagione',
        title: 'Guida alla scelta dei fiori per ogni stagione',
        excerpt:
            "Scopri come scegliere i fiori più resistenti e adatti per onorare i tuoi cari in base al periodo dell'anno, dal caldo estivo al freddo invernale.",
        content: `
            <p>Scegliere il fiore giusto non è solo una questione estetica, ma soprattutto di resistenza e significato. Ogni stagione offre fioriture diverse che si adattano al clima, garantendo che il tuo omaggio floreale duri il più a lungo possibile.</p>
            
            <h3>Primavera</h3>
            <p>La primavera è il momento del risveglio. <strong>Gigli, tulipani e narcisi</strong> sono scelte eccellenti. Portano luce e speranza, resistendo bene alle temperature miti tipiche di questo periodo.</p>
            
            <h3>Estate</h3>
            <p>Con il caldo estivo, c'è bisogno di fiori forti che non appassiscano rapidamente sotto il sole. Le <strong>rose</strong>, i <strong>girasoli</strong> e i <strong>crisantemi</strong> sono ideali per sopportare le alte temperature mantenendo i colori vividi.</p>
            
            <h3>Autunno</h3>
            <p>L'autunno chiama a colori caldi e fioriture robuste. I <strong>ciclamini</strong> e le <strong>calendule</strong> sono perfetti per questo periodo, resistendo bene ai primi freddi pur offrendo una profondità cromatica unica.</p>
            
            <h3>Inverno</h3>
            <p>Nei mesi più freddi, la resistenza è la chiave. L'<strong>elleboro (Rosa di Natale)</strong> e i <strong>bucaneve</strong> sbocciano persino sotto la neve, simboleggiando vita e speranza duratura in ogni condizione climatica.</p>
            
            <p>Affidati a FloreMoria per garantirti sempre fiori freschi, selezionati apposta in base alla stagionalità.</p>
        `,
        coverImage: '/images/hero/consegna-fiori-cimitero-home-floremoria.webp',
        date: '2026-03-01',
        category: 'Guide Pratiche',
    },
    {
        slug: 'il-significato-delle-rose-rosse',
        title: 'Il vero significato delle Rose Rosse nel cordoglio',
        excerpt:
            'La rosa rossa non è solo simbolo di amore romantico, ma rappresenta anche un legame eterno e incancellabile.',
        content:
            '<p>Le rose rosse rappresentano il sangue versato e, metaforicamente, un legame puro, intenso e incancellabile. Donarle a un defunto significa esprimere la forza di un sentimento che sopravvive anche dopo la morte.</p>',
        coverImage: '/images/hero/fiori-sulle-tombe-servizio-home-italia.webp',
        date: '2026-02-25',
        category: 'Curiosità',
    },
];

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
    return articles.find((article) => article.slug === slug);
}

export async function getAllArticles(): Promise<Article[]> {
    return [...articles].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
}

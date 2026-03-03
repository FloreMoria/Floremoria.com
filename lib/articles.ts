export interface Article {
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    coverImage: string;
    date: string;
    category: string;
}

export const articles: Article[] = [
    {
        slug: 'guida-alla-scelta-dei-fiori-per-ogni-stagione',
        title: 'Guida alla scelta dei fiori per ogni stagione',
        excerpt: 'Scopri come scegliere i fiori più resistenti e adatti per onorare i tuoi cari in base al periodo dell\'anno, dal caldo estivo al freddo invernale.',
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
        coverImage: '/images/hero/consegna-fiori-cimitero-home-floremoria.webp', // Using a placeholder that we know exists
        date: '2026-03-01',
        category: 'Guide Pratiche'
    },
    {
        slug: 'il-significato-delle-rose-rosse',
        title: 'Il vero significato delle Rose Rosse nel cordoglio',
        excerpt: 'La rosa rossa non è solo simbolo di amore romantico, ma rappresenta anche un legame eterno e incancellabile.',
        content: '<p>Le rose rosse rappresentano il sangue versato e, metaforicamente, un legame puro, intenso e incancellabile. Donarle a un defunto significa esprimere la forza di un sentimento che sopravvive anche dopo la morte.</p>',
        coverImage: '/images/hero/fiori-sulle-tombe-servizio-home-italia.webp',
        date: '2026-02-25',
        category: 'Curiosità'
    }
];

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
    // Simulazione asincrona per un futuro fetch verso dashboard.floremoria.com
    return articles.find(article => article.slug === slug);
}

export async function getAllArticles(): Promise<Article[]> {
    // Simulazione asincrona
    return articles;
}

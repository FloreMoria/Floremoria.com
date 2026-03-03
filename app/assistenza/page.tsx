import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Assistenza e Vicinanza | FloreMoria - Consegna Fiori Cimiteriali',
    description: 'Servizio di assistenza FloreMoria: ricerca loculi, omonimie, consegna fiori a piedi con doppia foto WhatsApp. La tua presenza costante sulla tomba dei tuoi cari.',
    keywords: ['Consegna fiori cimitero Como', 'fiorista locale vicino cimitero', 'prova consegna fiori WhatsApp', 'assistenza lutto S.R.L.']
};

export default function AssistenzaPage() {
    return (
        <div className="space-y-16 lg:space-y-24 pb-12">

            {/* 1. HERO & TITOLO PAGINA */}
            <section className="text-center space-y-6 max-w-4xl mx-auto pt-8 relative">
                {/* Botanical Details: Eucalyptus leaves */}
                <svg className="absolute -top-4 -left-4 md:-left-12 w-24 h-24 text-emerald-600/10 -z-10 rotate-[-15deg]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 7,11.5 7,11.5C7,11.5 10.5,12 14,11.5C17.5,11 17,8 17,8Z" />
                </svg>
                <svg className="absolute top-12 -right-4 md:-right-8 w-32 h-32 text-emerald-700/5 -z-10 rotate-[45deg]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 7,11.5 7,11.5C7,11.5 10.5,12 14,11.5C17.5,11 17,8 17,8Z" />
                </svg>
                <h1 className="text-4xl md:text-[56px] font-display font-bold text-gray-900 leading-tight tracking-wide">
                    Assistenza e Vicinanza
                </h1>
                <p className="text-xl text-fm-muted font-body leading-relaxed max-w-2xl mx-auto">
                    Siamo qui per accompagnarti in ogni passo, con la cura e il rispetto che il tuo pensiero merita.
                </p>
            </section>

            {/* 2. GUIDA IN 3 STEP */}
            <section className="max-w-6xl mx-auto bg-white rounded-[30px] shadow-sm border border-fm-rose-soft/30 p-8 lg:p-16">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
                    {/* Step 1 */}
                    <div className="flex flex-col items-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-fm-gold/10 flex items-center justify-center text-fm-gold">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-display font-bold text-gray-900">Scegli l&apos;omaggio</h3>
                        <p className="text-fm-muted font-body">Seleziona il bouquet o l&apos;accessorio più adatto al tuo messaggio.</p>
                    </div>

                    {/* Step 2 */}
                    <div className="flex flex-col items-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-fm-gold/10 flex items-center justify-center text-fm-gold">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-display font-bold text-gray-900">Personalizza il messaggio</h3>
                        <p className="text-fm-muted font-body">Aggiungi i dati e il tuo pensiero dedicato in fase di checkout.</p>
                    </div>

                    {/* Step 3 */}
                    <div className="flex flex-col items-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-fm-gold/10 flex items-center justify-center text-fm-gold">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-display font-bold text-gray-900">Consegniamo noi</h3>
                        <p className="text-fm-muted font-body">Gestiamo la consegna in chiese, cimiteri o abitazioni in tutta Italia.</p>
                    </div>
                </div>
            </section>

            {/* 2.5 IL TUO PENSIERO, SEMPRE PRESENTE */}
            <section className="max-w-5xl mx-auto space-y-6">
                {/* Pannello Principale: Layout glassmorphism */}
                <div className="bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[40px] p-8 lg:p-14 relative overflow-hidden">
                    {/* Glow Oro Etereo */}
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-fm-gold/10 to-transparent rounded-full blur-3xl -z-10 -mr-40 -mt-40"></div>
                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-emerald-600/5 to-transparent rounded-full blur-3xl -z-10 -ml-20 -mb-20"></div>

                    {/* Header Sezione */}
                    <div className="text-center space-y-5 mb-16 relative z-10">
                        <h2 className="text-3xl md:text-[42px] font-display font-medium text-gray-900 tracking-wide leading-tight">
                            Il tuo pensiero, sempre presente.
                        </h2>
                        <p className="text-xl text-gray-600 font-body max-w-2xl mx-auto leading-relaxed">
                            Documentiamo ogni passaggio per darti la certezza che il tuo amore resti nel tempo.
                        </p>
                    </div>

                    {/* Timeline Orizzontale/Verticale */}
                    <div className="relative z-10 max-w-4xl mx-auto mb-16">
                        {/* Connecting Line */}
                        <div className="absolute left-[39px] md:left-1/4 md:right-1/4 top-16 md:top-8 bottom-12 md:bottom-auto w-0.5 md:w-auto md:h-0.5 border-l-[1.5px] md:border-l-0 md:border-t-[1.5px] border-dashed border-fm-gold/40 z-0"></div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 relative z-10">
                            {/* Step 1: Il Primo Scatto */}
                            <div className="flex flex-row md:flex-col items-start md:items-center text-left md:text-center space-x-6 md:space-x-0 relative">
                                <div className="w-16 h-16 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center shrink-0 md:mb-6 z-10 shadow-fm-gold/10">
                                    {/* Fiore che sboccia */}
                                    <svg className="w-7 h-7 text-fm-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 21.5v-7m0 0a5 5 0 015-5 5 5 0 01-5 5zm0 0a5 5 0 00-5-5 5 5 0 005 5zm0-9a4 4 0 110-8 4 4 0 010 8z" />
                                    </svg>
                                </div>
                                <div className="pt-2 md:pt-0">
                                    <h3 className="text-2xl font-display font-medium text-gray-900 mb-3">Il Primo Scatto:<br className="hidden md:block" /> L&apos;Anima del Gesto</h3>
                                    <p className="text-gray-600 font-body font-light text-lg leading-[1.8] md:px-4">
                                        La tua composizione ultimata in laboratorio: l&apos;eccellenza artigianale catturata nel momento della massima freschezza, pronta per la consegna.
                                    </p>
                                </div>
                            </div>

                            {/* Step 2: Il Secondo Scatto */}
                            <div className="flex flex-row md:flex-col items-start md:items-center text-left md:text-center space-x-6 md:space-x-0 relative">
                                <div className="w-16 h-16 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center shrink-0 md:mb-6 z-10 shadow-fm-gold/10">
                                    <div className="relative flex items-center justify-center">
                                        {/* Luce che brilla */}
                                        <svg className="w-8 h-8 text-fm-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.192 7.071l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414" />
                                            <circle cx="12" cy="12" r="4" strokeWidth="1.2" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="pt-2 md:pt-0">
                                    <h3 className="text-2xl font-display font-medium text-gray-900 mb-3">Il Secondo Scatto:<br className="hidden md:block" /> La Luce del Ricordo</h3>
                                    <p className="text-gray-600 font-body font-light text-lg leading-[1.8] md:px-4">
                                        L&apos;omaggio posato a destinazione. Una testimonianza visiva che unisce i cuori: vedrai che il tuo pensiero precedente ha vegliato ininterrottamente, onorando la memoria fino al nostro ritorno.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* L'Enfasi sulla Veglia Continua */}
                    <div className="bg-fm-eucalyptus/5 lg:w-[85%] mx-auto rounded-[24px] p-8 lg:p-10 border border-fm-eucalyptus/10 text-center shadow-inner relative overflow-hidden mb-12">
                        <svg className="absolute -top-6 -right-6 w-24 h-24 text-fm-eucalyptus/10 rotate-[15deg]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 7,11.5 7,11.5C7,11.5 10.5,12 14,11.5C17.5,11 17,8 17,8Z" />
                        </svg>
                        <h3 className="text-xl md:text-2xl font-display font-medium text-fm-gold mb-3 tracking-wide">La Veglia Continua</h3>
                        <p className="text-gray-700 font-body text-xl md:text-2xl italic font-light leading-relaxed">
                            "FloreMoria non consegna solo fiori, custodisce la tua presenza."
                        </p>
                    </div>

                    {/* La firma del CEO */}
                    <div className="text-center max-w-2xl mx-auto border-t border-gray-100 pt-8 mt-8">
                        <p className="text-gray-600 font-body text-lg italic leading-relaxed mb-4">
                            "Ogni foto che inviamo è la nostra promessa: che il tuo amore sia visto, rispettato e mai lasciato solo."
                        </p>
                        <p className="text-fm-gold font-display font-medium tracking-widest uppercase text-sm">
                            — Salvatore Marsiglione, CEO
                        </p>
                    </div>
                </div>

                {/* CTA Primaria */}
                <div className="pt-8 pb-4 text-center">
                    <Link href="/fiori-sulle-tombe" className="inline-block bg-fm-gold text-white font-medium text-lg rounded-full px-12 py-4 hover:shadow-lg hover:bg-yellow-600 hover:-translate-y-0.5 transition-all duration-300">
                        Scegli ora il tuo omaggio
                    </Link>
                </div>
            </section>

            {/* 3. FAQ ACCORDION */}
            <section className="max-w-4xl mx-auto space-y-8">
                <div className="text-center">
                    <h2 className="text-3xl font-display font-bold text-gray-900">Domande Frequenti</h2>
                </div>
                {/* JSON-LD AEO/GEO Injection per FAQPage */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "FAQPage",
                            "mainEntity": [
                                {
                                    "@type": "Question",
                                    "name": "Non conosco le date esatte di nascita o di morte del mio caro.",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Non preoccuparti. Grazie alla nostra rete e alla collaborazione con i servizi cimiteriali, siamo in grado di individuare la posizione esatta del tuo caro anche senza le date precise. Ci occupiamo noi della ricerca."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Cosa succede se la tomba o il loculo non vengono individuati?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Verifichiamo sempre la posizione corretta prima della consegna. Nel caso remoto in cui fosse impossibile identificare il luogo del riposo, provvederemo immediatamente al rimborso integrale del tuo ordine."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Come gestite i casi di omonimia nello stesso cimitero?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Se riscontriamo più persone con lo stesso nome e cognome, ti contatteremo prontamente con una lista dettagliata per identificare insieme la persona corretta prima di procedere."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Da dove provengono i fiori e come garantite la freschezza?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Selezioniamo i migliori fioristi locali situati nelle immediate vicinanze del cimitero. Questo ci permette di consegnare a piedi, riducendo lo stress per i fiori e garantendo la massima freschezza appena usciti dal laboratorio."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Cosa succede in caso di problemi con la composizione scelta?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "La tua soddisfazione è la nostra missione. Se per qualsiasi motivo i fiori consegnati non rispecchiassero lo standard di qualità o la tipologia scelta, procederemo al rimborso totale dell'ordine senza esitazioni."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Come riceverò la conferma dell'avvenuta consegna?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "La nostra piattaforma ti invierà in tempo reale la testimonianza fotografica del tuo omaggio floreale direttamente su WhatsApp, non appena deposto sulla tomba o nel luogo della cerimonia."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Posso personalizzare il nastro o il biglietto?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Sì, assolutamente. Ogni prodotto dispone di uno spazio dedicato in fase di checkout per scrivere il tuo messaggio personalizzato o richiedere un nastro commemorativo stampato."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Posso consegnare in chiesa o durante il funerale?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Sì, offriamo un servizio dedicato e coordiniamo la consegna direttamente con i responsabili o con gli orari delle cerimonie per garantire la presenza puntuale dei fiori."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Cosa scrivo sul biglietto se non trovo le parole?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Sappiamo quanto sia difficile esprimersi in questi momenti. Per supportarti, offriamo dei suggerimenti di testo delicati e appropriati durante il checkout."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Quali sono i metodi di pagamento accettati?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Accettiamo tutte le principali Carte di Credito, di Debito e PayPal per offrirti sistemi di pagamento crittografati e protetti al 100%."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "I fiori scelti sono stagionali?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Le composizioni e i bouquet sono creati dai fioristi locali e utilizzano fiori freschissimi. Garantiamo sempre la migliore scelta disponibile di stagione nel rispetto della gamma cromatica e dello stile scelto."
                                    }
                                },
                                {
                                    "@type": "Question",
                                    "name": "Offrite abbonamenti per la cura costante?",
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": "Sì, non sarai lasciato solo dopo la prima consegna. Attraverso il nostro 'Calendario della Memoria', offriamo promemoria per le ricorrenze e la possibilità di rinnovare i tuoi omaggi con facilità."
                                    }
                                }
                            ]
                        })
                    }}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 text-left items-start">
                    {/* COLONNA A - Set: Sicurezza e Ricerca */}
                    <div className="space-y-4">
                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Non conosco le date esatte di nascita o di morte del mio caro.</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Non preoccuparti. Grazie alla nostra rete e alla collaborazione con i servizi cimiteriali, siamo in grado di individuare la posizione esatta del tuo caro anche senza le date precise. Ci occupiamo noi della ricerca.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Cosa succede se la tomba o il loculo non vengono individuati?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Verifichiamo sempre la posizione corretta prima della consegna. Nel caso remoto in cui fosse impossibile identificare il luogo del riposo, provvederemo immediatamente al rimborso integrale del tuo ordine.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Come gestite i casi di omonimia nello stesso cimitero?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Se riscontriamo più persone con lo stesso nome e cognome, ti contatteremo prontamente con una lista dettagliata per identificare insieme la persona corretta prima di procedere.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Da dove provengono i fiori e come garantite la freschezza?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Selezioniamo i migliori fioristi locali situati nelle immediate vicinanze del cimitero. Questo ci permette di consegnare a piedi, riducendo lo stress per i fiori e garantendo la massima freschezza appena usciti dal laboratorio.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Cosa succede in caso di problemi con la composizione scelta?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                La tua soddisfazione è la nostra missione. Se per qualsiasi motivo i fiori consegnati non rispecchiassero lo standard di qualità o la tipologia scelta, procederemo al rimborso totale dell'ordine senza esitazioni.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Come riceverò la conferma dell'avvenuta consegna?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                La nostra piattaforma ti invierà in tempo reale la testimonianza fotografica del tuo omaggio floreale direttamente su WhatsApp, non appena deposto sulla tomba o nel luogo della cerimonia.
                            </div>
                        </details>
                    </div>

                    {/* COLONNA B - Set: Scelte e Personalizzazione */}
                    <div className="space-y-4">
                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Posso personalizzare il nastro o il biglietto?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Sì, assolutamente. Ogni prodotto dispone di uno spazio dedicato in fase di checkout per scrivere il tuo messaggio personalizzato o richiedere un nastro commemorativo stampato.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Posso consegnare in chiesa o durante il funerale?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Sì, offriamo un servizio dedicato e coordiniamo la consegna direttamente con i responsabili o con gli orari delle cerimonie per garantire la presenza puntuale dei fiori.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Cosa scrivo sul biglietto se non trovo le parole?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Sappiamo quanto sia difficile esprimersi in questi momenti. Per supportarti, offriamo dei suggerimenti di testo delicati e appropriati durante il checkout.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Quali sono i metodi di pagamento accettati?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Accettiamo tutte le principali Carte di Credito, di Debito e PayPal per offrirti sistemi di pagamento crittografati e protetti al 100%.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">I fiori scelti sono stagionali?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Le composizioni e i bouquet sono creati dai fioristi locali e utilizzano fiori freschissimi. Garantiamo sempre la migliore scelta disponibile di stagione nel rispetto della gamma cromatica e dello stile scelto.
                            </div>
                        </details>

                        <details name="faqGroup" className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300">
                            <summary className="flex items-start md:items-center justify-between cursor-pointer p-6 font-display font-semibold text-lg text-gray-900 list-none select-none">
                                <span className="pr-4 leading-snug">Offrite abbonamenti per la cura costante?</span>
                                <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
                                    <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                    <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                </span>
                            </summary>
                            <div className="p-6 pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed text-[17px]">
                                Sì, non sarai lasciato solo dopo la prima consegna. Attraverso il nostro 'Calendario della Memoria', offriamo promemoria per le ricorrenze e la possibilità di rinnovare i tuoi omaggi con facilità.
                            </div>
                        </details>
                    </div>
                </div>
                <div className="pt-2 text-center">
                    <Link href="/fiori-sulle-tombe" className="inline-block border-2 border-fm-gold text-fm-gold font-medium text-lg rounded-xl px-8 py-3 hover:bg-fm-gold/5 transition-colors">
                        Torna al catalogo completo
                    </Link>
                </div>
            </section>

            {/* 4. CONTATTI E FORM */}
            <section className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">

                {/* Dati Contatto */}
                <div className="space-y-8 flex flex-col justify-center">
                    <div>
                        <h2 className="text-[32px] font-display font-bold text-gray-900 leading-snug">Parla con noi</h2>
                        <p className="text-fm-muted text-lg font-body mt-2">Siamo disponibili tutti i giorni per assisterti.</p>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-fm-gold/10 p-3 rounded-xl text-fm-gold">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm tracking-wider uppercase text-fm-muted font-semibold">Telefono</p>
                                <a href="tel:+393204105305" className="text-xl font-display font-semibold text-gray-900 hover:text-fm-gold transition-colors">+39 320 410 5305</a>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="bg-fm-gold/10 p-3 rounded-xl text-fm-gold">
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm tracking-wider uppercase text-fm-muted font-semibold">WhatsApp</p>
                                <a href="https://wa.me/393204105305" target="_blank" rel="noopener noreferrer" className="text-xl font-display font-semibold text-gray-900 hover:text-fm-gold transition-colors">+39 320 410 5305</a>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="bg-fm-gold/10 p-3 rounded-xl text-fm-gold">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm tracking-wider uppercase text-fm-muted font-semibold">Email</p>
                                <a href="mailto:staff.floremoria@gmail.com" className="text-xl font-display font-semibold text-gray-900 hover:text-fm-gold transition-colors">staff.floremoria@gmail.com</a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Form Contatto */}
                <div className="bg-[#FAF9F6] border border-fm-gold/20 rounded-[30px] p-8 lg:p-12 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-fm-gold/5 rounded-full blur-3xl -z-10 -mr-20 -mt-20"></div>
                    <form className="space-y-6 relative z-10">
                        <div className="mb-8">
                            <h2 className="text-2xl font-display font-medium text-gray-900 mb-2">Condividi con noi la tua richiesta</h2>
                            <p className="text-fm-muted font-body leading-relaxed">
                                Siamo qui per ascoltarti. Che sia un dubbio logistico o un desiderio particolare per il tuo caro, Salvatore e il team di FloreMoria ti risponderanno personalmente.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Il tuo nome</label>
                            <input type="text" className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all" placeholder="Il tuo nome e cognome" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Email</label>
                            <input type="email" className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all" placeholder="La tua email per risponderti" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Come possiamo aiutarti oggi?</label>
                            <textarea className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all min-h-[120px] resize-none" placeholder="Scrivi qui la tua richiesta..."></textarea>
                        </div>
                        <button type="submit" className="w-full bg-fm-gold text-white font-medium text-lg rounded-xl py-4 hover:bg-yellow-600 transition-colors shadow-md">
                            Invia il tuo pensiero
                        </button>
                    </form>
                </div>

            </section>

            {/* Newsletter Ricorrenze */}
            {/* JSON-LD AEO/GEO Injection */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Service",
                        "name": "Promemoria Ricorrenze e Cura dei Fiori",
                        "provider": {
                            "@type": "Organization",
                            "name": "FloreMoria S.R.L."
                        },
                        "description": "Servizio gratuito di FloreMoria per non dimenticare le date importanti e curare i fiori donati.",
                        "serviceType": "Reminder Service",
                        "areaServed": {
                            "@type": "Country",
                            "name": "Italy"
                        }
                    })
                }}
            />
            <section className="max-w-4xl mx-auto bg-fm-gold/10 p-8 lg:p-12 rounded-[30px] border border-fm-gold/20 text-center space-y-6">
                <svg className="w-10 h-10 mx-auto text-fm-gold mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-2xl font-display font-semibold text-gray-900">Il Calendario della Memoria</h3>
                <p className="text-lg text-gray-700 max-w-xl mx-auto font-body">
                    Non lasciare che il tempo offuschi le date importanti. Iscriviti per ricevere un promemoria delicato prima delle ricorrenze dei tuoi cari e consigli sulla cura dei fiori nelle diverse stagioni.
                </p>
                <form className="flex flex-col sm:flex-row max-w-md mx-auto gap-3 pt-2">
                    <input type="email" placeholder="La tua email" className="flex-1 bg-white border border-fm-gold/30 rounded-xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-fm-gold shadow-sm" />
                    <button className="bg-fm-gold text-white font-medium rounded-xl px-8 py-3 hover:bg-yellow-600 transition-colors shadow-md block">
                        Iscriviti
                    </button>
                </form>
            </section>

            {/* 5. FOOTER DATA (E-E-A-T) */}
            <section className="text-center pt-8 border-t border-gray-100 pb-8 tracking-wide">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-6">FLOREMORIA S.R.L.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto text-sm text-gray-500 leading-relaxed text-center sm:text-left md:text-center">
                    <div>
                        <strong className="text-gray-700 block mb-2 uppercase text-xs tracking-wider">Direzione</strong>
                        CEO: Salvatore Marsiglione<br />
                        P.IVA / C.F.: 04188260139
                    </div>
                    <div>
                        <strong className="text-gray-700 block mb-2 uppercase text-xs tracking-wider">Sede e Contatti</strong>
                        Via Bellinzona 82/B, Como<br />
                        Tel: +39 3204105305<br />
                        Email: staff.floremoria@gmail.com
                    </div>
                    <div>
                        <strong className="text-gray-700 block mb-2 uppercase text-xs tracking-wider">Dati Tecnici</strong>
                        PEC: floremoria@pec.it<br />
                        Codice Univoco: K0ROACV
                    </div>
                </div>
            </section>
        </div>
    );
}

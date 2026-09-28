import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { IUBENDA_PRIVACY_URL } from '@/components/legal/IubendaPrivacyEmbed';

export const cookiePolicyMetadata: Metadata = {
    title: 'Cookie Policy | FloreMoria',
    description:
        'Informativa estesa sui cookie e strumenti di tracciamento di FloreMoria (D.Lgs. 196/2003 e Linee Guida Garante Privacy): cookie tecnici di prima parte, cookie floremoria_partner_ref e preferenze.',
    alternates: {
        canonical: 'https://www.floremoria.com/cookie',
    },
};

export const IUBENDA_COOKIE_URL = `${IUBENDA_PRIVACY_URL}/cookie-policy`;
export const IUBENDA_COOKIE_IFRAME_URL = `${IUBENDA_COOKIE_URL}?iframe=true`;

export default function CookiePolicyContent() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 space-y-10">
            <header className="space-y-4">
                <p className="text-xs font-semibold tracking-[0.2em] uppercase text-fm-gold/90">
                    Documenti legali
                </p>
                <h1 className="text-4xl font-display font-bold text-gray-900">Cookie Policy</h1>
                <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">
                    Informativa estesa sull&apos;utilizzo dei cookie e di altri strumenti di tracciamento ai sensi del
                    Provvedimento del Garante per la protezione dei dati personali dell&apos;8 maggio 2014, delle Linee
                    Guida Cookie del 10 giugno 2021, dell&apos;art. 122 del D.Lgs. 196/2003 (Codice Privacy) e del
                    Regolamento UE 2016/679 (GDPR).
                </p>
            </header>

            <section className="prose prose-lg text-gray-700 leading-relaxed max-w-none space-y-6">
                <h2 className="text-xl font-display font-semibold text-gray-900 !mt-0">
                    Cosa sono i cookie
                </h2>
                <p>
                    I cookie sono piccoli file di testo che i siti visitati dall&apos;utente inviano al suo terminale
                    (computer, tablet, smartphone), dove vengono memorizzati per essere poi ritrasmessi agli stessi siti
                    alla successiva visita del medesimo utente. I cookie sono utilizzati per differenti finalità: esecuzione
                    di autenticazioni informatiche, monitoraggio di sessioni, memorizzazione di informazioni su specifiche
                    configurazioni riguardanti gli utenti che accedono al server, memorizzazione delle preferenze o
                    agevolazione della fruizione dei contenuti.
                </p>

                <h2 className="text-xl font-display font-semibold text-gray-900">
                    Cookie Tecnici di Prima Parte (Strettamente Necessari)
                </h2>
                <p>
                    I cookie tecnici sono indispensabili per il corretto funzionamento del sito, per la navigazione sicura,
                    per la gestione del carrello d&apos;acquisto, per l&apos;accesso all&apos;area riservata del Giardino
                    della Memoria e per l&apos;attribuzione operativa e contrattuale dei servizi della rete dei fioristi partner.
                </p>
                <p>
                    <strong>Esenzione dal consenso preventivo:</strong> ai sensi dell&apos;art. 122, comma 1 del D.Lgs.
                    196/2003 e del Provvedimento del Garante Privacy dell&apos;8 maggio 2014 (e relative Linee Guida del 10
                    giugno 2021), l&apos;utilizzo dei cookie tecnici <strong>non richiede il preventivo consenso dell&apos;utente</strong>,
                    in quanto strettamente necessari all&apos;erogazione del servizio espressamente richiesto.
                </p>

                <h3 className="text-lg font-display font-semibold text-gray-900">
                    Scheda descrittiva: Cookie di Sessione Rete Fioristi Partner
                </h3>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 not-prose">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <span className="font-mono text-sm font-bold text-gray-900 bg-gray-100 px-2.5 py-1 rounded">
                            floremoria_partner_ref
                        </span>
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                            Cookie Tecnico / Funzionale
                        </span>
                    </div>

                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                        <div>
                            <dt className="text-xs font-semibold uppercase text-gray-400">Fornitore</dt>
                            <dd className="font-medium text-gray-900">Prima parte (floremoria.com)</dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold uppercase text-gray-400">Tipologia</dt>
                            <dd className="text-gray-700">Cookie Tecnico / Funzionale</dd>
                        </div>
                        <div className="md:col-span-2">
                            <dt className="text-xs font-semibold uppercase text-gray-400">Finalità</dt>
                            <dd className="text-gray-700 leading-relaxed">
                                Necessario alla corretta esecuzione del servizio e all&apos;attribuzione contrattuale della sessione di navigazione
                                originata dalla scansione del QR Code del Fiorista Partner di zona, ai fini del completamento del carrello e della
                                liquidazione della fee convenzionata. Non viene impiegato per finalità di profilazione, marketing o tracciamento
                                comportamentale dell&apos;utente.
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold uppercase text-gray-400">Dati trattati</dt>
                            <dd className="text-gray-700">
                                Identificativo univoco di sessione pseudonimizzato (<code className="text-xs bg-gray-100 px-1 py-0.5 rounded text-gray-800">sessionToken</code>). Nessun dato personale o anagrafico in chiaro.
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold uppercase text-gray-400">Durata</dt>
                            <dd className="text-gray-700">
                                Durata limitata alla sessione di navigazione (si cancella automaticamente al perfezionamento dell&apos;acquisto o alla chiusura del browser).
                            </dd>
                        </div>
                        <div className="md:col-span-2">
                            <dt className="text-xs font-semibold uppercase text-gray-400">Esenzione consenso</dt>
                            <dd className="text-gray-700">
                                Esente da consenso preventivo ai sensi dell&apos;art. 122 del D.lgs. 196/2003 e linee guida Garante Privacy.
                            </dd>
                        </div>
                    </dl>
                </div>

                <h3 className="text-lg font-display font-semibold text-gray-900">
                    Altri Cookie Tecnici di Prima Parte in uso
                </h3>
                <div className="overflow-x-auto not-prose">
                    <table className="w-full text-left text-sm text-gray-600 border border-gray-100 rounded-xl overflow-hidden">
                        <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500 border-b border-gray-100">
                            <tr>
                                <th scope="col" className="px-4 py-3">Nome Cookie</th>
                                <th scope="col" className="px-4 py-3">Tipologia</th>
                                <th scope="col" className="px-4 py-3">Finalità</th>
                                <th scope="col" className="px-4 py-3">Durata</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            <tr>
                                <td className="px-4 py-3 font-mono font-medium text-gray-900">fm_user_role</td>
                                <td className="px-4 py-3">Tecnico / Sicurezza</td>
                                <td className="px-4 py-3">Gestione sessione e autorizzazione ai ruoli applicativi protetti.</td>
                                <td className="px-4 py-3">Sessione / 7 giorni</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3 font-mono font-medium text-gray-900">fm_user_email</td>
                                <td className="px-4 py-3">Tecnico / Sessione</td>
                                <td className="px-4 py-3">Mantenimento sessione autenticata per consultazione Giardino della Memoria.</td>
                                <td className="px-4 py-3">Sessione / 7 giorni</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3 font-mono font-medium text-gray-900">fm_role_expires_at</td>
                                <td className="px-4 py-3">Tecnico / Sicurezza</td>
                                <td className="px-4 py-3">Verifica temporale di validità della sessione utente.</td>
                                <td className="px-4 py-3">Sessione / 7 giorni</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h2 className="text-xl font-display font-semibold text-gray-900">
                    Cookie di Terze Parti e Gestione Preferenze
                </h2>
                <p>
                    Nel corso della navigazione l&apos;utente può ricevere sul suo terminale anche cookie che vengono inviati
                    da siti o da web server diversi (c.d. «terze parti»), sui quali possono risiedere alcuni elementi (quali,
                    ad esempio, immagini, mappe, suoni, specifici link a pagine di altri domini) presenti sul sito che lo
                    stesso sta visitando.
                </p>
                <p>
                    La gestione del consenso e l&apos;elenco dettagliato dei servizi di terze parti (es. Stripe per i pagamenti,
                    Cloudflare, script di misurazione aggregata) sono costantemente aggiornati tramite la piattaforma di
                    consulenza legale <strong>Iubenda</strong>.
                </p>
            </section>

            <section className="space-y-4" aria-labelledby="cookie-iubenda-heading">
                <h2 id="cookie-iubenda-heading" className="text-xl font-display font-semibold text-gray-900">
                    Informativa Completa e Gestione Preferenze (Iubenda)
                </h2>
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                        <a
                            href={IUBENDA_COOKIE_URL}
                            className="iubenda-white iubenda-noiframe iubenda-embed text-fm-gold hover:underline"
                            title="Cookie Policy Iubenda"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Apri Cookie Policy completa su Iubenda
                        </a>
                        <a
                            href={IUBENDA_PRIVACY_URL}
                            className="iubenda-white iubenda-noiframe iubenda-embed text-fm-gold hover:underline"
                            title="Privacy Policy Iubenda"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Apri Privacy Policy Iubenda
                        </a>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                        <iframe
                            title="Cookie Policy FloreMoria — documento legale Iubenda"
                            src={IUBENDA_COOKIE_IFRAME_URL}
                            className="w-full border-0 bg-white"
                            style={{ minHeight: '900px' }}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                        />
                    </div>

                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-2">
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Per configurare o modificare il link &quot;Cookie Policy&quot; nel footer tramite variabile d&apos;ambiente,
                            è possibile utilizzare <code className="rounded bg-white px-1 py-0.5 text-gray-700">NEXT_PUBLIC_LEGAL_COOKIE_URL</code> (vedi <code className="rounded bg-white px-1 py-0.5 text-gray-700">.env.example</code>).
                        </p>
                    </div>
                </div>
            </section>

            <div className="pt-2 text-sm border-t border-gray-100">
                <p className="font-semibold text-gray-700 mb-3">Documenti correlati</p>
                <div className="flex flex-wrap gap-4">
                    <Link href="/privacy" className="text-fm-gold hover:underline">
                        Privacy Policy
                    </Link>
                    <Link href="/termini-condizioni" className="text-fm-gold hover:underline">
                        Termini e Condizioni
                    </Link>
                    <Link href="/eliminazione-dati" className="text-fm-gold hover:underline">
                        Eliminazione dati
                    </Link>
                </div>
            </div>
        </div>
    );
}

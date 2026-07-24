import type { Metadata } from 'next';
import Link from 'next/link';
import IubendaPrivacyEmbed from '@/components/legal/IubendaPrivacyEmbed';

export const privacyPolicyMetadata: Metadata = {
    title: 'Privacy Policy | FloreMoria',
    description:
        'Informativa privacy FloreMoria (GDPR), incluso uso delle Pinterest API, disclaimer di non affiliazione, cancellazione dati alla disconnessione e divieto di rivendita/redistribuzione.',
    alternates: {
        canonical: 'https://www.floremoria.com/privacy',
    },
};

/**
 * Contenuto condiviso /privacy e /privacy-policy.
 * Perché: Pinterest e partner social validano URL nativi sul dominio; header/footer restano dal ConditionalLayout.
 */
export default function PrivacyPolicyContent() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 space-y-10">
            <header className="space-y-4">
                <p className="text-xs font-semibold tracking-[0.2em] uppercase text-fm-gold/90">
                    Documenti legali
                </p>
                <h1 className="text-4xl font-display font-bold text-gray-900">Privacy Policy</h1>
                <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">
                    Informativa sul trattamento dei dati personali ai sensi del Regolamento UE 2016/679 (GDPR) e del
                    D.Lgs. 196/2003 come modificato. Il testo legale completo è generato e aggiornato tramite Iubenda,
                    ed è visualizzato di seguito direttamente su floremoria.com.
                </p>
            </header>

            <section className="prose prose-lg text-gray-700 leading-relaxed max-w-none space-y-4">
                <h2 className="text-xl font-display font-semibold text-gray-900 !mt-0">Titolare del trattamento</h2>
                <p>
                    <strong>FloreMoria S.r.l.</strong> — Via Bellinzona 82/B, 22100 Como (CO) — P.IVA / C.F.
                    04188260139 — REA CO - 426383.
                </p>
                <ul>
                    <li>
                        Email assistenza:{' '}
                        <a href="mailto:assistenza@floremoria.com" className="text-fm-gold hover:underline">
                            assistenza@floremoria.com
                        </a>
                    </li>
                    <li>
                        Email privacy / titolare:{' '}
                        <a href="mailto:staff.floremoria@gmail.com" className="text-fm-gold hover:underline">
                            staff.floremoria@gmail.com
                        </a>
                    </li>
                    <li>
                        PEC:{' '}
                        <a href="mailto:floremoria@pec.it" className="text-fm-gold hover:underline">
                            floremoria@pec.it
                        </a>
                    </li>
                </ul>

                <h2 className="text-xl font-display font-semibold text-gray-900">Finalità principali</h2>
                <p>
                    Trattiamo i dati personali necessari a gestire ordini di omaggi floreali commemorativi, comunicazioni
                    di servizio, area riservata Giardino della Memoria, assistenza clienti e adempimenti di legge. Per
                    dettagli su basi giuridiche, categorie di dati, tempi di conservazione, cookie e diritti
                    dell&apos;interessato (accesso, rettifica, cancellazione, opposizione, reclamo al Garante), consulta
                    il documento Iubenda integrato di seguito.
                </p>
                <p>
                    Per richiedere la cancellazione dei dati personali puoi usare anche la pagina dedicata{' '}
                    <Link href="/eliminazione-dati" className="text-fm-gold hover:underline">
                        Eliminazione dati
                    </Link>
                    .
                </p>

                <h2 className="text-xl font-display font-semibold text-gray-900">
                    Pinterest API / dati derivanti da Pinterest
                </h2>
                <p>
                    FloreMoria utilizza le <strong>Pinterest API</strong> (app ID 1592792) per pubblicare e gestire
                    contenuti promozionali del brand (pin, board e metriche di base) collegati all&apos;account
                    business FloreMoria. L&apos;integrazione serve esclusivamente alle attività di marketing e
                    comunicazione di FloreMoria S.r.l.
                </p>
                <p>
                    <strong>Disclaimer di affiliazione:</strong> FloreMoria S.r.l., il sito{' '}
                    <a href="https://www.floremoria.com" className="text-fm-gold hover:underline">
                        www.floremoria.com
                    </a>{' '}
                    e le relative applicazioni <strong>non sono approvati, sponsorizzati, né affiliati a Pinterest,
                    Inc.</strong> Pinterest® è un marchio di Pinterest, Inc.
                </p>
                <p>
                    <strong>Dati trattati tramite Pinterest API:</strong> token di accesso/refresh dell&apos;account
                    business collegato, identificativi board/pin, metadati di pubblicazione e metriche aggregate
                    rese disponibili dall&apos;API. Non acquisiamo né conserviamo contenuti Pinterest di utenti
                    finali dei servizi commemorativi oltre a quanto necessario all&apos;operatività dell&apos;account
                    business FloreMoria.
                </p>
                <p>
                    <strong>Disconnessione e cancellazione:</strong> quando l&apos;account Pinterest viene
                    disconnesso da FloreMoria (revoca dell&apos;autorizzazione OAuth, rimozione dell&apos;app
                    dall&apos;account Pinterest, o richiesta allo staff), FloreMoria <strong>elimina</strong> i
                    token di accesso/refresh e i dati tecnici di sessione Pinterest memorizzati sui propri sistemi.
                    Eventuali copie di backup residuali sono rimosse secondo i cicli di retention tecnici, senza
                    ulteriore uso operativo. I pin già pubblicati su Pinterest restano sotto il controllo
                    dell&apos;account Pinterest del titolare e possono essere gestiti/eliminati direttamente su
                    Pinterest.
                </p>
                <p>
                    <strong>Nessuna rivendita o redistribuzione:</strong> FloreMoria <strong>non rivende</strong> e{' '}
                    <strong>non redistribuisce</strong> a terzi contenuti Pinterest né dati derivati dalle Pinterest
                    API. Tali dati non vengono ceduti a broker, marketplace di dati o partner non necessari
                    all&apos;esecuzione del servizio tecnico (hosting/infrastruttura), se non ove richiesto dalla
                    legge.
                </p>

                <h2 className="text-xl font-display font-semibold text-gray-900">
                    Pinterest API (English — for platform review)
                </h2>
                <p>
                    FloreMoria uses the <strong>Pinterest API</strong> (app ID 1592792) to publish and manage brand
                    marketing content (pins, boards, and basic metrics) for the FloreMoria business account only.
                </p>
                <p>
                    <strong>Affiliation disclaimer:</strong> FloreMoria S.r.l.,{' '}
                    <a href="https://www.floremoria.com" className="text-fm-gold hover:underline">
                        www.floremoria.com
                    </a>
                    , and related apps are <strong>not endorsed by, sponsored by, or affiliated with Pinterest,
                    Inc.</strong>
                </p>
                <p>
                    <strong>On disconnect:</strong> when a Pinterest account is disconnected from FloreMoria (OAuth
                    revocation, app removal from the Pinterest account, or a request to our staff), FloreMoria{' '}
                    <strong>deletes</strong> stored Pinterest access/refresh tokens and related technical session
                    data from our systems. Residual backups, if any, are purged under our technical retention
                    cycles and are not used operationally thereafter. Pins already published on Pinterest remain
                    under the Pinterest account holder&apos;s control.
                </p>
                <p>
                    <strong>No resale or redistribution:</strong> FloreMoria does <strong>not</strong> sell, resell,
                    or redistribute Pinterest content or Pinterest-derived data to third parties (including data
                    brokers), except where required by law or strictly necessary for infrastructure providers that
                    host our systems under confidentiality obligations.
                </p>
            </section>

            <section className="space-y-4" aria-labelledby="privacy-iubenda-heading">
                <h2 id="privacy-iubenda-heading" className="text-xl font-display font-semibold text-gray-900">
                    Informativa completa (Iubenda)
                </h2>
                <IubendaPrivacyEmbed />
            </section>

            <div className="pt-2 text-sm border-t border-gray-100">
                <p className="font-semibold text-gray-700 mb-3">Documenti correlati</p>
                <div className="flex flex-wrap gap-4">
                    <Link href="/cookie" className="text-fm-gold hover:underline">
                        Cookie Policy
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

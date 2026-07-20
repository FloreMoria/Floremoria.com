import type { Metadata } from 'next';
import Link from 'next/link';
import IubendaPrivacyEmbed from '@/components/legal/IubendaPrivacyEmbed';

export const privacyPolicyMetadata: Metadata = {
    title: 'Privacy Policy | FloreMoria',
    description:
        'Informativa sul trattamento dei dati personali di FloreMoria S.r.l. (GDPR). Documento legale ufficiale Iubenda sul dominio floremoria.com.',
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

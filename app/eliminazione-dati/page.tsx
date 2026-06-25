import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Eliminazione dei dati utente | FloreMoria',
    description:
        'Istruzioni per richiedere la cancellazione dei dati personali trattati da FloreMoria S.r.l., inclusi account, ordini e integrazioni Meta/WhatsApp.',
};

const PRIVACY_URL = 'https://www.iubenda.com/privacy-policy/18115980';

export default function EliminazioneDatiPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 space-y-8">
            <h1 className="text-4xl font-display font-bold text-gray-900">
                Eliminazione dei dati dell&apos;utente
            </h1>

            <div className="prose prose-lg text-gray-700 leading-relaxed max-w-none">
                <p>
                    Questa pagina descrive come gli utenti possono richiedere la cancellazione dei propri dati
                    personali trattati da <strong>FloreMoria S.r.l.</strong> attraverso il sito{' '}
                    <Link href="/" className="text-fm-gold hover:underline">
                        www.floremoria.com
                    </Link>
                    , i servizi collegati (incluso WhatsApp Business / Meta) e l&apos;area riservata Giardino della
                    Memoria.
                </p>
                <p className="text-sm text-gray-500">
                    Ultimo aggiornamento: 25 giugno 2026.
                </p>

                <h2>1. Titolare del trattamento</h2>
                <p>
                    FloreMoria S.r.l. — Via Bellinzona 82/B, 22100 Como (CO) — P.IVA/C.F. 04188260139 — REA CO -
                    426383.
                </p>
                <ul>
                    <li>
                        Email assistenza:{' '}
                        <a href="mailto:assistenza@floremoria.com" className="text-fm-gold hover:underline">
                            assistenza@floremoria.com
                        </a>
                    </li>
                    <li>
                        Email titolare / privacy:{' '}
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

                <h2>2. Come richiedere l&apos;eliminazione</h2>
                <p>Invia una richiesta esplicita di cancellazione dati a uno dei recapiti sopra, indicando:</p>
                <ol>
                    <li>Nome e cognome;</li>
                    <li>Email e/o numero di telefono usati per ordini o accesso all&apos;area riservata;</li>
                    <li>
                        Eventuale numero ordine FloreMoria (es. <code>FF-VR-26-001</code>), se disponibile;
                    </li>
                    <li>Se la richiesta riguarda anche dati trattati via WhatsApp / Meta, indicarlo esplicitamente.</li>
                </ol>
                <p>
                    Oggetto consigliato: <strong>Richiesta eliminazione dati personali — FloreMoria</strong>.
                </p>
                <p>
                    Per completezza, puoi allegare una copia del documento d&apos;identità solo se necessario a
                    verificare la tua identità in caso di dubbio sul titolare della richiesta.
                </p>

                <h2>3. Cosa viene eliminato</h2>
                <p>Salvo obblighi di legge o eccezioni indicate di seguito, provvederemo a cancellare o anonimizzare:</p>
                <ul>
                    <li>Account utente e credenziali di accesso (email, telefono, profilo area riservata);</li>
                    <li>Dati di contatto e preferenze associate al tuo profilo;</li>
                    <li>Avatar e immagini profilo caricati dall&apos;amministrazione, ove applicabile;</li>
                    <li>Storico sessioni e cookie di autenticazione collegati al tuo account;</li>
                    <li>
                        Dati trattati tramite integrazioni Meta/WhatsApp strettamente riconducibili alla tua identità,
                        nei limiti tecnicamente possibili e compatibili con le policy Meta.
                    </li>
                </ul>

                <h2>4. Cosa può essere conservato</h2>
                <p>
                    Alcuni dati possono essere conservati per periodi limitati quando richiesto dalla legge o per tutela
                    dei diritti di FloreMoria, ad esempio:
                </p>
                <ul>
                    <li>Documenti contabili e fiscali relativi a ordini e pagamenti (fino a 10 anni);</li>
                    <li>Log tecnici anonimizzati o aggregati per sicurezza e prevenzione abusi;</li>
                    <li>Prove di consegna già condivise con te e necessarie a gestire contestazioni in corso.</li>
                </ul>

                <h2>5. Tempi di risposta</h2>
                <p>
                    Confermeremo l&apos;avvenuta ricezione entro <strong>7 giorni lavorativi</strong> e completeremo
                    l&apos;eliminazione, di regola, entro <strong>30 giorni</strong> dalla verifica dell&apos;identità,
                    salvo complessità o obblighi normativi che richiedano tempi diversi (ti informeremo in tal caso).
                </p>

                <h2>6. Eliminazione dati Meta / Facebook Login</h2>
                <p>
                    Se hai interagito con FloreMoria tramite prodotti Meta (es. WhatsApp Business, eventuali login o
                    webhook collegati al tuo profilo Meta), puoi richiedere la cancellazione dei dati personali
                    trattati da FloreMoria seguendo la procedura al punto 2. Meta può inoltre gestire richieste
                    indipendenti attraverso i propri strumenti per l&apos;utente; la presente pagina descrive
                    esclusivamente il trattamento svolto da FloreMoria S.r.l.
                </p>

                <h2>7. Diritti aggiuntivi (GDPR)</h2>
                <p>
                    Oltre alla cancellazione, puoi esercitare accesso, rettifica, limitazione, portabilità e opposizione
                    secondo quanto indicato nella nostra{' '}
                    <a href={PRIVACY_URL} className="text-fm-gold hover:underline" rel="noopener noreferrer">
                        Privacy Policy
                    </a>
                    .
                </p>

                <h2>8. Documenti correlati</h2>
                <div className="flex flex-wrap gap-4 not-prose text-sm">
                    <a
                        href={PRIVACY_URL}
                        className="text-fm-gold hover:underline"
                        rel="noopener noreferrer"
                    >
                        Privacy Policy
                    </a>
                    <Link href="/termini-condizioni" className="text-fm-gold hover:underline">
                        Termini e Condizioni
                    </Link>
                    <Link href="/cookie" className="text-fm-gold hover:underline">
                        Cookie Policy
                    </Link>
                    <Link href="/assistenza" className="text-fm-gold hover:underline">
                        Assistenza
                    </Link>
                </div>
            </div>
        </div>
    );
}

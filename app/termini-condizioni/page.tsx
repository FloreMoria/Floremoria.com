import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Termini e Condizioni | FloreMoria',
    description:
        'Termini e condizioni di vendita del servizio FloreMoria per acquisto, consegna e assistenza su omaggi floreali.',
};

export default function TerminiCondizioniPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 space-y-8">
            <h1 className="text-4xl font-display font-bold text-gray-900">Termini e Condizioni</h1>

            <div className="prose prose-lg text-gray-700 leading-relaxed">
                <p>
                    I presenti Termini e Condizioni disciplinano l&apos;uso del sito e l&apos;acquisto dei servizi offerti da
                    FloreMoria S.r.l. tramite piattaforma e-commerce, ai sensi del D.Lgs. 70/2003 (commercio elettronico),
                    del Codice del Consumo (D.Lgs. 206/2005) e della normativa italiana vigente.
                </p>

                <h2>1. Titolare del servizio</h2>
                <p>
                    FloreMoria S.r.l., con sede in Via Bellinzona 82/B, 22100 Como (CO), P.IVA/C.F. 04188260139, REA CO
                    - 426383, email assistenza@floremoria.com, PEC floremoria@pec.it.
                </p>

                <h2>2. Oggetto del servizio</h2>
                <p>
                    FloreMoria offre un servizio digitale di selezione, acquisto e coordinamento della consegna di omaggi
                    floreali e accessori commemorativi presso cimiteri, chiese, camere ardenti e altri luoghi indicati dal
                    cliente, tramite rete di fioristi partner.
                </p>
                <p>
                    Le immagini presenti sul sito hanno valore illustrativo: composizioni, varieta&apos; e tonalita&apos; dei
                    fiori possono variare in base a stagionalita&apos;, disponibilita&apos; locale e sensibilita&apos; professionale del
                    fiorista incaricato, garantendo sempre coerenza con categoria e fascia del prodotto acquistato.
                </p>

                <h2>3. Informazioni precontrattuali e conclusione del contratto</h2>
                <p>
                    Prima dell&apos;invio dell&apos;ordine il cliente visualizza: caratteristiche essenziali del servizio, prezzo
                    totale (comprensivo di eventuali supplementi), dati necessari alla consegna e condizioni applicabili.
                </p>
                <p>
                    Il contratto si considera concluso quando FloreMoria conferma l&apos;ordine e il pagamento risulta
                    autorizzato. FloreMoria puo&apos; contattare il cliente per chiarimenti utili alla corretta esecuzione.
                </p>

                <h2>4. Prezzi, pagamenti e fatturazione</h2>
                <p>
                    I prezzi sono indicati in euro. I pagamenti sono gestiti da provider terzi certificati. FloreMoria non
                    conserva i dati completi delle carte di pagamento.
                </p>
                <p>
                    Eventuali richieste fiscali/documentali devono essere comunicate in fase d&apos;ordine o secondo le
                    modalita&apos; indicate dal supporto clienti.
                </p>

                <h2>5. Esecuzione del servizio e tempi</h2>
                <p>
                    La consegna avviene nella data/fascia richiesta, compatibilmente con orari di accesso, regolamenti dei
                    luoghi di destinazione, condizioni operative e disponibilita&apos; del partner locale.
                </p>
                <p>
                    In caso di impedimenti oggettivi (es. dati incompleti, chiusure straordinarie, restrizioni locali,
                    eventi non prevedibili), FloreMoria concordera&apos; con il cliente una soluzione alternativa equivalente
                    o il rimborso secondo equita&apos; e stato di lavorazione del servizio.
                </p>

                <h2>6. Dati forniti dal cliente</h2>
                <p>
                    Il cliente e&apos; responsabile della correttezza e completezza dei dati inseriti (anagrafica, contatti,
                    luogo di consegna, nominativi commemorativi, messaggi e istruzioni). Errori o omissioni possono
                    incidere sull&apos;esecuzione del servizio.
                </p>

                <h2>7. Diritto di recesso ed eccezioni</h2>
                <p>
                    Ai sensi dell&apos;art. 59 del Codice del Consumo, il diritto di recesso puo&apos; essere escluso, tra gli altri
                    casi, per beni deteriorabili o confezionati su misura/personalizzati e per servizi gia&apos; eseguiti o in
                    corso di esecuzione con accordo del consumatore.
                </p>
                <p>
                    Per la natura del servizio floreale personalizzato e con data certa, richieste di modifica o
                    annullamento sono valutate caso per caso in base allo stato operativo gia&apos; avviato.
                </p>

                <h2>8. Limitazione di responsabilita&apos;</h2>
                <p>
                    FloreMoria risponde della corretta gestione del servizio entro i limiti previsti dalla legge. Non
                    risponde per disservizi derivanti da cause esterne non imputabili (forza maggiore, blocchi logistici,
                    eventi atmosferici eccezionali, provvedimenti delle autorita&apos;, indisponibilita&apos; temporanee delle aree
                    di consegna).
                </p>

                <h2>9. Assistenza clienti e reclami</h2>
                <p>
                    Per assistenza, chiarimenti o reclami: assistenza@floremoria.com e canali indicati nella pagina
                    Assistenza. FloreMoria si impegna a rispondere in tempi congrui e con approccio orientato alla tutela
                    del cliente e alla soluzione concreta del caso.
                </p>

                <h2>10. Privacy e cookie</h2>
                <p>
                    Il trattamento dei dati personali avviene secondo la normativa applicabile e secondo le informative
                    pubblicate nelle pagine Privacy Policy e Cookie Policy del sito.
                </p>

                <h2>11. Legge applicabile e foro competente</h2>
                <p>
                    I presenti Termini sono regolati dalla legge italiana. Per i consumatori resta fermo il foro del luogo
                    di residenza o domicilio del consumatore, ove previsto dalla normativa vigente. Per ogni altra ipotesi,
                    salvo diversa disposizione inderogabile di legge, e&apos; competente il Foro di Como.
                </p>

                <h2>12. Aggiornamenti</h2>
                <p>
                    FloreMoria puo&apos; aggiornare i presenti Termini per esigenze normative, operative o di servizio.
                    L&apos;ultima versione e&apos; sempre disponibile su questa pagina.
                </p>

                <p className="text-sm text-gray-500">
                    Ultimo aggiornamento: 05 maggio 2026.
                </p>
            </div>
        </div>
    );
}

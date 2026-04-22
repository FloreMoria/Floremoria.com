import RecoverForm from './RecoverForm';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Recupera il tuo Giardino Segreto | FloreMoria',
    description: 'Recupera il link univoco per accedere al tuo Giardino della Memoria. Ti verrà inviato comodamente su WhatsApp.'
};

export default function RecoverGardenPage() {
    return (
        <div className="min-h-screen bg-fm-bg flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Sfondo Emotivo */}
            <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-gradient-to-bl from-fm-gold/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-tr from-fm-rose-soft/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>

            <div className="max-w-md w-full space-y-8 relative z-10">
                <div className="text-center">
                    <h2 className="text-3xl md:text-4xl font-display font-medium text-fm-text mb-4">
                        Hai smarrito la strada del tuo Giardino?
                    </h2>
                    <p className="text-lg text-fm-muted font-body leading-relaxed">
                        Nessun problema. Inserisci l'email con cui hai effettuato il tuo ultimo ordine. Il nostro sistema ti invierà in automatico <b>un messaggio WhatsApp</b> col tuo nuovo URL di accesso segreto.
                    </p>
                </div>

                <div className="bg-white/90 backdrop-blur-xl py-10 px-8 lg:px-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] border border-fm-rose-soft/40">
                    <RecoverForm />
                </div>
            </div>
        </div>
    );
}

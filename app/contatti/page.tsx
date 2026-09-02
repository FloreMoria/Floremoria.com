import { Metadata } from 'next';
import Link from 'next/link';
import FloremSocialLinks from '@/components/FloremSocialLinks';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
    title: 'Contatti | FloreMoria',
    description:
        'Contatta FloreMoria per assistenza su consegne floreali commemorative: email assistenza@floremoria.com e WhatsApp +39 320 410 5305.',
};

/**
 * Pagina contatti dedicata — stesso form operativo di /assistenza#contatti.
 */
export default function ContattiPage() {
    return (
        <div className="space-y-10 lg:space-y-14 pb-8 max-w-5xl mx-auto">
            <section className="text-center space-y-4 pt-2">
                <h1 className="text-3xl md:text-[44px] font-display font-bold text-gray-900 leading-tight tracking-wide">
                    Contatti
                </h1>
                <p className="text-base sm:text-lg text-fm-muted font-body leading-relaxed max-w-2xl mx-auto">
                    Scrivici: ti rispondiamo via email e, se preferisci, subito su WhatsApp.
                </p>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-7 lg:gap-10">
                <div className="space-y-5 flex flex-col justify-center">
                    <div>
                        <h2 className="text-[28px] sm:text-[32px] font-display font-bold text-gray-900 leading-snug">
                            Parla con noi
                        </h2>
                        <p className="text-fm-muted text-base sm:text-lg font-body mt-1">
                            Siamo disponibili tutti i giorni per assisterti.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <p className="text-sm tracking-wider uppercase text-fm-muted font-semibold">Telefono</p>
                            <a
                                href="tel:+393204105305"
                                className="text-lg sm:text-xl font-display font-semibold text-gray-900 hover:text-fm-gold transition-colors"
                            >
                                +39 320 410 5305
                            </a>
                        </div>
                        <div>
                            <p className="text-sm tracking-wider uppercase text-fm-muted font-semibold">WhatsApp</p>
                            <a
                                href="https://wa.me/393204105305?text=Salve%20FloreMoria%2C%20vorrei%20ricevere%20informazioni%20e%20assistenza"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-lg sm:text-xl font-display font-semibold text-gray-900 hover:text-fm-gold transition-colors"
                            >
                                +39 320 410 5305
                            </a>
                        </div>
                        <div>
                            <p className="text-sm tracking-wider uppercase text-fm-muted font-semibold">Email</p>
                            <a
                                href="mailto:assistenza@floremoria.com"
                                className="text-lg sm:text-xl font-display font-semibold text-gray-900 hover:text-fm-gold transition-colors"
                            >
                                assistenza@floremoria.com
                            </a>
                        </div>
                        <div>
                            <p className="text-sm tracking-wider uppercase text-fm-muted font-semibold mb-3">Social</p>
                            <FloremSocialLinks variant="onLight" />
                        </div>
                        <p className="text-sm text-fm-muted font-body pt-2">
                            FAQ e guida al servizio:{' '}
                            <Link href="/assistenza" className="text-fm-gold font-semibold hover:underline">
                                Assistenza e Vicinanza
                            </Link>
                        </p>
                    </div>
                </div>

                <div className="bg-[#FAF9F6] border border-fm-gold/20 rounded-[24px] p-5 sm:p-6 lg:p-8 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-fm-gold/5 rounded-full blur-3xl -z-10 -mr-20 -mt-20" />
                    <ContactForm />
                </div>
            </section>
        </div>
    );
}

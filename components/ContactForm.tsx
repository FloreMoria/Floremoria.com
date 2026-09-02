'use client';

import { FormEvent, useState } from 'react';

const WA_PHONE = '393204105305';

type ContactFormProps = {
    /** Titolo sopra i campi — default testo assistenza. */
    title?: string;
    subtitle?: string;
    submitLabel?: string;
    className?: string;
};

/**
 * Form contatti: email a assistenza@ + apertura WhatsApp con testo precompilato.
 */
export default function ContactForm({
    title = 'Condividi con noi la tua richiesta',
    subtitle = 'Siamo qui per ascoltarti. Che sia un dubbio logistico o un desiderio particolare per il tuo caro, Salvatore e il team di FloreMoria ti risponderanno personalmente.',
    submitLabel = 'Invia il tuo pensiero',
    className = '',
}: ContactFormProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [honeypot, setHoneypot] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastWaHref, setLastWaHref] = useState<string | null>(null);

    const buildWhatsAppHref = () => {
        const text = [
            'Buongiorno FloreMoria,',
            `Nome: ${name.trim()}`,
            `Email: ${email.trim()}`,
            phone.trim() ? `Telefono: ${phone.trim()}` : null,
            `Messaggio: ${message.trim()}`,
        ]
            .filter(Boolean)
            .join('\n');
        return `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(text)}`;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (!name.trim() || !email.trim() || !message.trim()) {
            setError('Compila nome, email e messaggio.');
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim(),
                    phone: phone.trim(),
                    message: message.trim(),
                    website: honeypot,
                }),
            });

            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Invio non riuscito.');
            }

            setSuccess(true);

            const waHref = buildWhatsAppHref();
            setLastWaHref(waHref);

            // Esperienza immediata: apre WhatsApp con il testo già formattato
            const wa = window.open(waHref, '_blank', 'noopener,noreferrer');
            if (!wa) {
                window.location.href = waHref;
            }

            setName('');
            setEmail('');
            setPhone('');
            setMessage('');
            setTimeout(() => setSuccess(false), 6000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore di rete. Riprova o scrivici su WhatsApp.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate className={`space-y-4 relative z-10 ${className}`}>
            <div className="mb-5">
                <h2 className="text-xl sm:text-2xl font-display font-medium text-gray-900 mb-2">{title}</h2>
                <p className="text-fm-muted font-body leading-relaxed">{subtitle}</p>
            </div>

            {/* Honeypot anti-spam */}
            <div className="absolute -left-[9999px] opacity-0 h-0 w-0 overflow-hidden" aria-hidden="true">
                <label htmlFor="contact-website">Sito web</label>
                <input
                    id="contact-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                />
            </div>

            <div>
                <label htmlFor="contact-name" className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Il tuo nome
                </label>
                <input
                    id="contact-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all"
                    placeholder="Il tuo nome e cognome"
                    autoComplete="name"
                />
            </div>

            <div>
                <label htmlFor="contact-email" className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Email
                </label>
                <input
                    id="contact-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all"
                    placeholder="La tua email per risponderti"
                    autoComplete="email"
                />
            </div>

            <div>
                <label htmlFor="contact-phone" className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Telefono <span className="normal-case font-normal text-gray-400">(opzionale)</span>
                </label>
                <input
                    id="contact-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all"
                    placeholder="+39 …"
                    autoComplete="tel"
                />
            </div>

            <div>
                <label htmlFor="contact-message" className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Come possiamo aiutarti oggi?
                </label>
                <textarea
                    id="contact-message"
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-white border border-fm-gold/30 rounded-xl px-4 py-3 text-fm-text focus:outline-none focus:ring-2 focus:ring-fm-gold/50 focus:border-fm-gold shadow-sm transition-all min-h-[120px] resize-none"
                    placeholder="Scrivi qui la tua richiesta..."
                />
            </div>

            {error ? (
                <p className="text-sm text-red-600 font-medium" role="alert">
                    {error}
                </p>
            ) : null}

            {success ? (
                <p
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
                    role="status"
                >
                    Messaggio inviato! Ti risponderemo a breve. Se WhatsApp non si è aperto,{' '}
                    <a
                        href={lastWaHref || `https://wa.me/${WA_PHONE}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold"
                    >
                        clicca qui
                    </a>
                    .
                </p>
            ) : null}

            <button
                type="submit"
                disabled={submitting}
                className="w-full bg-fm-gold text-white font-medium text-base sm:text-lg rounded-xl py-3.5 hover:bg-yellow-600 transition-colors shadow-md disabled:opacity-70 disabled:cursor-wait"
            >
                {submitting ? 'Invio in corso…' : submitLabel}
            </button>

            <p className="text-center text-xs text-fm-muted font-body">
                Invieremo la richiesta anche via email e apriremo WhatsApp per una risposta più rapida.
            </p>
        </form>
    );
}

'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2, Mail, MessageCircle, X } from 'lucide-react';

export type GardenSharePanelProps = {
    /** URL univoco del Giardino / bacheca da condividere. */
    gardenUrl: string;
    deceasedName: string;
    senderName?: string;
    /** Layout: bottoni affiancati (default) o colonna. */
    layout?: 'row' | 'stack';
    /** Classi extra sul contenitore bottoni. */
    className?: string;
    /** Variante stile: bacheca utente vs dashboard admin. */
    variant?: 'garden' | 'admin';
    /** Mostra il pulsante WhatsApp (default true). */
    showWhatsApp?: boolean;
    /** Apre subito il modale email (es. da ShareableLinkPanel). */
    openEmailOnMount?: boolean;
    /** Nasconde i pulsanti trigger (solo modale, utile da ShareableLinkPanel). */
    hideActionButtons?: boolean;
};

/**
 * Condivisione Giardino della Memoria Infinita: WhatsApp + Email (modale compatto).
 */
export default function GardenSharePanel({
    gardenUrl,
    deceasedName,
    senderName = '',
    layout = 'row',
    className = '',
    variant = 'garden',
    showWhatsApp = true,
    openEmailOnMount = false,
    hideActionButtons = false,
}: GardenSharePanelProps) {
    const [emailOpen, setEmailOpen] = useState(openEmailOnMount);
    const [recipientEmail, setRecipientEmail] = useState('');
    const [customMessage, setCustomMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const waHref = useMemo(() => {
        const name = deceasedName.trim() || 'un caro';
        const from = senderName.trim();
        const intro = from
            ? `${from} desidera condividere con te il Giardino della Memoria dedicato a ${name}.`
            : `Ti condivido il Giardino della Memoria dedicato a ${name}.`;
        const text = `${intro}\n\n${gardenUrl}`;
        return `https://wa.me/?text=${encodeURIComponent(text)}`;
    }, [deceasedName, gardenUrl, senderName]);

    const btnBase =
        variant === 'admin'
            ? 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors'
            : 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors';

    const waClass =
        variant === 'admin'
            ? `${btnBase} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`
            : `${btnBase} border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50`;

    const mailClass =
        variant === 'admin'
            ? `${btnBase} border-[#c5a880]/50 bg-[#c5a880]/10 text-[#8a7048] hover:bg-[#c5a880]/20`
            : `${btnBase} border-[#c5a880]/40 bg-[#c5a880]/10 text-[#8a7048] hover:bg-[#c5a880]/20`;

    const resetForm = () => {
        setRecipientEmail('');
        setCustomMessage('');
        setError(null);
        setSuccess(null);
    };

    const closeModal = () => {
        setEmailOpen(false);
        resetForm();
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (sending) return;
        setSending(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch('/api/memorial/share-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gardenUrl,
                    deceasedName,
                    senderName,
                    recipientEmail: recipientEmail.trim(),
                    customMessage: customMessage.trim() || undefined,
                }),
            });

            const raw = await res.text();
            let data: { success?: boolean; error?: string; message?: string } = {};
            try {
                data = raw ? (JSON.parse(raw) as typeof data) : {};
            } catch {
                setError(
                    res.status === 413
                        ? 'Richiesta troppo grande. Riprovi con un messaggio più breve.'
                        : `Risposta non valida dal server (HTTP ${res.status}).`
                );
                return;
            }

            if (!res.ok || !data.success) {
                setError(data.error || 'Invio non riuscito.');
                return;
            }

            setSuccess(data.message || 'Email inviata con cura.');
            setRecipientEmail('');
            setCustomMessage('');
            window.setTimeout(() => {
                closeModal();
            }, 1600);
        } catch {
            setError('Errore di rete durante l\'invio. Riprovi tra poco.');
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            {!hideActionButtons ? (
            <div
                className={`flex ${layout === 'stack' ? 'flex-col' : 'flex-col sm:flex-row'} gap-2 ${className}`}
            >
                {showWhatsApp ? (
                    <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={waClass}
                    >
                        <MessageCircle size={13} />
                        WhatsApp
                    </a>
                ) : null}
                <button type="button" onClick={() => setEmailOpen(true)} className={mailClass}>
                    <Mail size={13} />
                    Invia via Email
                </button>
            </div>
            ) : null}

            {emailOpen ? (
                <div
                    className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="garden-share-email-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !sending) closeModal();
                    }}
                >
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-[#eadfce] overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eadfce] bg-[#faf7f2]">
                            <div>
                                <p
                                    id="garden-share-email-title"
                                    className="text-sm font-semibold text-[#1a1510]"
                                >
                                    Invia via Email
                                </p>
                                <p className="text-[11px] text-[#7a7164] mt-0.5">
                                    Condividi il Giardino della Memoria con discrezione
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                disabled={sending}
                                className="p-1.5 rounded-lg text-[#7a7164] hover:bg-white/80"
                                aria-label="Chiudi"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
                            <div>
                                <label
                                    htmlFor="garden-share-recipient"
                                    className="block text-[11px] font-bold uppercase tracking-wider text-[#7a7164] mb-1.5"
                                >
                                    Email del destinatario
                                </label>
                                <input
                                    id="garden-share-recipient"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={recipientEmail}
                                    onChange={(e) => setRecipientEmail(e.target.value)}
                                    placeholder="nome@esempio.com"
                                    className="w-full rounded-xl border border-[#eadfce] bg-white px-3 py-2.5 text-sm text-[#1a1510] placeholder:text-[#b0a698] focus:outline-none focus:ring-2 focus:ring-[#c5a880]/40"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="garden-share-message"
                                    className="block text-[11px] font-bold uppercase tracking-wider text-[#7a7164] mb-1.5"
                                >
                                    Messaggio personale{' '}
                                    <span className="font-normal normal-case tracking-normal">
                                        (facoltativo)
                                    </span>
                                </label>
                                <textarea
                                    id="garden-share-message"
                                    rows={3}
                                    maxLength={1000}
                                    value={customMessage}
                                    onChange={(e) => setCustomMessage(e.target.value)}
                                    placeholder="Un pensiero breve da accompagnare all'invito…"
                                    className="w-full rounded-xl border border-[#eadfce] bg-white px-3 py-2.5 text-sm text-[#1a1510] placeholder:text-[#b0a698] focus:outline-none focus:ring-2 focus:ring-[#c5a880]/40 resize-none"
                                />
                            </div>

                            {error ? (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                    {error}
                                </p>
                            ) : null}
                            {success ? (
                                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                                    {success}
                                </p>
                            ) : null}

                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={sending}
                                    className="flex-1 rounded-xl border border-[#eadfce] px-3 py-2.5 text-xs font-semibold text-[#5c5346] hover:bg-[#faf7f2]"
                                >
                                    Annulla
                                </button>
                                <button
                                    type="submit"
                                    disabled={sending || !recipientEmail.trim()}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1a1510] text-white px-3 py-2.5 text-xs font-semibold hover:bg-[#2c2416] disabled:opacity-50 border-b-2 border-[#c5a880]"
                                >
                                    {sending ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Invio…
                                        </>
                                    ) : (
                                        <>
                                            <Mail size={14} />
                                            Invia
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </>
    );
}
